// ─── RTMPose Backend Hook ─────────────────────────────────────────────────────
// Drop-in replacement for the MoveNet version.
// Sends frames to the FastAPI/RTMPose backend on Fly.io.
// Same external interface: { status, result, detect }
//
// Frame capture: draws the current video frame to an offscreen canvas,
// encodes as JPEG (quality 0.7, max 640px wide), sends as base64.
//
// Warm-up: pings /health on mount so the Fly.io machine is awake by the
// time the user enables pose detection.

import { useEffect, useRef, useState, useCallback } from 'react';

// ── Config ────────────────────────────────────────────────────────────────────
// Set VITE_POSE_BACKEND_URL in your .env:
//   VITE_POSE_BACKEND_URL=https://sprintlab-pose.fly.dev
// Falls back to localhost for local dev (run: uvicorn main:app --port 8080)
const BACKEND_URL =
  (import.meta as any).env?.VITE_POSE_BACKEND_URL ?? 'http://localhost:8080';

const JPEG_QUALITY = 0.7;

// Reuse a single offscreen canvas across all detect() calls
let _canvas: HTMLCanvasElement | null = null;
let _ctx: CanvasRenderingContext2D | null = null;

function getCanvas(w: number, h: number): CanvasRenderingContext2D {
  if (!_canvas) {
    _canvas = document.createElement('canvas');
    _ctx = _canvas.getContext('2d')!;
  }
  // Scale to max 640px wide — enough for RTMPose, keeps payload small
  const scale = Math.min(1, 640 / w);
  const sw = Math.round(w * scale);
  const sh = Math.round(h * scale);
  if (_canvas.width !== sw || _canvas.height !== sh) {
    _canvas.width = sw;
    _canvas.height = sh;
  }
  return _ctx!;
}

function captureFrame(videoEl: HTMLVideoElement): string | null {
  const w = videoEl.videoWidth;
  const h = videoEl.videoHeight;
  if (!w || !h) return null;
  const ctx = getCanvas(w, h);
  ctx.drawImage(videoEl, 0, 0, _canvas!.width, _canvas!.height);
  return _canvas!.toDataURL('image/jpeg', JPEG_QUALITY);
}

// ── Types — identical to old interface so all consumers are unaffected ────────
export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface PoseResult {
  landmarks: NormalizedLandmark[][];
  timestamp: number;
}

export type LandmarkerStatus = 'idle' | 'loading' | 'ready' | 'error';

interface UsePoseLandmarkerReturn {
  status: LandmarkerStatus;
  result: PoseResult | null;
  detect: (videoEl: HTMLVideoElement, timestampMs: number) => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function usePoseLandmarker(enabled: boolean): UsePoseLandmarkerReturn {
  const [status, setStatus] = useState<LandmarkerStatus>('idle');
  const [result, setResult] = useState<PoseResult | null>(null);
  const inferringRef = useRef(false);
  const lastTimestampRef = useRef(-1);
  const abortRef = useRef<AbortController | null>(null);

  // ── Warm-up ping — fires on mount regardless of enabled ─────────────────
  useEffect(() => {
    fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(10_000) })
      .then((r) => r.json())
      .then((d) => console.info('[RTMPose] backend:', d.status))
      .catch(() => {
        /* ignore — just a warm-up */
      });
  }, []);

  // ── Status: poll /health until ready when enabled ────────────────────────
  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      setResult(null);
      abortRef.current?.abort();
      lastTimestampRef.current = -1;
      return;
    }

    let cancelled = false;
    setStatus('loading');

    const check = async () => {
      for (let i = 0; i < 30; i++) {
        if (cancelled) return;
        try {
          const res = await fetch(`${BACKEND_URL}/health`, {
            signal: AbortSignal.timeout(5_000),
          });
          const data = await res.json();
          if (data.status === 'ready') {
            if (!cancelled) setStatus('ready');
            return;
          }
        } catch {
          /* keep polling */
        }
        await new Promise((r) => setTimeout(r, 2_000));
      }
      if (!cancelled) setStatus('error');
    };

    check();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  // ── detect ───────────────────────────────────────────────────────────────
  const detect = useCallback(
    (videoEl: HTMLVideoElement, timestampMs: number) => {
      if (status !== 'ready' || inferringRef.current) return;

      const ts = Math.floor(timestampMs);
      if (ts <= lastTimestampRef.current) return;
      lastTimestampRef.current = ts;

      const frame = captureFrame(videoEl);
      if (!frame) return;

      inferringRef.current = true;
      const controller = new AbortController();
      abortRef.current = controller;

      fetch(`${BACKEND_URL}/infer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frame,
          frame_width: videoEl.videoWidth,
          frame_height: videoEl.videoHeight,
        }),
        signal: controller.signal,
      })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((data) => {
          const landmarks: NormalizedLandmark[] = (
            data.keypoints as Array<{
              x: number;
              y: number;
              score: number;
            }>
          ).map((kp) => ({ x: kp.x, y: kp.y, z: 0, visibility: kp.score }));
          setResult({ landmarks: [landmarks], timestamp: ts });
        })
        .catch((err) => {
          if (err.name !== 'AbortError') console.warn('[RTMPose] infer:', err);
        })
        .finally(() => {
          inferringRef.current = false;
        });
    },
    [status],
  );

  return { status, result, detect };
}
