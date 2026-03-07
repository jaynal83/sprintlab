import cv2
from rtmlib import BodyWithFeet, draw_skeleton

device = "cpu"
backend = "onnxruntime"

cap = cv2.VideoCapture("./videos/ants.mp4")

openpose_skeleton = False

body_with_feet = BodyWithFeet(
    to_openpose=openpose_skeleton,
    backend=backend,
    device=device,
)

fps = cap.get(cv2.CAP_PROP_FPS)
width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

if fps <= 0:
    fps = 30

fourcc = cv2.VideoWriter_fourcc(*"MJPG")
out = cv2.VideoWriter("./output/output.avi", fourcc, fps, (width, height))


print('Processing...')
print('FPS:', fps)
while cap.isOpened():
    success, frame = cap.read()
    if not success:
        break

    keypoints, scores = body_with_feet(frame)

    img_show = draw_skeleton(
        frame.copy(),
        keypoints,
        scores,
        openpose_skeleton=openpose_skeleton,
        kpt_thr=0.43,
    )

    out.write(img_show)

cap.release()
out.release()
print("✅ Video processing complete! Output saved as output.avi")