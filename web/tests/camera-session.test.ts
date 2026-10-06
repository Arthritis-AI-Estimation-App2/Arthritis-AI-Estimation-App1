import assert from "node:assert/strict";
import test from "node:test";
import { CameraSession, resetTorchPreference, type TorchPreference, type CameraSessionState } from "../src/lib/camera-session.ts";

type TorchConstraints = MediaTrackConstraints & {
  torch?: ConstrainBoolean;
};

function torchPreference(on = false): TorchPreference {
  return { on, generation: 0 };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

class FakeTrack extends EventTarget {
  readyState: MediaStreamTrackState = "live";
  muted = false;
  torch: boolean | boolean[] | undefined = true;
  settingsTorch: boolean | undefined;
  settingsError: Error | undefined;
  constraints: boolean[] = [];
  stops = 0;
  apply: ((enabled: boolean) => Promise<void>) | undefined;

  get mediaTrack() { return this as unknown as MediaStreamTrack; }

  getCapabilities() { return { torch: this.torch }; }

  getSettings() {
    if (this.settingsError) throw this.settingsError;
    return { torch: this.settingsTorch };
  }

  async applyConstraints(constraints: TorchConstraints) {
    const enabled = typeof constraints.torch === "boolean"
      ? constraints.torch
      : constraints.torch?.exact;
    assert.equal(typeof enabled, "boolean");
    this.constraints.push(enabled as boolean);
    await this.apply?.(enabled as boolean);
    this.settingsTorch = enabled as boolean;
  }

  stop() {
    this.stops++;
    this.readyState = "ended";
  }

  mute() {
    this.muted = true;
    this.dispatchEvent(new Event("mute"));
  }

  unmute() {
    this.muted = false;
    this.dispatchEvent(new Event("unmute"));
  }

  end() {
    this.readyState = "ended";
    this.dispatchEvent(new Event("ended"));
  }
}

function fakeCamera(track = new FakeTrack(), extraTracks: FakeTrack[] = []) {
  const stream = {
    get active() { return track.readyState === "live"; },
    getVideoTracks: () => [track.mediaTrack],
    getTracks: () => [track.mediaTrack, ...extraTracks.map((extra) => extra.mediaTrack)],
  } as unknown as MediaStream;
  const video = {
    srcObject: null as MediaProvider | null,
    readyState: 0,
    videoWidth: 0,
    videoHeight: 0,
  };
  return {
    track,
    stream,
    video: video as unknown as HTMLVideoElement,
    play() {
      video.readyState = 2;
      video.videoWidth = 1920;
      video.videoHeight = 1080;
    },
    pause() { video.readyState = 0; },
  };
}

async function readyCamera(preference = torchPreference(), track = new FakeTrack(), options: {
  onChange?: (state: CameraSessionState) => void;
  extraTracks?: FakeTrack[];
} = {}) {
  const camera = fakeCamera(track, options.extraTracks);
  const session = new CameraSession(camera.video, { preference, onChange: options.onChange });
  await session.start(async () => camera.stream);
  camera.play();
  await session.markReady();
  return { ...camera, session, preference };
}

test("初回に消灯済みと確認できれば制約適用と撮影待ちを省く", async () => {
  const track = new FakeTrack();
  track.settingsTorch = false;
  track.apply = async () => { throw new Error("already off"); };
  const updates: CameraSessionState[] = [];
  const camera = await readyCamera(torchPreference(), track, {
    onChange: (state) => updates.push(state),
  });
  await camera.session.markReady();
  assert.deepEqual(track.constraints, []);
  assert.equal(updates.some((state) => state.torch.pending), false);
  assert.equal(camera.session.state.torch.supported, true);
  assert.equal(camera.session.state.torch.on, false);
  assert.equal(camera.session.state.torch.error, null);
  assert.equal(camera.preference.on, false);
  assert.equal(camera.session.canCapture(), true);
  camera.session.stop();
});

test("初回に点灯を検出したら実際の状態を表示し消灯失敗後に手動消灯で再試行できる", async () => {
  const track = new FakeTrack();
  track.settingsTorch = true;
  const camera = fakeCamera(track);
  const preference = torchPreference();
  const applying = deferred<void>();
  const release = deferred<void>();
  track.apply = async (enabled) => {
    assert.equal(enabled, false);
    applying.resolve();
    await release.promise;
  };
  const session = new CameraSession(camera.video, { preference });
  await session.start(async () => camera.stream);
  camera.play();
  const initialRestore = session.markReady();
  await applying.promise;
  assert.equal(session.state.torch.on, true);
  assert.equal(session.state.torch.pending, true);
  assert.equal(session.canCapture(), false);
  release.reject(new Error("torch off failed"));
  await initialRestore;
  assert.equal(session.state.torch.on, true);
  assert.equal(session.state.torch.pending, false);
  assert.match(session.state.torch.error ?? "", /ライトを切り替えられませんでした/);
  assert.equal(session.canCapture(), true);
  assert.equal(preference.on, false);
  assert.deepEqual(track.constraints, [false]);
  await session.markReady();
  assert.deepEqual(track.constraints, [false]);

  track.apply = async (enabled) => { assert.equal(enabled, false); };
  assert.equal(await session.toggleTorch(), true);
  assert.deepEqual(track.constraints, [false, false]);
  assert.equal(track.settingsTorch, false);
  assert.equal(session.state.torch.on, false);
  assert.equal(session.state.torch.error, null);
  assert.equal(preference.on, false);
  session.stop();
});

test("初回の消灯状態が不明か設定取得に失敗した場合は消灯を試し失敗を通知する", async () => {
  for (const settingsUnavailable of [false, true]) {
    const track = new FakeTrack();
    if (settingsUnavailable) track.settingsError = new Error("settings unavailable");
    const camera = fakeCamera(track);
    const applying = deferred<void>();
    const release = deferred<void>();
    track.apply = async (enabled) => {
      assert.equal(enabled, false);
      applying.resolve();
      await release.promise;
    };
    const session = new CameraSession(camera.video, { preference: torchPreference() });
    await session.start(async () => camera.stream);
    camera.play();
    const initialRestore = session.markReady();
    await applying.promise;
    assert.equal(session.state.torch.pending, true);
    assert.equal(session.canCapture(), false);
    release.reject(new Error("torch off failed"));
    await initialRestore;
    assert.deepEqual(track.constraints, [false]);
    assert.equal(session.state.torch.pending, false);
    assert.match(session.state.torch.error ?? "", /ライトを切り替えられませんでした/);
    assert.equal(session.canCapture(), true);
    session.stop();
  }
});

test("初回の点灯希望は取得した消灯状態にかかわらず適用する", async () => {
  const track = new FakeTrack();
  track.settingsTorch = false;
  const camera = await readyCamera(torchPreference(true), track);
  assert.deepEqual(track.constraints, [true]);
  assert.equal(track.settingsTorch, true);
  assert.equal(camera.session.state.torch.on, true);
  assert.equal(camera.preference.on, true);
  assert.equal(camera.session.canCapture(), true);
  camera.session.stop();
});

test("中断復帰時は設定が消灯済みを示していても消灯要求を適用する", async () => {
  const track = new FakeTrack();
  track.settingsTorch = false;
  const camera = await readyCamera(torchPreference(), track);
  assert.deepEqual(track.constraints, []);
  track.mute();
  track.unmute();
  await camera.session.markReady();
  assert.deepEqual(track.constraints, [false]);
  assert.equal(camera.session.state.torch.on, false);
  assert.equal(camera.session.canCapture(), true);
  camera.session.stop();
});

test("左手の点灯希望を撮影後の停止と右手の新しいセッションへ引き継ぐ", async () => {
  const preference = torchPreference();
  const changes: boolean[] = [];
  preference.onChange = (on) => changes.push(on);
  const extraTrack = new FakeTrack();
  const left = await readyCamera(preference, new FakeTrack(), { extraTracks: [extraTrack] });
  assert.equal(left.session.canCapture(), true);
  assert.equal(await left.session.toggleTorch(), true);
  assert.equal(preference.on, true);
  assert.equal(left.session.state.torch.on, true);
  left.session.stop();
  left.session.stop();
  assert.equal(left.track.stops, 1);
  assert.equal(extraTrack.stops, 1);
  assert.equal(left.video.srcObject, null);
  assert.equal(left.session.canCapture(), false);
  assert.equal(left.session.state.ready, false);
  assert.equal(left.session.state.torch.on, false);
  assert.equal(preference.on, true);

  const right = await readyCamera(preference);
  assert.deepEqual(left.track.constraints, [false, true]);
  assert.deepEqual(right.track.constraints, [true]);
  assert.equal(right.session.state.torch.on, true);
  assert.equal(right.session.canCapture(), true);
  assert.deepEqual(changes, [true]);
  right.session.stop();
});

test("初めて映像が使用可能になる前のmuteとunmuteは引き継いだ点灯希望を消さない", async () => {
  const preference = torchPreference(true);
  const camera = fakeCamera();
  const session = new CameraSession(camera.video, { preference });
  await session.start(async () => camera.stream);
  camera.track.mute();
  camera.play();
  await session.markReady();
  assert.equal(session.canCapture(), false);
  assert.equal(preference.on, true);
  assert.deepEqual(camera.track.constraints, []);

  camera.track.unmute();
  await session.markReady();
  assert.equal(session.canCapture(), true);
  assert.equal(preference.on, true);
  assert.deepEqual(camera.track.constraints, [true]);
  session.stop();
});

test("使用中の映像中断から復帰すると消灯し映像が戻るまで消灯要求を保留する", async () => {
  const camera = await readyCamera(torchPreference(true));
  assert.equal(camera.session.state.torch.on, true);
  camera.track.mute();
  assert.equal(camera.session.canCapture(), false);
  camera.pause();
  camera.track.unmute();
  await camera.session.markReady();
  assert.equal(camera.preference.on, false);
  assert.equal(camera.session.canCapture(), false);
  assert.deepEqual(camera.track.constraints, [true]);

  camera.play();
  await camera.session.markReady();
  assert.deepEqual(camera.track.constraints, [true, false]);
  assert.equal(camera.session.state.torch.on, false);
  assert.equal(camera.session.canCapture(), true);
  camera.session.stop();
});

test("映像開始後にライト能力が公開されたら引き継いだ希望値を一度だけ適用する", async () => {
  const track = new FakeTrack();
  track.torch = undefined;
  const camera = await readyCamera(torchPreference(true), track);
  assert.equal(camera.session.canCapture(), true);
  assert.equal(camera.session.state.torch.supported, false);
  assert.equal(camera.preference.on, true);
  assert.deepEqual(track.constraints, []);
  track.torch = [false, true];
  await camera.session.markReady();
  await camera.session.markReady();
  assert.equal(camera.session.state.torch.supported, true);
  assert.equal(camera.session.state.torch.on, true);
  assert.deepEqual(track.constraints, [true]);
  camera.session.stop();
});

test("初期点灯の適用中に映像が中断したら点灯完了後に消灯しリセットを取り消さない", async () => {
  const preference = torchPreference(true);
  const camera = fakeCamera();
  const updates: CameraSessionState[] = [];
  const applying = deferred<void>();
  const release = deferred<void>();
  camera.track.apply = async (enabled) => {
    if (enabled) {
      applying.resolve();
      await release.promise;
    }
  };
  const session = new CameraSession(camera.video, { preference, onChange: (state) => updates.push(state) });
  await session.start(async () => camera.stream);
  camera.play();
  const initialRestore = session.markReady();
  await applying.promise;
  const notificationsDuringApply = updates.length;
  assert.equal(await session.toggleTorch(), false);
  camera.track.mute();
  camera.track.unmute();
  const interruptionRestore = session.markReady();
  assert.equal(preference.on, false);
  assert.equal(session.canCapture(), false);
  assert.equal(await session.toggleTorch(), false);
  assert.deepEqual(camera.track.constraints, [true]);
  release.resolve();
  await initialRestore;
  await interruptionRestore;
  assert.deepEqual(camera.track.constraints, [true, false]);
  assert.equal(preference.on, false);
  assert.equal(session.state.torch.on, false);
  assert.equal(session.canCapture(), true);
  assert.equal(updates.slice(notificationsDuringApply).filter((state) => !state.torch.pending).length, 1);
  session.stop();
});

test("画像確認で停止している間も背景移動のリセットは次の撮影へ引き継ぐ", async () => {
  const preference = torchPreference(true);
  const left = await readyCamera(preference);
  left.session.stop();
  const generation = preference.generation;
  resetTorchPreference(preference);
  assert.equal(preference.generation, generation + 1);
  assert.equal(preference.on, false);
  const right = await readyCamera(preference);
  assert.deepEqual(right.track.constraints, [false]);
  assert.equal(right.session.state.torch.on, false);
  right.session.stop();
});

test("停止後にカメラ取得が成功しても全トラックを一度だけ停止し映像と状態を差し替えない", async () => {
  const preference = torchPreference(true);
  const extraTrack = new FakeTrack();
  const camera = fakeCamera(new FakeTrack(), [extraTrack]);
  const request = deferred<MediaStream>();
  const updates: CameraSessionState[] = [];
  const session = new CameraSession(camera.video, { preference, onChange: (state) => updates.push(state) });
  const started = session.start(() => request.promise);
  session.stop();
  const notificationsAtStop = updates.length;
  const replacement = fakeCamera();
  camera.video.srcObject = replacement.stream;
  request.resolve(camera.stream);
  await started;
  assert.equal(camera.track.stops, 1);
  assert.equal(extraTrack.stops, 1);
  assert.equal(extraTrack.readyState, "ended");
  assert.equal(camera.video.srcObject, replacement.stream);
  assert.equal(updates.length, notificationsAtStop);
  assert.equal(session.state.error, null);
  assert.equal(preference.on, true);
  assert.deepEqual(camera.track.constraints, []);
});

test("停止後のカメラ取得失敗は遅延エラーを通知しない", async () => {
  const camera = fakeCamera();
  const request = deferred<MediaStream>();
  const updates: CameraSessionState[] = [];
  const session = new CameraSession(camera.video, {
    preference: torchPreference(),
    onChange: (state) => updates.push(state),
  });
  const started = session.start(() => request.promise);
  session.stop();
  const notificationsAtStop = updates.length;
  request.reject(new DOMException("permission denied", "NotAllowedError"));
  await started;
  assert.equal(session.state.error, null);
  assert.equal(updates.length, notificationsAtStop);
});

test("点灯適用中の停止は直ちに映像を止め遅延完了による通知と希望値の復活を防ぐ", async () => {
  for (const rejectAfterStop of [false, true]) {
    const updates: CameraSessionState[] = [];
    const camera = await readyCamera(torchPreference(), new FakeTrack(), {
      onChange: (state) => updates.push(state),
    });
    const applying = deferred<void>();
    const release = deferred<void>();
    camera.track.apply = async () => {
      applying.resolve();
      await release.promise;
    };
    const toggle = camera.session.toggleTorch();
    await applying.promise;
    assert.equal(camera.session.canCapture(), false);
    camera.track.mute();
    camera.track.unmute();
    const queuedRecovery = camera.session.markReady();
    resetTorchPreference(camera.preference);
    camera.session.stop();
    camera.session.stop();
    const notificationsAtStop = updates.length;
    assert.equal(camera.track.stops, 1);
    assert.equal(camera.video.srcObject, null);
    if (rejectAfterStop) release.reject(new DOMException("camera stopped", "InvalidStateError"));
    else release.resolve();
    assert.equal(await toggle, false);
    await queuedRecovery;
    await camera.session.markReady();
    assert.equal(await camera.session.toggleTorch(), false);
    assert.equal(camera.preference.on, false);
    assert.equal(camera.session.state.torch.on, false);
    assert.equal(camera.session.state.torch.pending, false);
    assert.equal(camera.session.state.torch.error, null);
    assert.equal(updates.length, notificationsAtStop);
    assert.deepEqual(camera.track.constraints, [false, true]);
  }
});

test("終了済みトラックの検出は制約適用を止め最終状態の後に余分な通知を出さない", async () => {
  for (const detection of ["queued-apply", "mark-ready"] as const) {
    const updates: CameraSessionState[] = [];
    let notificationsAtStop: number | undefined;
    const camera = await readyCamera(torchPreference(), new FakeTrack(), {
      onChange: (state) => {
        updates.push(state);
        if (state.error && !state.ready && !state.torch.supported) {
          notificationsAtStop ??= updates.length;
        }
      },
    });
    const toggle = detection === "queued-apply" ? camera.session.toggleTorch() : null;
    camera.track.readyState = "ended";
    if (toggle) assert.equal(await toggle, false);
    else await camera.session.markReady();
    assert.deepEqual(camera.track.constraints, [false]);
    assert.equal(camera.session.canCapture(), false);
    assert.equal(camera.session.state.torch.on, false);
    assert.equal(camera.session.state.torch.pending, false);
    assert.equal(camera.session.state.torch.error, null);
    assert.match(camera.session.state.error ?? "", /接続が切れました/);
    assert.equal(camera.preference.on, false);
    assert.notEqual(notificationsAtStop, undefined);
    assert.equal(updates.length, notificationsAtStop);
    await camera.session.markReady();
    camera.session.stop();
    assert.equal(updates.length, notificationsAtStop);
  }
});

test("点灯適用中に終了イベントが届かなくても終了後の成功応答と失敗応答を無効にする", async () => {
  for (const rejectAfterEnd of [false, true]) {
    const updates: CameraSessionState[] = [];
    const camera = await readyCamera(torchPreference(), new FakeTrack(), {
      onChange: (state) => updates.push(state),
    });
    const applying = deferred<void>();
    const release = deferred<void>();
    camera.track.apply = async () => {
      applying.resolve();
      await release.promise;
    };
    const toggle = camera.session.toggleTorch();
    await applying.promise;
    camera.track.readyState = "ended";
    const notificationsAfterEnd = updates.length;
    if (rejectAfterEnd) release.reject(new DOMException("camera ended", "InvalidStateError"));
    else release.resolve();
    assert.equal(await toggle, false);
    assert.equal(camera.session.canCapture(), false);
    assert.equal(camera.session.state.torch.on, false);
    assert.equal(camera.session.state.torch.pending, false);
    assert.equal(camera.session.state.torch.error, null);
    assert.match(camera.session.state.error ?? "", /接続が切れました/);
    assert.equal(camera.preference.on, false);
    assert.equal(updates.slice(notificationsAfterEnd).some((state) => state.torch.on || state.torch.error), false);
    assert.deepEqual(camera.track.constraints, [false, true]);
    assert.equal(await camera.session.toggleTorch(), false);
    assert.deepEqual(camera.track.constraints, [false, true]);
    camera.session.stop();
  }
});

test("映像がemptiedになった後の遅延ライト通知は撮影可能状態を復活させない", async () => {
  const updates: CameraSessionState[] = [];
  const camera = await readyCamera(torchPreference(), new FakeTrack(), {
    onChange: (state) => updates.push(state),
  });
  const applying = deferred<void>();
  const release = deferred<void>();
  camera.track.apply = async () => {
    applying.resolve();
    await release.promise;
  };
  const toggle = camera.session.toggleTorch();
  await applying.promise;
  camera.pause();
  camera.session.markNotReady();
  const notificationsAfterEmptied = updates.length;
  assert.equal(camera.session.state.ready, false);
  assert.equal(camera.session.canCapture(), false);
  release.resolve();
  assert.equal(await toggle, true);
  assert.equal(camera.session.state.torch.on, true);
  assert.equal(camera.session.state.ready, false);
  assert.equal(camera.session.canCapture(), false);
  assert.equal(updates.slice(notificationsAfterEmptied).every((state) => !state.ready), true);

  camera.play();
  assert.equal(camera.session.canCapture(), false);
  await camera.session.markReady();
  assert.equal(camera.session.canCapture(), true);
  camera.session.stop();
});

test("手動と中断復帰の消灯失敗は点灯状態と希望値を保ち手動消灯で再試行できる", async () => {
  for (const interrupted of [false, true]) {
    const camera = await readyCamera(torchPreference(true));
    let shouldFail = true;
    camera.track.apply = async (enabled) => {
      if (!enabled && shouldFail) throw new Error("torch off failed");
    };
    if (interrupted) {
      camera.track.mute();
      camera.track.unmute();
      await camera.session.markReady();
    } else {
      assert.equal(await camera.session.toggleTorch(), false);
    }
    assert.equal(camera.preference.on, !interrupted);
    assert.equal(camera.session.state.torch.on, true);
    assert.equal(camera.session.state.torch.pending, false);
    assert.match(camera.session.state.torch.error ?? "", /ライトを切り替えられませんでした/);
    assert.deepEqual(camera.track.constraints, [true, false]);

    await camera.session.markReady();
    assert.deepEqual(camera.track.constraints, [true, false]);
    assert.equal(camera.preference.on, !interrupted);
    shouldFail = false;
    assert.equal(await camera.session.toggleTorch(), true);
    assert.deepEqual(camera.track.constraints, [true, false, false]);
    assert.equal(camera.session.state.torch.on, false);
    assert.equal(camera.session.state.torch.error, null);
    assert.equal(camera.preference.on, false);
    camera.session.stop();
  }
});

test("トラック終了で希望値と映像をリセットし終了したセッションのイベントを無視する", async () => {
  const camera = await readyCamera(torchPreference(true));
  camera.track.end();
  assert.equal(camera.preference.on, false);
  assert.equal(camera.session.canCapture(), false);
  assert.match(camera.session.state.error ?? "", /接続が切れました/);
  assert.equal(camera.track.stops, 0);
  assert.equal(camera.video.srcObject, null);
  camera.preference.on = true;
  camera.track.mute();
  camera.track.unmute();
  camera.track.end();
  assert.equal(camera.preference.on, true);
  assert.equal(camera.track.stops, 0);
  assert.deepEqual(camera.track.constraints, [true]);
});
