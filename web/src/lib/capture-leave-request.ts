export const CAPTURE_LEAVE_REQUEST_EVENT = "arthritis:capture-leave-request";

export interface CaptureLeaveRequestDetail {
  run: () => void;
}

export function requestCaptureLeave(run: () => void) {
  const event = new CustomEvent<CaptureLeaveRequestDetail>(
    CAPTURE_LEAVE_REQUEST_EVENT,
    {
      detail: { run },
      cancelable: true,
    }
  );
  return !window.dispatchEvent(event);
}
