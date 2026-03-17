# Instrumented Track: Technical Specification

## Concept

Permanent cameras installed around a standard 400m track that automatically capture and analyze every athlete in every event. No wearables, no markers, no setup. Athletes run normally. The intelligence is in the cameras and software.

The 400m is the proving ground — if it works for 400m, it works for every track event.

---

## Camera Layout (~16 cameras)

### Home Straight (6 cameras)
- 2 side cameras on each side (4 total), staggered with overlap
- 1 rear camera at each end, centered, roughly hip height (2 total)
- Highest priority zone: where the 100m lives, where every event finishes

### Back Straight (6 cameras)
- Same layout as home straight
- Covers 200m drive phase, 400m fatigue zone, second hurdle segment

### Turn 1 and Turn 2 (4 cameras)
- 2 cameras each, outside of curve looking inward

### Hardware Per Camera
- 4K or 8K fixed lens, fixed position
- Weatherproofed, permanently mounted on poles or existing structures
- Edge compute node or wired to central processing
- No moving parts

---

## What Each Camera Angle Captures

### Side Cameras (Sagittal Plane)
- Joint angles: hip, knee, ankle flexion/extension
- Angular velocities
- Stride length, stride frequency
- Ground contact time, flight time
- Trunk lean (anterior/posterior)
- Arm swing amplitude
- Velocity from athlete displacement on calibrated track

### Rear Cameras (Frontal Plane)
- Arm cross-over (mediolateral swing path)
- Hip drop (contralateral pelvic dip during stance)
- Knee valgus/varus at ground contact
- Foot placement width (step width)
- Trunk rotation around vertical axis
- Shoulder asymmetry

### Fusion of Both Views
- Coupled movement patterns (e.g., hip extension decrease + hip drop increase = fatigue signature)
- Full 3D kinematics at overlap zones
- Correlated sagittal and frontal plane data that neither view alone can capture

---

## Calibration

The track is the calibration target. World Athletics standard dimensions:

- Straights: 84.39m each
- Bends: semicircles, inner radius 36.5m
- Lane width: 1.22m
- Stagger markings, 100m/200m/300m lines at known positions
- Dozens to hundreds of known correspondence points visible in every camera

### Process
1. Detect track features in image (lane lines, markings, curve geometry)
2. Match to known track template with every dimension defined
3. Solve for camera intrinsics (focal length, distortion) and extrinsics (position, orientation) via PnP
4. Every pixel now maps to a point on the track surface in meters

### Key Properties
- One-time calibration per camera — the track doesn't move
- Accuracy is uniform across the field of view because reference points are everywhere
- Lane structure provides automatic identity assignment for lane events

---

## Occlusion Handling

### Lane Events (100m, 200m, 400m, hurdles)
- Athletes separated by 1.22m per lane — minimal occlusion
- Cameras on both sides of the straight solve it: if lane 4 blocks lane 5 from the left camera, the right camera sees lane 5 in front
- Effectively solved

### 800m
- Laned for first 300m (clean data), then athletes break
- Field is max 8 athletes — manageable after break

### 1500m - 10000m
- Pack running creates real occlusion
- Multi-angle coverage means most athletes visible from at least one camera at any moment
- Temporal continuity: predict through brief occlusions, interpolate gaps
- Accept graceful degradation in packs, optimize for race-defining moments (kicks, surges, final lap)

### Identity Through Occlusion
- Lane events: lane position solves it
- Non-lane events: bib number detection, jersey color, body shape priors, predicted trajectory

---

## What the System Produces

### Per Athlete, Per Session, Automatically
- Full velocity profile over the entire race
- Stride length and stride frequency curves
- Ground contact time and flight time per stride
- Sagittal plane joint kinematics (hip, knee, ankle)
- Frontal plane asymmetry metrics (hip drop, knee valgus, arm cross-over)
- Fatigue signatures (mechanical degradation over the course of a race)
- Split times at any arbitrary distance

### Across Sessions
- Longitudinal mechanical development tracking
- Training load and mechanical quality monitoring
- Baseline vs fatigued mechanical profiles

---

## Complementary Sensors (Optional)

| Sensor | What It Adds | Role |
|---|---|---|
| IMU suit | High-rate joint angles (100-1000Hz), clean angular velocities | Body-local kinematics, redundant validation |
| LiDAR | Direct 3D position, lighting-independent | Global position/velocity, future potential as resolution improves |
| GPS/GNSS | Coarse velocity profile (10-18Hz) | Cheapest velocity reference, calibration anchor |
| Timing gates | Ground-truth velocity at known positions | Validation reference |
| Instrumented insoles | Vertical force distribution, contact timing | Partial force data without force plates |

---

## Key Technical Risks

1. **Accuracy at distance** — pose estimation needs sufficient pixels per athlete. At 10-15m range with 4K, athlete is hundreds of pixels tall. Should be sufficient but needs validation.
2. **Outdoor environment** — weatherproofing, lighting variation, rain, glare, night conditions, lens fouling.
3. **Data volume** — multi-camera high-res video generates massive storage and processing requirements.
4. **Force estimation gap** — kinematics alone cannot give ground reaction forces. Physics-based estimation from kinematics is research-frontier, not production-ready.

---

## Build Path

1. **Two cameras on one straight** — prove core analysis from fixed infrastructure cameras. Validate against Vicon.
2. **Add cameras incrementally** — extend coverage, add rear cameras for frontal plane, cover curves.
3. **Full 16-camera installation at one site** — first fully instrumented track.
4. **Software intelligence layer** — real-time feedback, fatigue monitoring, longitudinal tracking, comparative analytics.
5. **Scale** — standardized installation package for tracks worldwide.
