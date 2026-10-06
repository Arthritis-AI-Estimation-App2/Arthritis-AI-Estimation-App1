export interface CameraTorchState {
  supported: boolean;
  on: boolean;
  pending: boolean;
  error: string | null;
}

type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean | boolean[] };
type TorchConstraints = Omit<MediaTrackConstraints, "advanced"> & {
  torch: ConstrainBoolean;
  advanced: (MediaTrackConstraintSet & { torch: boolean })[];
};

export function supportsTorch(track: MediaStreamTrack | null | undefined): boolean {
  if (!track || track.readyState === "ended" || typeof track.getCapabilities !== "function") return false;
  try {
    const torch = (track.getCapabilities() as TorchCapabilities).torch;
    return torch === true || (Array.isArray(torch) && torch.includes(true) && torch.includes(false));
  } catch {
    return false;
  }
}

export function setTorch(track: MediaStreamTrack, on: boolean): Promise<void> {
  // 映像制約と混ぜず、必須の基本制約と旧ブラウザ向けのadvancedにライトだけを指定する。
  const constraints: TorchConstraints = { torch: { exact: on }, advanced: [{ torch: on }] };
  return track.applyConstraints(constraints);
}
