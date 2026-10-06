import { setTorch, supportsTorch, type CameraTorchState } from "./camera-torch.ts";

const TORCH_UNAVAILABLE: CameraTorchState = { supported: false, on: false, pending: false, error: null };

export interface CameraSessionState {
  ready: boolean;
  error: string | null;
  torch: CameraTorchState;
}

export const CAMERA_INITIAL_STATE: CameraSessionState = { ready: false, error: null, torch: TORCH_UNAVAILABLE };

/** カメラを開き直しても残す希望値。generationは遅延処理によるリセットの取り消しを防ぐ。 */
export interface TorchPreference {
  on: boolean;
  generation: number;
  onChange?: (on: boolean) => void;
}

function rememberTorchPreference(preference: TorchPreference, on: boolean) {
  preference.on = on;
  preference.onChange?.(on);
}

export function resetTorchPreference(preference: TorchPreference) {
  preference.generation++;
  rememberTorchPreference(preference, false);
}

/** 一度のカメラ接続を所有する。停止後の再接続は、新しいセッションで行う。 */
export class CameraSession {
  private readonly video: HTMLVideoElement;
  private readonly preference: TorchPreference;
  private readonly onChange?: (state: CameraSessionState) => void;
  private currentState = CAMERA_INITIAL_STATE;
  private stream: MediaStream | null = null;
  private track: MediaStreamTrack | null = null;
  private started = false;
  private stopped = false;
  private hasBeenReady = false;
  private interrupted = false;
  private restoreReason: "initial" | "interruption" | null = "initial";
  private torchQueue: Promise<void> = Promise.resolve();
  private pendingCount = 0;

  constructor(video: HTMLVideoElement, options: {
    preference: TorchPreference;
    onChange?: (state: CameraSessionState) => void;
  }) {
    this.video = video;
    this.preference = options.preference;
    this.onChange = options.onChange;
  }

  get state(): CameraSessionState { return { ...this.currentState, torch: { ...this.currentState.torch } }; }

  private update(changes: Partial<CameraSessionState>) {
    this.currentState = { ...this.currentState, ...changes };
    this.onChange?.(this.state);
  }

  async start(getStream: () => Promise<MediaStream>): Promise<void> {
    if (this.started || this.stopped) return;
    this.started = true;
    try {
      const stream = await getStream();
      if (this.stopped) {
        CameraSession.stopStream(stream);
        return;
      }
      this.stream = stream;
      this.video.srcObject = stream;
      this.track = stream.getVideoTracks()[0] ?? null;
      if (!this.track || this.track.readyState === "ended") {
        this.handleEnded();
        return;
      }
      this.track.addEventListener("ended", this.handleEnded);
      this.track.addEventListener("mute", this.handleMute);
      this.track.addEventListener("unmute", this.handleUnmute);
      this.updateTorch({ supported: supportsTorch(this.track) });
      await this.markReady();
    } catch {
      if (!this.stopped) this.update({ error: "カメラにアクセスできません。設定からカメラのアクセスを許可してください。" });
    }
  }

  private videoIsReady(): boolean {
    return this.ensureLiveTrack() && this.stream != null && this.video.srcObject === this.stream && this.stream.active &&
      !this.track?.muted && this.video.readyState >= 2 &&
      this.video.videoWidth > 0 && this.video.videoHeight > 0;
  }

  private ensureLiveTrack(): boolean {
    if (!this.stopped && this.track?.readyState === "ended") this.handleEnded();
    return !this.stopped && this.track != null;
  }

  private updateTorch(changes: Partial<CameraTorchState>) {
    this.update({ torch: { ...this.currentState.torch, ...changes } });
  }

  private getTorchSetting(): boolean | undefined {
    try {
      return (this.track?.getSettings() as (MediaTrackSettings & { torch?: boolean }) | undefined)?.torch;
    } catch {
      return undefined;
    }
  }

  private setEnabled(enabled: boolean): Promise<boolean> {
    if (!this.ensureLiveTrack() || !this.currentState.torch.supported) return Promise.resolve(false);
    this.pendingCount++;
    this.updateTorch({ pending: true, error: null });
    const operation = this.torchQueue.then(async () => {
      try {
        if (!this.ensureLiveTrack()) return false;
        await setTorch(this.track!, enabled);
        if (!this.ensureLiveTrack()) return false;
        this.updateTorch({ on: enabled, error: null });
        return true;
      } catch {
        if (this.ensureLiveTrack()) this.updateTorch({ error: "ライトを切り替えられませんでした。もう一度お試しください。" });
        return false;
      } finally {
        this.pendingCount--;
        if (this.ensureLiveTrack() && this.pendingCount === 0) this.updateTorch({ pending: false });
      }
    });
    this.torchQueue = operation.then(() => undefined);
    return operation;
  }

  /** loadeddata / playing / unmute のどれからも同じ条件で準備を確認する。 */
  markReady(): Promise<void> {
    if (this.stopped) return this.torchQueue;
    const ready = this.videoIsReady();
    if (this.stopped) return this.torchQueue;
    this.update({ ready });
    if (!ready) return this.torchQueue;
    this.hasBeenReady = true;
    const wasSupported = this.currentState.torch.supported;
    if (!wasSupported && supportsTorch(this.track)) this.updateTorch({ supported: true });
    if (this.currentState.torch.supported && (this.restoreReason != null || !wasSupported)) {
      const initialRestore = this.restoreReason === "initial";
      this.restoreReason = null;
      const generation = this.preference.generation;
      const desiredOn = this.preference.on;
      if (initialRestore && !desiredOn) {
        const observedOn = this.getTorchSetting();
        if (typeof observedOn === "boolean") this.updateTorch({ on: observedOn });
        // 初回だけ、消灯を確認できた場合は適用待ちを省く。状態不明や中断復帰では消灯を試す。
        if (observedOn === false) return this.torchQueue;
      }
      void this.setEnabled(desiredOn).then((success) => {
        // ONへの復元失敗は設定へ反映する。中断時のOFF希望は、失敗してもONに戻さない。
        if (!success && desiredOn && !this.stopped && generation === this.preference.generation) {
          rememberTorchPreference(this.preference, this.currentState.torch.on);
        }
      });
    }
    return this.torchQueue;
  }

  canCapture(): boolean { return this.videoIsReady() && this.currentState.ready && !this.currentState.torch.pending; }

  markNotReady(): void { if (!this.stopped) this.update({ ready: false }); }

  async toggleTorch(): Promise<boolean> {
    if (!this.canCapture()) return false;
    const enabled = !this.currentState.torch.on;
    const generation = this.preference.generation;
    const success = await this.setEnabled(enabled);
    if (!success || this.stopped || generation !== this.preference.generation) return false;
    rememberTorchPreference(this.preference, enabled);
    return true;
  }

  private handleEnded = () => {
    if (this.stopped) return;
    resetTorchPreference(this.preference);
    this.update({ error: "カメラとの接続が切れました。再試行してください。" });
    this.stop();
  };

  private handleMute = () => {
    if (this.stopped) return;
    this.interrupted ||= this.hasBeenReady;
    this.update({ ready: false });
  };

  private handleUnmute = () => {
    if (this.stopped) return;
    // 初回起動のunmuteは引き継ぎを維持し、準備済みカメラの中断復帰はOFFにする。
    if (this.interrupted) {
      resetTorchPreference(this.preference);
      this.restoreReason = "interruption";
      this.interrupted = false;
    }
    void this.markReady();
  };

  private static stopStream(stream: MediaStream) {
    stream.getTracks().forEach((track) => { if (track.readyState !== "ended") track.stop(); });
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.track?.removeEventListener("ended", this.handleEnded);
    this.track?.removeEventListener("mute", this.handleMute);
    this.track?.removeEventListener("unmute", this.handleUnmute);
    if (this.stream) CameraSession.stopStream(this.stream);
    if (this.video.srcObject === this.stream) this.video.srcObject = null;
    this.stream = null;
    this.track = null;
    this.update({ ready: false, torch: TORCH_UNAVAILABLE });
  }
}
