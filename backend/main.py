"""
SprintLab Pose Backend
POST /infer/video  — process entire video, return keypoints per frame
GET  /health       — liveness check
"""

import base64
import tempfile
import os
import cv2
import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from rtmlib import BodyWithFeet

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

body = BodyWithFeet(to_openpose=False, backend='onnxruntime', device='cpu')

class VideoRequest(BaseModel):
    video: str  # base64-encoded video file

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/infer/video")
def infer_video(req: VideoRequest):
    b64 = req.video.split(",", 1)[-1]
    raw = base64.b64decode(b64)

    # Detect container from data-URI mime type (e.g. video/webm, video/mp4)
    suffix = ".mp4"
    if req.video.startswith("data:"):
        mime = req.video.split(";")[0].split(":")[1]  # e.g. "video/webm"
        ext_map = {"video/webm": ".webm", "video/mp4": ".mp4", "video/quicktime": ".mov",
                   "video/x-msvideo": ".avi", "video/x-matroska": ".mkv"}
        suffix = ext_map.get(mime, ".mp4")

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(raw)
        tmp_path = f.name

    try:
        cap          = cv2.VideoCapture(tmp_path)
        fps          = cap.get(cv2.CAP_PROP_FPS)
        frame_width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        frames       = []
        frame_idx    = 0

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            keypoints, scores = body(frame)

            if keypoints is not None and len(keypoints) > 0:
                kps = keypoints[0]
                sc  = scores[0]
                kp_list = [
                    {"x": float(x), "y": float(y), "score": float(s)}
                    for (x, y), s in zip(kps, sc)
                ]
            else:
                kp_list = []

            frames.append({"frame": frame_idx, "keypoints": kp_list})
            frame_idx += 1

        cap.release()
    finally:
        os.unlink(tmp_path)

    return {
        "fps":          fps,
        "frame_width":  frame_width,
        "frame_height": frame_height,
        "frames":       frames,
    }