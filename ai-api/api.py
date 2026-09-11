"""HTTP adapter for the delivered RA screening inference module.

This module deliberately keeps model preprocessing and inference in ``serve.py``.
It only owns HTTP authentication, safe signed-URL retrieval, and API errors.
"""

from __future__ import annotations

import hmac
import io
import json
import logging
import os
import sys
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Callable, Literal
from urllib.parse import parse_qs, urlparse

import requests
import torch
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field, model_validator

from serve import RAScreeningService, require_checkpoint_file

MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000
CONNECT_TIMEOUT_SECONDS = 5
READ_TIMEOUT_SECONDS = 20
SIGNED_OBJECT_PATH_PREFIX = "/storage/v1/object/sign/"
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png"}
LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost"})
LOOPBACK_PORTS = frozenset({None, 80, 443, 54321})
PUBLIC_PORTS = frozenset({None, 443})

logger = logging.getLogger("ra_api")


def configure_logging() -> None:
    """Emit one JSON object per line so Cloud Logging keeps application events."""
    logger.setLevel(logging.INFO)
    if logger.handlers:
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
    logger.propagate = False


def log_event(event: str, **fields: object) -> None:
    """Write structured application logs without API keys or image contents."""
    logger.info(json.dumps({"event": event, **fields}, ensure_ascii=False, default=str))


class APIError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        side: str | None = None,
        diagnostic: dict[str, object] | None = None,
    ) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        self.side = side
        self.diagnostic = diagnostic
        super().__init__(message)


@dataclass(frozen=True)
class Settings:
    api_key: str
    supabase_storage_hosts: frozenset[str]
    checkpoint_path: str = "model/ra_screening_model.pt"
    model_manifest_path: str = "model/ra_screening_model.json"

    @classmethod
    def from_env(cls) -> "Settings":
        api_key = os.environ.get("AI_API_KEY", "")
        raw_hosts = os.environ.get("SUPABASE_STORAGE_HOSTS", "")
        hosts = frozenset(host.strip().lower() for host in raw_hosts.split(",") if host.strip())
        if not api_key:
            raise RuntimeError("AI_API_KEY must be set")
        if not hosts:
            raise RuntimeError("SUPABASE_STORAGE_HOSTS must contain at least one host")
        return cls(api_key=api_key, supabase_storage_hosts=hosts)


class ScreeningImage(BaseModel):
    side: Literal["left", "right"]
    image_url: str


class ScreeningRequest(BaseModel):
    images: list[ScreeningImage] = Field(min_length=1, max_length=2)

    @model_validator(mode="after")
    def sides_are_unique(self) -> "ScreeningRequest":
        if len({image.side for image in self.images}) != len(self.images):
            raise ValueError("Each side may appear only once.")
        return self


def error_response(error: APIError, request_id: str | None = None) -> JSONResponse:
    return JSONResponse(status_code=error.status_code, content=error_body(error, request_id))


def error_body(error: APIError, request_id: str | None = None) -> dict[str, object]:
    body: dict[str, object] = {"error": {"code": error.code, "message": error.message}}
    if error.side is not None:
        body["error"]["side"] = error.side
    if request_id:
        body["request_id"] = request_id
    return body


def is_authorized(authorization: str, api_key: str) -> bool:
    expected = f"Bearer {api_key}"
    if len(authorization) != len(expected):
        return False
    return hmac.compare_digest(authorization, expected)


def validate_signed_url(url: str, allowed_hosts: frozenset[str]) -> None:
    def invalid(reason: str, **details: object) -> APIError:
        return APIError(
            422,
            "INVALID_REQUEST",
            "image_url must be a Supabase signed object URL.",
            diagnostic={"reason": reason, **details},
        )

    try:
        parsed = urlparse(url)
        hostname = parsed.hostname.lower() if parsed.hostname else None
    except ValueError as exc:
        raise invalid("invalid_url", parse_error=str(exc)) from exc

    if hostname is None:
        raise invalid("missing_hostname")
    if hostname not in allowed_hosts:
        raise invalid(
            "host_not_allowed",
            hostname=hostname,
            allowed_hosts=sorted(allowed_hosts),
        )

    loopback = hostname in LOOPBACK_HOSTS
    allowed_schemes = {"http", "https"} if loopback else {"https"}
    allowed_ports = LOOPBACK_PORTS if loopback else PUBLIC_PORTS
    if parsed.scheme not in allowed_schemes:
        raise invalid(
            "scheme_not_allowed",
            scheme=parsed.scheme or None,
            allowed_schemes=sorted(allowed_schemes),
        )
    if parsed.username is not None or parsed.password is not None:
        raise invalid("embedded_credentials_not_allowed")
    try:
        port = parsed.port
    except ValueError as exc:
        raise invalid("invalid_port", parse_error=str(exc)) from exc
    if port not in allowed_ports:
        raise invalid(
            "port_not_allowed",
            port=port,
            allowed_ports=sorted(port for port in allowed_ports if port is not None),
        )
    if not parsed.path.startswith(SIGNED_OBJECT_PATH_PREFIX):
        raise invalid(
            "signed_object_path_required",
            path=parsed.path,
            required_prefix=SIGNED_OBJECT_PATH_PREFIX,
        )
    if not parse_qs(parsed.query).get("token"):
        raise invalid("missing_signed_token")


def load_model_version(manifest_path: str) -> str:
    try:
        with open(manifest_path, encoding="utf-8") as manifest_file:
            manifest = json.load(manifest_file)
    except FileNotFoundError as exc:
        raise RuntimeError(f"Model manifest is missing: {manifest_path}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Model manifest is invalid JSON: {manifest_path}") from exc

    model_version = manifest.get("model_version") if isinstance(manifest, dict) else None
    if not isinstance(model_version, str) or not model_version.strip():
        raise RuntimeError("Model manifest must contain a non-empty model_version string")
    return model_version


def _content_type(response: requests.Response) -> str:
    return response.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()


def download_signed_image(url: str) -> Image.Image:
    """Download a bounded image without following redirects or retaining it on disk."""
    try:
        with requests.get(
            url,
            stream=True,
            allow_redirects=False,
            timeout=(CONNECT_TIMEOUT_SECONDS, READ_TIMEOUT_SECONDS),
        ) as response:
            if 300 <= response.status_code < 400:
                raise APIError(
                    502,
                    "IMAGE_FETCH_FAILED",
                    "Could not retrieve the image.",
                    diagnostic={
                        "reason": "redirect_not_allowed",
                        "http_status": response.status_code,
                    },
                )
            if response.status_code != 200:
                raise APIError(
                    502,
                    "IMAGE_FETCH_FAILED",
                    "Could not retrieve the image.",
                    diagnostic={
                        "reason": "unexpected_http_status",
                        "http_status": response.status_code,
                    },
                )
            content_type = _content_type(response)
            if content_type not in ALLOWED_IMAGE_TYPES:
                raise APIError(
                    415,
                    "UNSUPPORTED_IMAGE_TYPE",
                    "Only JPEG and PNG images are supported.",
                    diagnostic={
                        "reason": "unsupported_content_type",
                        "content_type": content_type or None,
                        "allowed_content_types": sorted(ALLOWED_IMAGE_TYPES),
                    },
                )
            declared_length = response.headers.get("Content-Length")
            if declared_length and int(declared_length) > MAX_IMAGE_BYTES:
                raise APIError(
                    413,
                    "IMAGE_TOO_LARGE",
                    "Image must be 10 MiB or smaller.",
                    diagnostic={
                        "reason": "content_length_exceeded",
                        "content_length": int(declared_length),
                        "max_image_bytes": MAX_IMAGE_BYTES,
                    },
                )
            content = bytearray()
            for chunk in response.iter_content(chunk_size=64 * 1024):
                content.extend(chunk)
                if len(content) > MAX_IMAGE_BYTES:
                    raise APIError(
                        413,
                        "IMAGE_TOO_LARGE",
                        "Image must be 10 MiB or smaller.",
                        diagnostic={
                            "reason": "download_size_exceeded",
                            "downloaded_bytes": len(content),
                            "max_image_bytes": MAX_IMAGE_BYTES,
                        },
                    )
    except APIError:
        raise
    except requests.Timeout as exc:
        raise APIError(
            504,
            "IMAGE_FETCH_TIMEOUT",
            "Timed out retrieving the image.",
            diagnostic={"reason": "request_timeout", "error_type": type(exc).__name__},
        ) from exc
    except (requests.RequestException, ValueError) as exc:
        raise APIError(
            502,
            "IMAGE_FETCH_FAILED",
            "Could not retrieve the image.",
            diagnostic={
                "reason": "request_failed",
                "error_type": type(exc).__name__,
                "error": str(exc),
            },
        ) from exc

    try:
        Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
        with Image.open(io.BytesIO(content)) as opened:
            if opened.width * opened.height > MAX_IMAGE_PIXELS:
                raise APIError(
                    413,
                    "IMAGE_TOO_LARGE",
                    "Image must have 20 million pixels or fewer.",
                    diagnostic={
                        "reason": "pixel_count_exceeded",
                        "width": opened.width,
                        "height": opened.height,
                        "max_image_pixels": MAX_IMAGE_PIXELS,
                    },
                )
            return ImageOps.exif_transpose(opened).convert("RGB")
    except APIError:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise APIError(
            422,
            "INVALID_IMAGE",
            "Image data is invalid or cannot be decoded.",
            diagnostic={
                "reason": "image_decode_failed",
                "error_type": type(exc).__name__,
                "error": str(exc),
            },
        ) from exc


def create_app(
    settings_factory: Callable[[], Settings] = Settings.from_env,
    service_factory: Callable[[str], RAScreeningService] | None = None,
) -> FastAPI:
    configure_logging()
    if service_factory is None:
        service_factory = lambda checkpoint_path: RAScreeningService.from_checkpoint(checkpoint_path, device="cpu")

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        settings = settings_factory()
        model_version = load_model_version(settings.model_manifest_path)
        require_checkpoint_file(settings.checkpoint_path)
        torch.set_num_threads(8)
        service = service_factory(settings.checkpoint_path)
        app.state.settings = settings
        app.state.service = service
        app.state.model_version = model_version
        app.state.inference_lock = threading.Lock()
        log_event("model_initialized", model_version=model_version)
        try:
            yield
        finally:
            service.cropper.close()

    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)

    @app.exception_handler(APIError)
    async def handle_api_error(request: Request, exc: APIError) -> JSONResponse:
        request_id = getattr(request.state, "request_id", None)
        body = error_body(exc, request_id)
        log_event(
            "ra_screening_error",
            request_id=request_id,
            status_code=exc.status_code,
            response=body,
        )
        return JSONResponse(status_code=exc.status_code, content=body)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        error = APIError(422, "INVALID_REQUEST", "Request must contain one or two valid images.")
        request_id = getattr(request.state, "request_id", None)
        body = error_body(error, request_id)
        log_event(
            "ra_screening_error",
            request_id=request_id,
            status_code=error.status_code,
            response=body,
        )
        return JSONResponse(status_code=error.status_code, content=body)

    @app.middleware("http")
    async def request_log(request: Request, call_next):
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        started = time.perf_counter()
        try:
            response = await call_next(request)
        except APIError as exc:
            body = error_body(exc, request_id)
            log_event(
                "ra_screening_error",
                request_id=request_id,
                status_code=exc.status_code,
                response=body,
            )
            response = error_response(exc, request_id)
        except Exception:
            logger.exception("request_failed request_id=%s path=%s", request_id, request.url.path)
            error = APIError(500, "INFERENCE_ERROR", "Inference failed.")
            body = error_body(error, request_id)
            log_event(
                "ra_screening_error",
                request_id=request_id,
                status_code=error.status_code,
                response=body,
            )
            response = JSONResponse(status_code=error.status_code, content=body)
        response.headers["X-Request-ID"] = request_id
        log_event(
            "request_complete",
            request_id=request_id,
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=round((time.perf_counter() - started) * 1000),
        )
        return response

    # Cloud Run's frontend reserves /healthz, so use /health for public checks.
    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/v1/ra-screening")
    def ra_screening(payload: ScreeningRequest, request: Request) -> dict:
        log_event(
            "ra_screening_request",
            request_id=request.state.request_id,
            request={
                "images": [
                    {"side": image.side, "image_url": image.image_url}
                    for image in payload.images
                ]
            },
        )
        authorization = request.headers.get("Authorization", "")
        if not is_authorized(authorization, request.app.state.settings.api_key):
            raise APIError(401, "UNAUTHORIZED", "Invalid API key.")

        for submitted_image in payload.images:
            try:
                validate_signed_url(submitted_image.image_url, request.app.state.settings.supabase_storage_hosts)
            except APIError as error:
                log_event(
                    "image_url_validation_failed",
                    request_id=request.state.request_id,
                    side=submitted_image.side,
                    image_url=submitted_image.image_url,
                    diagnostic=error.diagnostic,
                )
                raise APIError(error.status_code, error.code, error.message, submitted_image.side) from error

        fetch_started = time.perf_counter()
        with ThreadPoolExecutor(max_workers=len(payload.images)) as executor:
            downloads = [
                executor.submit(download_signed_image, submitted_image.image_url)
                for submitted_image in payload.images
            ]
            images = []
            for submitted_image, download in zip(payload.images, downloads):
                try:
                    images.append(download.result())
                except APIError as error:
                    log_event(
                        "image_download_failed",
                        request_id=request.state.request_id,
                        side=submitted_image.side,
                        image_url=submitted_image.image_url,
                        diagnostic=error.diagnostic,
                    )
                    raise APIError(error.status_code, error.code, error.message, submitted_image.side) from error
        fetch_ms = (time.perf_counter() - fetch_started) * 1000

        hands = []
        with request.app.state.inference_lock:
            inference_started = time.perf_counter()
            for submitted_image, image in zip(payload.images, images):
                result = request.app.state.service.predict_from_image(image).to_dict()
                if result["num_joints_detected"] == 0:
                    raise APIError(422, "NO_HAND_DETECTED", "No hand was detected in the image.", submitted_image.side)
                hands.append({"side": submitted_image.side, **result})
            inference_ms = round((time.perf_counter() - inference_started) * 1000)
        response_body = {
            "model_version": request.app.state.model_version,
            "inference_ms": inference_ms,
            "hands": hands,
            "ra_detected": any(hand["ra_detected"] for hand in hands),
            "total_positive_joints": sum(hand["num_positive_joints"] for hand in hands),
        }
        log_event(
            "ra_screening_response",
            request_id=request.state.request_id,
            response=response_body,
            fetch_ms=round(fetch_ms),
            inference_ms=inference_ms,
            model_version=request.app.state.model_version,
        )
        return response_body

    return app


app = create_app()
