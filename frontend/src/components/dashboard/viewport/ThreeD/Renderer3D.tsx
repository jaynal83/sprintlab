// ─── GLB Character Body Renderer (Path A) ─────────────────────────────────────
// Drives a Mixamo GLB skeleton directly from pose landmarks.
// Each bone rotation is computed from the vector between two landmarks,
// mirroring the same logic orientCylinder used for procedural geometry.

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewport, useGLTF } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import * as THREE from 'three';
import type { Keypoint3D } from '../PoseEngine/usePoseLandmarker';

interface Props {
  getKeypoints3D: (frame: number) => Keypoint3D[];
  currentFrame: number;
}

type Vec3 = [number, number, number];

// ── Normalisation ─────────────────────────────────────────────────────────────
const LR_PAIRS: [number, number][] = [
  [5, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16],
];
const MIN_HALF_SEP = 0.55 * 0.36;

function normalize(raw: Keypoint3D[]): Vec3[] | null {
  const lh = raw[11], rh = raw[12];
  if (!lh || !rh) return null;

  const ox = (lh.x + rh.x) / 2;
  const oy = (lh.y + rh.y) / 2;
  const oz = (lh.z + rh.z) / 2;

  const ls = raw[5], rs = raw[6];
  const shoulderY = ls && rs ? (ls.y + rs.y) / 2 : null;
  const torsoH = shoulderY !== null ? Math.abs(shoulderY - oy) : 0;
  const scale  = torsoH > 0.001 ? 0.55 / torsoH : 0.01;
  const zScale = scale * 5;

  const pts: Vec3[] = raw.map((k) => [
    (k.x - ox) * scale,
    -(k.y - oy) * scale,
    (k.z - oz) * zScale,
  ]);

  for (const [li, ri] of LR_PAIRS) {
    const lp = pts[li], rp = pts[ri];
    if (!lp || !rp) continue;
    const zMid = (lp[2] + rp[2]) / 2;
    lp[2] = zMid + MIN_HALF_SEP;
    rp[2] = zMid - MIN_HALF_SEP;
  }

  // Foot landmarks follow their ankle's z so heel/toe segments stay in one plane.
  const lAnk = pts[15], rAnk = pts[16];
  if (lAnk) { if (pts[17]) pts[17][2] = lAnk[2]; if (pts[19]) pts[19][2] = lAnk[2]; }
  if (rAnk) { if (pts[20]) pts[20][2] = rAnk[2]; if (pts[22]) pts[22][2] = rAnk[2]; }

  return pts;
}

function midpoint(a: Vec3, b: Vec3): Vec3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

// ── Bone driving ──────────────────────────────────────────────────────────────
// Scratch objects — allocated once to avoid GC pressure per frame.
const _worldDir   = new THREE.Vector3();
const _localDir   = new THREE.Vector3();
const _parentInvQ = new THREE.Quaternion();

/**
 * Orient `bone` so its segment (bone → first child) points from `from` toward `to`.
 * `canonicalDir` is the normalised direction bone → child in bone-local space
 * when bone.quaternion = identity (i.e. normalise(child.position)).
 */
function driveBone(
  bone: THREE.Bone | undefined,
  from: Vec3 | undefined,
  to: Vec3 | undefined,
  canonicalDir: THREE.Vector3,
) {
  if (!bone || !from || !to) return;

  // Desired direction in world space
  _worldDir.set(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  if (_worldDir.lengthSq() < 1e-8) return;
  _worldDir.normalize();

  // Transform to parent-local space
  const parent = bone.parent;
  if (parent) {
    parent.getWorldQuaternion(_parentInvQ);
    _parentInvQ.invert();
    _localDir.copy(_worldDir).applyQuaternion(_parentInvQ);
  } else {
    _localDir.copy(_worldDir);
  }

  // Rotate canonical dir → desired local dir
  bone.quaternion.setFromUnitVectors(canonicalDir, _localDir);
  bone.updateMatrixWorld(true);
}

// ── Character component ───────────────────────────────────────────────────────
function CharacterBody({ getKeypoints3D, currentFrame }: Props) {
  const { scene } = useGLTF('/character.glb');

  // Clone so we never mutate the cached scene
  const cloned = useMemo(() => SkeletonUtils.clone(scene) as THREE.Group, [scene]);

  // Index all bones by name + save bind-pose quaternions for per-frame reset.
  const { bones, bindQuats } = useMemo(() => {
    const map: Record<string, THREE.Bone> = {};
    cloned.traverse((obj) => {
      if ((obj as THREE.Bone).isBone) map[obj.name] = obj as THREE.Bone;
    });
    const bq: Record<string, THREE.Quaternion> = {};
    for (const [name, bone] of Object.entries(map)) bq[name] = bone.quaternion.clone();
    return { bones: map, bindQuats: bq };
  }, [cloned]);

  // For each driven bone, canonical = direction from bone toward its first child bone
  // in the bone's parent-local space when bone.quaternion = identity.
  const canonical = useMemo(() => {
    const get = (name: string): THREE.Vector3 => {
      const bone = bones[name];
      if (!bone) { console.warn('[Renderer3D] bone not found:', name); return new THREE.Vector3(0, 1, 0); }
      const child = bone.children.find((c): c is THREE.Bone => (c as THREE.Bone).isBone);
      if (!child) { console.warn('[Renderer3D] no child bone for:', name); return new THREE.Vector3(0, 1, 0); }
      return child.position.clone().normalize();
    };
    return {
      spine:          get('mixamorigSpine'),
      spine1:         get('mixamorigSpine1'),
      spine2:         get('mixamorigSpine2'),
      neck:           get('mixamorigNeck'),
      leftShoulder:   get('mixamorigLeftShoulder'),
      rightShoulder:  get('mixamorigRightShoulder'),
      leftArm:        get('mixamorigLeftArm'),
      leftForeArm:    get('mixamorigLeftForeArm'),
      rightArm:       get('mixamorigRightArm'),
      rightForeArm:   get('mixamorigRightForeArm'),
      leftUpLeg:      get('mixamorigLeftUpLeg'),
      leftLeg:        get('mixamorigLeftLeg'),
      rightUpLeg:     get('mixamorigRightUpLeg'),
      rightLeg:       get('mixamorigRightLeg'),
      leftFoot:       get('mixamorigLeftFoot'),
      rightFoot:      get('mixamorigRightFoot'),
    };
  }, [bones]);

  // Scale cloned scene so the character's bind-pose torso = 0.55 scene units,
  // and offset in Y so the hips sit at y = 0 (matching our normalized space).
  const { charScale, hipOffsetY } = useMemo(() => {
    const hipBone    = bones['mixamorigHips'];
    const spine2     = bones['mixamorigSpine2'] ?? bones['mixamorigSpine1'] ?? bones['mixamorigSpine'];
    if (!hipBone || !spine2) return { charScale: 1, hipOffsetY: 0 };

    const hipPos   = new THREE.Vector3();
    const spinePos = new THREE.Vector3();
    hipBone.getWorldPosition(hipPos);
    spine2.getWorldPosition(spinePos);

    const bindTorsoH = Math.abs(spinePos.y - hipPos.y);
    const s = bindTorsoH > 0.001 ? 0.55 / bindTorsoH : 1;

    // After scaling, hips will be at s * hipPos.y — we want that at y = 0
    return { charScale: s, hipOffsetY: -(s * hipPos.y) };
  }, [bones]);

  const lastFrame = useRef(-1);

  useFrame(() => {
    if (lastFrame.current === currentFrame) return;
    lastFrame.current = currentFrame;

    // Reset every bone to bind pose so parent world-matrices are clean before driving.
    for (const [name, bone] of Object.entries(bones)) {
      const bq = bindQuats[name];
      if (bq) bone.quaternion.copy(bq);
    }

    cloned.updateMatrixWorld(true);

    const raw = getKeypoints3D(currentFrame);
    const pts = raw.length ? normalize(raw) : null;
    if (!pts) return;

    const lSh  = pts[5],  rSh  = pts[6];
    const lEl  = pts[7],  rEl  = pts[8];
    const lWr  = pts[9],  rWr  = pts[10];
    const lHip = pts[11], rHip = pts[12];
    const lKn  = pts[13], rKn  = pts[14];
    const lAn  = pts[15], rAn  = pts[16];
    const nose = pts[0];

    const shMid  = lSh  && rSh  ? midpoint(lSh,  rSh)  : null;
    const hipMid = lHip && rHip ? midpoint(lHip, rHip) : null;

    // Drive root → leaves so each parent's world matrix is correct before its children.

    // Spine chain
    if (shMid && hipMid) {
      driveBone(bones['mixamorigSpine'],  hipMid, shMid, canonical.spine);
      driveBone(bones['mixamorigSpine1'], hipMid, shMid, canonical.spine1);
      driveBone(bones['mixamorigSpine2'], hipMid, shMid, canonical.spine2);
    }

    // Arms
    driveBone(bones['mixamorigLeftArm'],      lSh,  lEl,  canonical.leftArm);
    driveBone(bones['mixamorigLeftForeArm'],  lEl,  lWr,  canonical.leftForeArm);
    driveBone(bones['mixamorigRightArm'],     rSh,  rEl,  canonical.rightArm);
    driveBone(bones['mixamorigRightForeArm'], rEl,  rWr,  canonical.rightForeArm);

    // Legs
    driveBone(bones['mixamorigLeftUpLeg'],  lHip, lKn,  canonical.leftUpLeg);
    driveBone(bones['mixamorigLeftLeg'],    lKn,  lAn,  canonical.leftLeg);
    driveBone(bones['mixamorigRightUpLeg'], rHip, rKn,  canonical.rightUpLeg);
    driveBone(bones['mixamorigRightLeg'],   rKn,  rAn,  canonical.rightLeg);

    // Feet: 2D front-view landmarks don't give reliable forward direction for feet,
    // so let the foot bones stay at bind pose (roughly flat/forward). No drive.

    // Neck
    if (shMid && nose) driveBone(bones['mixamorigNeck'], shMid, nose, canonical.neck);

    // Force all SkinnedMeshes to re-skin with the updated bone matrices.
    cloned.traverse((obj) => {
      if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
        (obj as THREE.SkinnedMesh).skeleton.update();
      }
    });
  });

  return (
    <group position={[0, hipOffsetY, 0]} scale={charScale} rotation={[0, -Math.PI / 2, 0]}>
      <primitive object={cloned} />
    </group>
  );
}

// ── Ground ────────────────────────────────────────────────────────────────────
const FOOT_IDX = [15, 16, 17, 19, 20, 22];
function groundY(pts: Vec3[]): number {
  const ys = FOOT_IDX.map((i) => pts[i]?.[1] ?? Infinity).filter(isFinite);
  return ys.length ? Math.min(...ys) : -0.8;
}

// ── Camera ────────────────────────────────────────────────────────────────────
const ISO_POS: [number, number, number]    = [1.8, 0.25, 1.8];
const ISO_TARGET: [number, number, number] = [0, 0.05, 0];
const ISO_ZOOM = 200;

// ── Export ────────────────────────────────────────────────────────────────────
export function Renderer3D({ getKeypoints3D, currentFrame }: Props) {
  const raw = getKeypoints3D(currentFrame);
  const pts = raw.length ? normalize(raw) : null;

  if (!pts) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
        <span className="text-zinc-500 text-xs font-mono uppercase tracking-widest">
          No 3D pose data for this frame
        </span>
      </div>
    );
  }

  return (
    <div className="absolute inset-0">
      <Canvas
        orthographic
        camera={{ position: ISO_POS, zoom: ISO_ZOOM, up: [0, 1, 0] }}
        gl={{ antialias: true }}
        style={{ background: '#09090b' }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[3, 6, 4]} intensity={1.2} />
        <directionalLight position={[-3, 2, -2]} intensity={0.3} />
        <directionalLight position={[0, -2, -4]} intensity={0.4} color="#8fbcd4" />

        <CharacterBody getKeypoints3D={getKeypoints3D} currentFrame={currentFrame} />

        <Grid
          position={[0, groundY(pts) - 0.02, 0]}
          args={[12, 12]}
          cellSize={0.25}
          cellThickness={0.4}
          cellColor="#27272a"
          sectionSize={1}
          sectionThickness={0.8}
          sectionColor="#3f3f46"
          fadeDistance={14}
          fadeStrength={2}
          infiniteGrid
        />

        <OrbitControls makeDefault target={ISO_TARGET} minDistance={0.5} maxDistance={12} enablePan />

        <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
          <GizmoViewport axisColors={['#f87171', '#4ade80', '#60a5fa']} labelColor="white" />
        </GizmoHelper>
      </Canvas>

      <div className="absolute top-2 left-2 pointer-events-none">
        <span className="text-[9px] uppercase tracking-widest text-zinc-600 font-mono">
          3D · GLB · Drag to orbit · Scroll to zoom
        </span>
      </div>
    </div>
  );
}
