"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CAMERA_INITIAL_STATE, CameraSession, resetTorchPreference, type TorchPreference } from "@/lib/camera-session";

/** カメラ接続と、画面の表示・非表示に応じた再接続をまとめる。 */
export function useCamera({ disabled, initialTorchOn, onTorchPreferenceChange }: {
  disabled: boolean;
  initialTorchOn: boolean;
  onTorchPreferenceChange?: (on: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<CameraSession | null>(null);
  const preference = useRef<TorchPreference>({ on: initialTorchOn, generation: 0 });
  const [state, setState] = useState(CAMERA_INITIAL_STATE);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const value = preference.current;
    value.onChange = onTorchPreferenceChange;
    return () => { value.onChange = undefined; };
  }, [onTorchPreferenceChange]);

  // 画像確認でカメラを停止している間も、背景への移動では引き継ぎを解除する。
  useEffect(() => {
    function hideCamera() {
      resetTorchPreference(preference.current);
      sessionRef.current?.stop();
    }
    function handleVisibilityChange() {
      if (document.hidden) hideCamera();
      else setAttempt((value) => value + 1);
    }
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) setAttempt((value) => value + 1);
    }
    if (document.hidden) hideCamera();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", hideCamera);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", hideCamera);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || disabled || state.error || document.hidden) return;
    const session = new CameraSession(video, { preference: preference.current, onChange: setState });
    sessionRef.current = session;
    void session.start(() => navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1920 } },
      audio: false,
    }));
    return () => {
      session.stop();
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, [attempt, disabled, state.error]);

  const retry = useCallback(() => {
    resetTorchPreference(preference.current);
    sessionRef.current?.stop();
    setState(CAMERA_INITIAL_STATE);
    setAttempt((value) => value + 1);
  }, []);
  const reportError = useCallback((error: string) => {
    sessionRef.current?.stop();
    setState({ ...CAMERA_INITIAL_STATE, error });
  }, []);
  const markReady = useCallback(() => { void sessionRef.current?.markReady(); }, []);
  const markNotReady = useCallback(() => sessionRef.current?.markNotReady(), []);
  const canCapture = useCallback(() => sessionRef.current?.canCapture() ?? false, []);
  const toggleTorch = useCallback(() => sessionRef.current?.toggleTorch(), []);

  return { ...state, videoRef, retry, reportError, markReady, markNotReady, canCapture, toggleTorch };
}
