import json
import threading
import time
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import api
import serve

CONTRACT_FIXTURES = Path(__file__).resolve().parents[2] / "contract" / "fixtures"


CURRENT_MODEL_VERSION = api.load_model_version("model/ra_screening_model.json")


def signed_url(name="a.jpg"):
    return f"https://project.supabase.co/storage/v1/object/sign/bucket/{name}?token=x"


class FakeCropper:
    def close(self):
        pass


class FakeResult:
    def __init__(self, result):
        self.result = result

    def to_dict(self):
        return self.result


class FakeService:
    cropper = FakeCropper()

    def __init__(self, results, delay=0):
        self.results = iter(results)
        self.delay = delay
        self.active_predictions = 0
        self.max_active_predictions = 0
        self.lock = threading.Lock()

    def predict_from_image(self, image):
        with self.lock:
            self.active_predictions += 1
            self.max_active_predictions = max(self.max_active_predictions, self.active_predictions)
        try:
            if self.delay:
                time.sleep(self.delay)
            return FakeResult(next(self.results))
        finally:
            with self.lock:
                self.active_predictions -= 1


class FakeResponse:
    def __init__(self, status_code=200, content_type="image/jpeg", content=b"", headers=None):
        self.status_code = status_code
        self.headers = {"Content-Type": content_type, **(headers or {})}
        self.content = content

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def iter_content(self, chunk_size):
        for index in range(0, len(self.content), chunk_size):
            yield self.content[index:index + chunk_size]


def hand_result(detected=11, positives=0, detected_ra=False):
    return {
        "ra_detected": detected_ra,
        "hand_probability": 0.48 if detected_ra else 0.42,
        "num_positive_joints": positives,
        "num_joints_detected": detected,
        "joints": [],
        "warnings": [] if detected else ["No hand detected in image."],
    }


def make_app(
    monkeypatch,
    results=(hand_result(),),
    download=None,
    delay=0,
    manifest_path="model/ra_screening_model.json",
    checkpoint_path="model/ra_screening_model.json",
):
    # Startup requires the checkpoint path to exist. Tests fake the service, so
    # they must not depend on ra_screening_model.pt, which is not stored in git.
    settings = api.Settings(
        "test-key",
        frozenset({"project.supabase.co"}),
        checkpoint_path=str(checkpoint_path),
        model_manifest_path=str(manifest_path),
    )
    service = FakeService(results, delay=delay)
    monkeypatch.setattr(api, "download_signed_image", download or (lambda _: Image.new("RGB", (100, 100))))
    return api.create_app(lambda: settings, lambda _: service), service


def request_payload(*images):
    return {"images": [{"side": side, "image_url": signed_url(name)} for side, name in images]}


def test_ra_screening_requires_key(monkeypatch):
    app, _ = make_app(monkeypatch)
    with TestClient(app) as client:
        response = client.post("/v1/ra-screening", json=request_payload(("left", "left.jpg")))
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"
    assert "model_version" not in response.json()


def test_health_uses_cloud_run_safe_path(monkeypatch):
    app, _ = make_app(monkeypatch)
    with TestClient(app) as client:
        response = client.get("/health")
        reserved_response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert reserved_response.status_code == 404


def test_one_hand_returns_the_aggregate_shape(monkeypatch):
    app, _ = make_app(monkeypatch, results=(hand_result(positives=2, detected_ra=True),))
    with TestClient(app) as client:
        response = client.post(
            "/v1/ra-screening", headers={"Authorization": "Bearer test-key"},
            json=request_payload(("left", "left.jpg")),
        )
    assert response.status_code == 200
    assert response.json()["model_version"] == CURRENT_MODEL_VERSION
    assert response.json()["hands"][0]["side"] == "left"
    assert response.json()["ra_detected"] is True
    assert response.json()["total_positive_joints"] == 2
    assert "image_url" not in response.text


@pytest.mark.parametrize("sides", [("left",), ("right", "left")])
def test_inference_ms_excludes_download_and_lock_wait(monkeypatch, sides):
    clock = [0.0]

    def download(_):
        clock[0] += 10
        return Image.new("RGB", (100, 100))

    class WaitingLock:
        def __enter__(self):
            clock[0] += 20

        def __exit__(self, *_):
            clock[0] += 30

    app, service = make_app(monkeypatch, download=download)

    def predict(image):
        clock[0] += 0.125
        return FakeResult(hand_result())

    monkeypatch.setattr(service, "predict_from_image", predict)
    monkeypatch.setattr(api, "time", SimpleNamespace(perf_counter=lambda: clock[0]))
    with TestClient(app) as client:
        app.state.inference_lock = WaitingLock()
        response = client.post(
            "/v1/ra-screening", headers={"Authorization": "Bearer test-key"},
            json=request_payload(*[(side, f"{side}.jpg") for side in sides]),
        )
    assert response.status_code == 200
    assert type(response.json()["inference_ms"]) is int
    assert response.json()["inference_ms"] == 125 * len(sides)


def test_request_and_response_are_logged_with_signed_url(monkeypatch):
    events = []
    monkeypatch.setattr(api, "log_event", lambda event, **fields: events.append({"event": event, **fields}))
    app, _ = make_app(monkeypatch, results=(hand_result(positives=2, detected_ra=True),))
    url = signed_url("sensitive-image-name.jpg")
    with TestClient(app) as client:
        response = client.post(
            "/v1/ra-screening", headers={"Authorization": "Bearer test-key"},
            json={"images": [{"side": "left", "image_url": url}]},
        )

    assert response.status_code == 200
    request_event = next(event for event in events if event["event"] == "ra_screening_request")
    response_event = next(event for event in events if event["event"] == "ra_screening_response")
    assert request_event["request"] == {
        "images": [{"side": "left", "image_url": url}],
    }
    assert response_event["response"] == response.json()
    assert response_event["model_version"] == CURRENT_MODEL_VERSION


def test_two_hands_preserve_order_and_aggregate(monkeypatch):
    app, _ = make_app(monkeypatch, results=(
        hand_result(positives=1, detected_ra=False),
        hand_result(positives=3, detected_ra=True),
    ))
    with TestClient(app) as client:
        response = client.post(
            "/v1/ra-screening", headers={"Authorization": "Bearer test-key"},
            json=request_payload(("right", "right.jpg"), ("left", "left.jpg")),
        )
    assert response.status_code == 200
    body = response.json()
    assert body["model_version"] == CURRENT_MODEL_VERSION
    assert [hand["side"] for hand in body["hands"]] == ["right", "left"]
    assert body["ra_detected"] is True
    assert body["total_positive_joints"] == 4


@pytest.mark.parametrize("payload", [
    {},
    {"image_url": signed_url()},
    {"images": []},
    request_payload(("left", "1.jpg"), ("left", "2.jpg")),
    {"images": [{"side": "middle", "image_url": signed_url()}]},
    request_payload(("left", "1.jpg"), ("right", "2.jpg"), ("left", "3.jpg")),
])
def test_invalid_screening_shapes_are_rejected(monkeypatch, payload):
    app, _ = make_app(monkeypatch)
    with TestClient(app) as client:
        response = client.post("/v1/ra-screening", headers={"Authorization": "Bearer test-key"}, json=payload)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_REQUEST"
    assert "model_version" not in response.json()


def test_old_endpoint_is_removed(monkeypatch):
    app, _ = make_app(monkeypatch)
    with TestClient(app) as client:
        response = client.post("/v1/predict", headers={"Authorization": "Bearer test-key"}, json={"image_url": signed_url()})
    assert response.status_code == 404


def test_side_specific_download_error_returns_no_partial_result(monkeypatch):
    def download(url):
        if "right.jpg" in url:
            raise api.APIError(502, "IMAGE_FETCH_FAILED", "Could not retrieve the image.")
        return Image.new("RGB", (100, 100))

    app, _ = make_app(monkeypatch, results=(hand_result(),), download=download)
    with TestClient(app) as client:
        response = client.post(
            "/v1/ra-screening", headers={"Authorization": "Bearer test-key"},
            json=request_payload(("left", "left.jpg"), ("right", "right.jpg")),
        )
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "IMAGE_FETCH_FAILED"
    assert response.json()["error"]["side"] == "right"
    assert "hands" not in response.json()
    assert "model_version" not in response.json()


def test_no_hand_error_identifies_which_side(monkeypatch):
    app, _ = make_app(monkeypatch, results=(hand_result(), hand_result(detected=0)))
    with TestClient(app) as client:
        response = client.post(
            "/v1/ra-screening", headers={"Authorization": "Bearer test-key"},
            json=request_payload(("left", "left.jpg"), ("right", "right.jpg")),
        )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "NO_HAND_DETECTED"
    assert response.json()["error"]["side"] == "right"
    assert "hands" not in response.json()
    assert "model_version" not in response.json()


def test_missing_checkpoint_prevents_startup(monkeypatch, tmp_path):
    app, _ = make_app(monkeypatch, checkpoint_path=tmp_path / "missing.pt")
    with pytest.raises(FileNotFoundError, match="not stored in git"):
        with TestClient(app):
            pass


def test_from_checkpoint_requires_a_local_weight_file(tmp_path):
    with pytest.raises(FileNotFoundError, match="not stored in git"):
        serve.RAScreeningService.from_checkpoint(str(tmp_path / "missing.pt"))


def test_missing_model_manifest_prevents_startup(monkeypatch, tmp_path):
    app, _ = make_app(monkeypatch, manifest_path=tmp_path / "missing.json")
    with pytest.raises(RuntimeError, match="Model manifest is missing"):
        with TestClient(app):
            pass


@pytest.mark.parametrize(
    ("manifest_content", "error"),
    [
        ("{", "Model manifest is invalid JSON"),
        ("{}", "non-empty model_version"),
        ('{"model_version": ""}', "non-empty model_version"),
    ],
)
def test_invalid_model_manifest_prevents_startup(monkeypatch, tmp_path, manifest_content, error):
    manifest_path = tmp_path / "model.json"
    manifest_path.write_text(manifest_content, encoding="utf-8")
    app, _ = make_app(monkeypatch, manifest_path=manifest_path)
    with pytest.raises(RuntimeError, match=error):
        with TestClient(app):
            pass


def test_model_manifest_allows_an_arbitrary_nonempty_version(tmp_path):
    manifest_path = tmp_path / "model.json"
    manifest_path.write_text('{"model_version": "研究室提供モデル / 2026-10"}', encoding="utf-8")
    assert api.load_model_version(str(manifest_path)) == "研究室提供モデル / 2026-10"


def test_two_images_download_in_parallel_and_infer_in_order(monkeypatch):
    barrier = threading.Barrier(2, timeout=2)
    download_threads = []

    def download(_):
        download_threads.append(threading.get_ident())
        barrier.wait()
        return Image.new("RGB", (100, 100))

    app, service = make_app(monkeypatch, results=(hand_result(), hand_result()), download=download, delay=0.03)
    with TestClient(app) as client:
        response = client.post(
            "/v1/ra-screening", headers={"Authorization": "Bearer test-key"},
            json=request_payload(("left", "left.jpg"), ("right", "right.jpg")),
        )
    assert response.status_code == 200
    assert len(set(download_threads)) == 2
    assert service.max_active_predictions == 1


@pytest.mark.parametrize(
    ("response", "code", "reason"),
    [
        (FakeResponse(status_code=302), "IMAGE_FETCH_FAILED", "redirect_not_allowed"),
        (FakeResponse(content_type="text/plain"), "UNSUPPORTED_IMAGE_TYPE", "unsupported_content_type"),
        (
            FakeResponse(headers={"Content-Length": str(api.MAX_IMAGE_BYTES + 1)}),
            "IMAGE_TOO_LARGE",
            "content_length_exceeded",
        ),
        (FakeResponse(content=b"not an image"), "INVALID_IMAGE", "image_decode_failed"),
    ],
)
def test_download_errors_are_mapped_with_diagnostics(monkeypatch, response, code, reason):
    monkeypatch.setattr(api.requests, "get", lambda *_, **__: response)
    with pytest.raises(api.APIError) as error:
        api.download_signed_image(signed_url())
    assert error.value.code == code
    assert error.value.diagnostic["reason"] == reason


def test_download_timeout_is_mapped(monkeypatch):
    def timeout(*_, **__):
        raise api.requests.Timeout()

    monkeypatch.setattr(api.requests, "get", timeout)
    with pytest.raises(api.APIError) as error:
        api.download_signed_image(signed_url())
    assert error.value.code == "IMAGE_FETCH_TIMEOUT"
    assert error.value.diagnostic == {
        "reason": "request_timeout",
        "error_type": "Timeout",
    }


def test_download_failure_logs_diagnostic(monkeypatch):
    events = []
    monkeypatch.setattr(api, "log_event", lambda event, **fields: events.append({"event": event, **fields}))

    def download(_):
        raise api.APIError(
            502,
            "IMAGE_FETCH_FAILED",
            "Could not retrieve the image.",
            diagnostic={"reason": "unexpected_http_status", "http_status": 403},
        )

    app, _ = make_app(monkeypatch, download=download)
    url = signed_url("expired.jpg")
    with TestClient(app) as client:
        response = client.post(
            "/v1/ra-screening",
            headers={"Authorization": "Bearer test-key"},
            json={"images": [{"side": "right", "image_url": url}]},
        )

    assert response.status_code == 502
    download_event = next(event for event in events if event["event"] == "image_download_failed")
    assert download_event == {
        "event": "image_download_failed",
        "request_id": download_event["request_id"],
        "side": "right",
        "image_url": url,
        "diagnostic": {"reason": "unexpected_http_status", "http_status": 403},
    }


def test_signed_url_accepts_local_supabase(monkeypatch):
    hosts = frozenset({"127.0.0.1", "project.supabase.co"})
    api.validate_signed_url(
        "http://127.0.0.1:54321/storage/v1/object/sign/hand-images/a.jpg?token=x",
        hosts,
    )
    api.validate_signed_url(signed_url(), hosts)


@pytest.mark.parametrize(
    ("url", "reason"),
    [
        (
            "http://project.supabase.co/storage/v1/object/sign/bucket/a.jpg?token=x",
            "scheme_not_allowed",
        ),
        (
            "https://other.supabase.co/storage/v1/object/sign/bucket/a.jpg?token=x",
            "host_not_allowed",
        ),
        (
            "https://project.supabase.co/storage/v1/object/public/bucket/a.jpg?token=x",
            "signed_object_path_required",
        ),
        (
            "https://project.supabase.co/storage/v1/object/sign/bucket/a.jpg",
            "missing_signed_token",
        ),
    ],
)
def test_signed_url_rejects_non_contract_locations(url, reason):
    with pytest.raises(api.APIError) as error:
        api.validate_signed_url(url, frozenset({"project.supabase.co"}))
    assert error.value.code == "INVALID_REQUEST"
    assert error.value.diagnostic["reason"] == reason


def test_signed_url_validation_failure_logs_diagnostic(monkeypatch):
    events = []
    monkeypatch.setattr(api, "log_event", lambda event, **fields: events.append({"event": event, **fields}))
    app, _ = make_app(monkeypatch)
    url = "https://other.supabase.co/storage/v1/object/sign/bucket/a.jpg?token=x"

    with TestClient(app) as client:
        response = client.post(
            "/v1/ra-screening",
            headers={"Authorization": "Bearer test-key"},
            json={"images": [{"side": "left", "image_url": url}]},
        )

    assert response.status_code == 422
    validation_event = next(
        event for event in events if event["event"] == "image_url_validation_failed"
    )
    assert validation_event["side"] == "left"
    assert validation_event["image_url"] == url
    assert validation_event["diagnostic"] == {
        "reason": "host_not_allowed",
        "hostname": "other.supabase.co",
        "allowed_hosts": ["project.supabase.co"],
    }


def test_success_response_matches_contract_fixture(monkeypatch):
    fixture = json.loads((CONTRACT_FIXTURES / "success-both-hands.json").read_text())
    results = [
        {key: hand[key] for key in hand if key != "side"}
        for hand in fixture["hands"]
    ]
    app, _ = make_app(monkeypatch, results=results)
    with TestClient(app) as client:
        response = client.post(
            "/v1/ra-screening",
            headers={"Authorization": "Bearer test-key"},
            json=request_payload(("left", "left.jpg"), ("right", "right.jpg")),
        )
    assert response.status_code == 200
    body = response.json()
    assert body["hands"] == fixture["hands"]
    assert body["ra_detected"] == fixture["ra_detected"]
    assert body["total_positive_joints"] == fixture["total_positive_joints"]


def test_no_hand_error_matches_contract_fixture(monkeypatch):
    fixture = json.loads((CONTRACT_FIXTURES / "error-no-hand-detected.json").read_text())
    app, _ = make_app(monkeypatch, results=(hand_result(detected=0),))
    with TestClient(app) as client:
        response = client.post(
            "/v1/ra-screening",
            headers={"Authorization": "Bearer test-key"},
            json=request_payload(("left", "left.jpg")),
        )
    assert response.status_code == 422
    assert response.json()["error"] == fixture["error"]
