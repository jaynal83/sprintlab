import { useRef, useState, useCallback } from 'react';

interface ImportMetaEnv {
  VITE_POSE_BACKEND_URL?: string;
}
const BACKEND_URL =
  (import.meta as unknown as { env: ImportMetaEnv }).env
    ?.VITE_POSE_BACKEND_URL ?? 'http://localhost:8080';

// 2D keypoint — pixel coords in inference frame
export interface Keypoint {
  x: number;
  y: number;
  score: number;
}
// 3D keypoint — normalised camera-space coords from Wholebody3d
export interface Keypoint3D {
  x: number;
  y: number;
  z: number;
}

export type LandmarkerStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface PoseProgress {
  frame: number;
  total: number;
  pct: number;
  fps: number;
  elapsed: number;
  eta: number;
}

interface UsePoseLandmarkerReturn {
  status: LandmarkerStatus;
  progress: PoseProgress | null;
  frameWidth: number;
  frameHeight: number;
  totalFrames: number;
  poseFps: number;
  getKeypoints: (frame: number) => Keypoint[];
  getKeypoints3D: (frame: number) => Keypoint3D[];
  analyseVideo: (videoSrc: string) => Promise<void>;
  reset: () => void;
}

export function usePoseLandmarker(): UsePoseLandmarkerReturn {
  const [status, setStatus] = useState<LandmarkerStatus>('idle');
  const [progress, setProgress] = useState<PoseProgress | null>(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const [frameHeight, setFrameHeight] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const [poseFps, setPoseFps] = useState(0);

  // Separate maps for 2D and 3D — same frame index keys
  const map2dRef = useRef<Map<number, Keypoint[]>>(new Map());
  const map3dRef = useRef<Map<number, Keypoint3D[]>>(new Map());

  const getKeypoints = useCallback((frame: number): Keypoint[] => {
    const clamped = Math.max(0, Math.min(frame, map2dRef.current.size - 1));
    return map2dRef.current.get(clamped) ?? [];
  }, []);

  const getKeypoints3D = useCallback((frame: number): Keypoint3D[] => {
    const clamped = Math.max(0, Math.min(frame, map3dRef.current.size - 1));
    return map3dRef.current.get(clamped) ?? [];
  }, []);

  const reset = useCallback(() => {
    map2dRef.current.clear();
    map3dRef.current.clear();
    setStatus('idle');
    setProgress(null);
    setFrameWidth(0);
    setFrameHeight(0);
    setTotalFrames(0);
    setPoseFps(0);
  }, []);

  const analyseVideo = useCallback(
    async (videoSrc: string) => {
      reset();
      setStatus('loading');
      try {
        const blob = await fetch(videoSrc).then((r) => r.blob());
        const form = new FormData();
        form.append('file', blob, 'video');

        const res = await fetch(`${BACKEND_URL}/infer/video`, {
          method: 'POST',
          body: form,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (!res.body) throw new Error('No response body');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const msg = JSON.parse(line.slice(6));

            if (msg.type === 'progress') {
              setProgress({
                frame: msg.frame,
                total: msg.total,
                pct: msg.pct,
                fps: msg.fps,
                elapsed: msg.elapsed,
                eta: msg.eta,
              });
            } else if (msg.type === 'result') {
              const nKpts = msg.n_kpts as number; // e.g. 133 for Wholebody3d
              const stride2d = nKpts * 3; // x,y,s per keypoint

              const new2d = new Map<number, Keypoint[]>();
              const new3d = new Map<number, Keypoint3D[]>();

              (msg.frames as number[][]).forEach((flat, i) => {
                // First half: 2D  [x,y,s, x,y,s, ...]
                const kps2d: Keypoint[] = [];
                for (let j = 0; j < stride2d; j += 3)
                  kps2d.push({
                    x: flat[j],
                    y: flat[j + 1],
                    score: flat[j + 2],
                  });

                // Second half: 3D [x,y,z, x,y,z, ...]
                const kps3d: Keypoint3D[] = [];
                for (let j = stride2d; j < flat.length; j += 3)
                  kps3d.push({ x: flat[j], y: flat[j + 1], z: flat[j + 2] });

                new2d.set(i, kps2d);
                new3d.set(i, kps3d);
              });

              map2dRef.current = new2d;
              map3dRef.current = new3d;
              setFrameWidth(msg.frame_width);
              setFrameHeight(msg.frame_height);
              setTotalFrames(msg.total_frames);
              setPoseFps(msg.fps);
              setProgress(null);
              setStatus('ready');
            }
          }
        }
      } catch (err) {
        console.error('[RTMPose]', err);
        setStatus('error');
        setProgress(null);
      }
    },
    [reset],
  );

  return {
    status,
    progress,
    frameWidth,
    frameHeight,
    totalFrames,
    poseFps,
    getKeypoints,
    getKeypoints3D,
    analyseVideo,
    reset,
  };
}
