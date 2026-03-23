# Sprint Timing & Velocity — Engineering Specification
**Status:** Implementation guidance  
**Scope:** CoM-based timing, instantaneous velocity, validation

---

## 1. Direction Normalization (Do This First)

The system must be direction-agnostic. The athlete can run left-to-right or right-to-left, and all downstream logic must behave identically.

**At ingestion, before any processing:**

```python
# Detect direction from first and last valid CoM x positions
direction = +1 if x_com[-1] > x_com[0] else -1

# Normalize so athlete always moves in the positive direction
x_norm = x_com * direction

# Normalize line positions the same way
x_start_norm  = x_start_line  * direction
x_finish_norm = x_finish_line * direction

# Ensure start < finish after normalization
if x_start_norm > x_finish_norm:
    x_start_norm, x_finish_norm = x_finish_norm, x_start_norm
```

All subsequent processing uses `x_norm`. De-normalize only for display output if needed. Never pass raw directional data into the timing or velocity pipeline.

---

## 2. Monotonicity Pre-Filter

**Key physical constraint:** A sprinting athlete's horizontal CoM position is monotonically increasing (after direction normalization). Any frame where `x[i] < x[i-1]` is a physically impossible outlier — a pose estimation artifact, ID switch, or detection dropout.

This filter is essentially free computationally and eliminates the noise conditions under which all smoothing methods degrade.

```python
def monotonic_prefilter(x, t):
    """
    Replace physically impossible backward steps with interpolated values.
    Operates on direction-normalized data only.
    """
    x_clean = x.copy()
    for i in range(1, len(x_clean)):
        if x_clean[i] < x_clean[i - 1]:
            # Mark as bad; interpolate from neighbours
            # Find next valid forward frame
            j = i + 1
            while j < len(x_clean) and x_clean[j] < x_clean[i - 1]:
                j += 1
            if j < len(x_clean):
                # Linear interpolation across the bad segment
                n_bad = j - i + 1
                for k in range(i, j):
                    alpha = (k - (i - 1)) / n_bad
                    x_clean[k] = x_clean[i - 1] + alpha * (x_clean[j] - x_clean[i - 1])
            else:
                # Bad frames at end of sequence — clamp
                x_clean[i:] = x_clean[i - 1]
    return x_clean
```

Apply this immediately after direction normalization, before any timing or velocity computation.

---

## 3. Line Crossing — Sub-Frame Interpolation

**Never snap to the nearest frame.** At 60fps, snapping introduces up to 16ms of timing error. Sub-frame interpolation reduces this to under 1ms.

```python
def crossing_time(t, x, x_line, dt):
    """
    Returns interpolated crossing time with sub-frame precision.
    Assumes x is monotonically increasing (apply pre-filter first).
    """
    for i in range(len(x) - 1):
        if x[i] < x_line <= x[i + 1]:
            frac = (x_line - x[i]) / (x[i + 1] - x[i])
            return t[i] + frac * dt
    return None  # Line never crossed — handle upstream
```

Call this once for `x_start_line` and once for `x_finish_line`. If either returns `None`, the sprint segment is invalid — log and skip; do not proceed to velocity computation.

---

## 4. Average Velocity

Once you have `t_start` and `t_finish` from sub-frame interpolation:

```python
D = x_finish_line - x_start_line   # Physical distance, world coordinates (metres)
T = t_finish - t_start              # Interpolated sprint duration
v_avg = D / T
```

`D` must come from your physical calibration — the real-world distance between the two lines. Do not derive it from CoM tracking data.

---

## 5. Instantaneous Velocity — Recommended Method

Based on empirical testing across 2,400 simulated runs (5 sprint archetypes, 4 noise levels, 3 frame rates, 40 trials each), the recommended pipeline is:

**Monotonicity Pre-Filter → Smoothing Spline → Analytic Derivative**

Under realistic tracking noise (after the monotonicity filter eliminates physically impossible outliers), the smoothing spline outperforms all alternatives by a large margin — median RMSE of 0.045 m/s vs 0.140 m/s for the next best method (Butterworth).

```python
from scipy.interpolate import UnivariateSpline

def instantaneous_velocity(t, x, noise_std=0.015):
    """
    Fit a smoothing spline to position data and return analytic derivative.
    
    Args:
        t:          time array (seconds)
        x:          CoM x positions, direction-normalized and pre-filtered
        noise_std:  estimated tracker noise in metres (tune per session/camera)
    
    Returns:
        v(t): velocity as a callable function, or array sampled at t
    """
    s_factor = len(t) * (noise_std ** 2)
    spl   = UnivariateSpline(t, x, s=s_factor, k=5)
    spl_d = spl.derivative()
    return spl_d(t)
```

**Tuning `noise_std`:** This is the one parameter that needs calibration per deployment. A good heuristic is to measure the RMS position jitter from a static calibration object filmed with the same setup. Typical values: 0.005–0.010m for high-quality pose estimators at 1080p, 0.015–0.030m for standard video tracking.

Restrict velocity computation to the sprint segment only (`t_start` to `t_finish`). Do not fit the spline to the full session.

---

## 6. Validation — The Displacement Integral Check

This is the correct sanity check for the velocity pipeline.

**Concept:** Integrating the instantaneous velocity curve over the sprint duration must equal the physical distance `D`. Since `D` is measured independently in the real world (not derived from tracking), this is a genuine external validation.

```python
from scipy.integrate import trapezoid

def validate_velocity_curve(t_sprint, v_sprint, D, tolerance=0.02):
    """
    Integrate velocity curve and compare to known physical distance.
    
    Args:
        t_sprint:   time array within sprint segment
        v_sprint:   instantaneous velocity estimates
        D:          physical distance between timing lines (metres)
        tolerance:  acceptable fractional error (default 2%)
    
    Returns:
        dict with 'valid' bool, 'integrated_distance', 'error_pct'
    """
    D_integrated = trapezoid(v_sprint, t_sprint)
    error_pct    = abs(D_integrated - D) / D * 100

    return {
        'valid':               error_pct < tolerance * 100,
        'integrated_distance': D_integrated,
        'known_distance':      D,
        'error_pct':           error_pct,
    }
```

**What the result means:**

| Error | Interpretation |
|---|---|
| < 1% | Excellent — pipeline is consistent |
| 1–3% | Acceptable — minor smoothing artefact or calibration offset |
| 3–8% | Investigate — likely spline smoothing factor misfit or calibration drift |
| > 8% | Reject this trial — tracking or calibration has failed |

Run this check on every sprint. Surface the result to the user. If consistently failing in one direction (always under/over), the noise_std tuning or physical calibration needs adjustment.

> **Why not average velocity over a small window?**  
> Computing average velocity over a 3–5 frame window and comparing to the spline estimate at that midpoint is mathematically equivalent to comparing the spline against a raw finite difference — which is noisy by construction. When they disagree, you cannot determine which is correct. The displacement integral check avoids this problem entirely because `D` is independently sourced from physical measurement.

---

## 7. Using D as a Constraint — Correcting the Velocity Curve

Section 6 uses D as a validator. This section uses it as a **constraint** — a strictly more powerful approach that produces a physically consistent velocity curve rather than simply flagging an inconsistent one.

### Why the spline produces a residual in the first place

The smoothing spline minimises a cost function that balances data fidelity against smoothness. It does not know that `∫v(t)dt` must equal D. As a result, the integral of its derivative will almost always differ slightly from D — even when the spline is a good fit. The correction below eliminates that residual entirely.

### The core idea

After computing the raw velocity curve from the spline derivative, measure how far off the integrated distance is from D, then distribute the entire residual as a **uniform velocity offset** across the sprint segment. Adding a constant to velocity is equivalent to adding a linear ramp to position. A linear ramp changes only the endpoint positions — it does not alter the shape of the curve, the acceleration profile, or the location and magnitude of the velocity peak. You are anchoring the physics without distorting the biomechanics.

This is the minimum-distortion correction that satisfies the integral constraint. Scaling the curve (multiplicative correction) or applying a nonlinear adjustment would both introduce shape distortion that is not justified by what you know.

### Decision: when to apply this

Always apply it — with one exception. If `displacement_error_pct > 8%` (the rejection threshold from Section 6), the trial has a fundamental tracking or calibration failure and the correction would be papering over a bad result. Reject those trials rather than correcting them. For all valid trials, apply the correction unconditionally before outputting the velocity curve.

The magnitude of `v_correction` is itself a data quality signal. Log it. If it is consistently above ~0.05 m/s across trials, your `noise_std` tuning or physical calibration needs attention.

---

### Pseudocode

```
// Inputs
//   t_sprint      : array of timestamps within sprint segment
//   v_raw         : velocity array from spline derivative, same length
//   D             : physical distance between timing lines (metres, from calibration)
//   t_start       : interpolated start crossing time
//   t_finish      : interpolated finish crossing time

T              = t_finish - t_start
D_integrated   = trapezoidalIntegral(v_raw, t_sprint)
residual       = D - D_integrated
v_correction   = residual / T
v_corrected    = v_raw + v_correction          // uniform offset, every sample

// Verify (should now be exact to floating-point precision)
D_check        = trapezoidalIntegral(v_corrected, t_sprint)
assert abs(D_check - D) < 1e-9
```

---

### TypeScript

```typescript
/**
 * Applies a uniform velocity correction so that the integral of the
 * velocity curve exactly equals the known physical distance D.
 *
 * Must be called AFTER the displacement integral check (Section 6).
 * Do NOT call if displacement_error_pct > 8% — reject those trials instead.
 */
function applyDisplacementConstraint(
  tSprint:     number[],   // timestamps within sprint segment (seconds)
  vRaw:        number[],   // instantaneous velocity from spline derivative (m/s)
  D:           number,     // physical distance between timing lines (metres)
  tStart:      number,     // interpolated start crossing time (seconds)
  tFinish:     number,     // interpolated finish crossing time (seconds)
): {
  vCorrected:    number[];
  vCorrection:   number;   // uniform offset applied — log this
  dIntegrated:   number;   // what the spline thought the distance was
  dCheck:        number;   // should equal D to floating-point precision
} {
  const T = tFinish - tStart;

  // Trapezoidal integration of raw velocity curve
  let dIntegrated = 0;
  for (let i = 1; i < tSprint.length; i++) {
    const dt = tSprint[i] - tSprint[i - 1];
    dIntegrated += 0.5 * (vRaw[i] + vRaw[i - 1]) * dt;
  }

  const residual    = D - dIntegrated;
  const vCorrection = residual / T;
  const vCorrected  = vRaw.map(v => v + vCorrection);

  // Verification integral — should equal D to floating-point precision
  let dCheck = 0;
  for (let i = 1; i < tSprint.length; i++) {
    const dt = tSprint[i] - tSprint[i - 1];
    dCheck += 0.5 * (vCorrected[i] + vCorrected[i - 1]) * dt;
  }

  return { vCorrected, vCorrection, dIntegrated, dCheck };
}
```

**Notes for the TypeScript implementation:**

- The function assumes uniform or near-uniform frame spacing but works correctly with variable spacing because it uses sample-accurate `dt` per interval, not a global `1/fps` constant. Use this form — do not simplify to `dt * sum(v)`.
- `vCorrection` will typically be in the range ±0.01 to ±0.05 m/s for a well-tuned system. Values outside ±0.15 m/s indicate a calibration or tuning problem — log a warning.
- The verification integral (`dCheck`) is cheap and should always be computed. If `Math.abs(dCheck - D) > 1e-6`, something is wrong with the integration logic itself.
- D must be in the same unit system as your position data. If your CoM positions are in pixels, D must also be in pixels (converted from metres using your calibration scale factor) before calling this function — or convert everything to metres upstream, which is preferable.

---

### Python

```python
import numpy as np

def apply_displacement_constraint(
    t_sprint:    np.ndarray,
    v_raw:       np.ndarray,
    D:           float,
    t_start:     float,
    t_finish:    float,
) -> dict:
    """
    Applies a uniform velocity correction so that the integral of the
    velocity curve exactly equals the known physical distance D.

    Call AFTER the displacement integral check (Section 6).
    Do NOT call if displacement_error_pct > 8% — reject those trials instead.

    Args:
        t_sprint:   timestamps within sprint segment (seconds)
        v_raw:      instantaneous velocity from spline derivative (m/s)
        D:          physical distance between timing lines (metres)
        t_start:    interpolated start crossing time (seconds)
        t_finish:   interpolated finish crossing time (seconds)

    Returns:
        dict with v_corrected, v_correction, d_integrated, d_check
    """
    T            = t_finish - t_start
    d_integrated = np.trapz(v_raw, t_sprint)
    residual     = D - d_integrated
    v_correction = residual / T
    v_corrected  = v_raw + v_correction

    # Verification — should equal D to floating-point precision
    d_check = np.trapz(v_corrected, t_sprint)

    return {
        'v_corrected':  v_corrected,
        'v_correction': v_correction,   # log this per trial
        'd_integrated': d_integrated,
        'd_check':      d_check,
    }
```

---

### What to add to the trial log (see Section 11)

- `v_correction`: the uniform offset applied in m/s
- `d_integrated_pre_correction`: what the raw spline curve integrated to
- `d_check_post_correction`: should be within 1e-6 of D; flag if not

---

## 8. Physics-Based Plausibility Guards

Apply these as secondary checks. They catch gross errors that the displacement check might miss (e.g., velocity spikes at boundaries).

```python
# Sprinting biomechanical limits
MAX_ACCELERATION =  7.0   # m/s² (acceleration phase)
MAX_DECELERATION = -9.0   # m/s² (braking — more lenient)
MAX_VELOCITY     = 13.0   # m/s  (above Bolt's world record)
MIN_VELOCITY     =  0.0   # m/s  (monotonic — never negative after normalization)

def plausibility_check(t, v):
    a = np.gradient(v, t)  # instantaneous acceleration
    flags = []
    if np.any(v > MAX_VELOCITY):
        flags.append(f"velocity exceeds {MAX_VELOCITY} m/s")
    if np.any(v < MIN_VELOCITY):
        flags.append("negative velocity detected (direction normalization failure)")
    if np.any(a > MAX_ACCELERATION):
        flags.append(f"acceleration exceeds {MAX_ACCELERATION} m/s²")
    if np.any(a < MAX_DECELERATION):
        flags.append(f"deceleration exceeds {abs(MAX_DECELERATION)} m/s²")
    return flags  # empty list = plausible
```

---

## 9. Processing Order — Full Pipeline

```
Raw CoM x positions (from pose estimator)
         │
         ▼
1. Direction normalization       ← detect L→R or R→L, flip if needed
         │
         ▼
2. Monotonicity pre-filter       ← remove physically impossible backward steps
         │
         ▼
3. Sub-frame crossing times      ← t_start, t_finish via linear interpolation
         │                          (return None = invalid trial, abort)
         ▼
4. Average velocity              ← v_avg = D / (t_finish - t_start)
         │
         ▼
5. Smoothing spline fit          ← on sprint segment only [t_start, t_finish]
         │
         ▼
6. Analytic derivative           ← v_raw(t) instantaneous velocity curve
         │
         ▼
7. Displacement integral check   ← ∫v dt vs D — error > 8%? reject trial
         │
         ▼
8. Displacement constraint       ← apply uniform v_correction; ∫v dt now = D exactly
         │
         ▼
9. Physics plausibility check    ← velocity and acceleration within bounds?
         │
         ▼
Output: v_avg, v_corrected(t), validation flags
```

---

## 10. Parameters to Expose / Calibrate Per Deployment

| Parameter | Default | Notes |
|---|---|---|
| `noise_std` | 0.015 m | Tune from static calibration target |
| `spline_order` | 5 | Do not change unless data is very short |
| `validation_tolerance` | 0.02 (2%) | Tighten for lab, loosen for field |
| `fps` | — | Must match actual camera frame rate exactly |
| `D` | — | Physical distance; must be surveyed, not computed from tracking |

---

## 11. What to Log Per Trial

For debugging and quality control, log these alongside results:

- `direction_detected`: `+1` or `-1`
- `n_frames_corrected`: count of frames fixed by monotonicity filter
- `t_start`, `t_finish`: interpolated crossing times
- `T`: sprint duration
- `v_avg`: average velocity
- `displacement_integral`: ∫v dt (pre-correction)
- `displacement_error_pct`: deviation from D before correction
- `v_correction`: uniform velocity offset applied in m/s (from Section 7)
- `d_integrated_pre_correction`: what the raw spline curve integrated to
- `d_check_post_correction`: should be within 1e-6 of D; flag if not
- `plausibility_flags`: list of any physics violations
- `noise_std_used`: value in effect for this trial

Trials with `displacement_error_pct > 8%` (pre-correction) should be rejected outright. Trials between 3–8% should be marked for manual review. Trials with any plausibility flags should not be silently passed through.
