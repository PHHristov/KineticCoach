import { L, type Point, type Point3 } from './landmarks';

/**
 * Generates landmarks of a simulated person squatting. Used by the analyzer tests
 * (scripts/test-squat.ts) and by the form-check demo mode (/form-check?demo=1).
 */

export type Fault = {
  lean?: number; // torso lean multiplier (normal 0.45)
  heelLift?: number; // heel rise at the bottom, image units
  valgus?: number; // knees move inwards at the bottom, image units
  shift?: number; // one hip drops at the bottom, image units
};

export type SimOptions = {
  view: 'side' | 'front';
  reps: number;
  eccSec: number;
  conSec: number;
  minAngle: number;
  fps?: number;
  fault?: Fault;
  noise?: number;
  hiddenFrom?: number; // seconds: landmarks invisible from this time on
};

const SHIN = 0.22;
const THIGH = 0.22;
const TORSO = 0.3;

/** Builds 33 landmarks for a given knee angle (180 = standing). */
export function simulatePose(k: number, o: SimOptions, depthFrac: number, rand: () => number): { image: Point[]; world: Point3[] } {
  const f = o.fault ?? {};
  const flex = 180 - k;
  const alpha = (flex * 0.4 * Math.PI) / 180; // shin tilts forward
  const lean = (flex * (f.lean ?? 0.45) * Math.PI) / 180; // torso leans forward
  const kRad = (k * Math.PI) / 180;
  // Sagittal plane: u = forward, v = down.
  const ankle = { u: 0, v: 0.9 };
  const knee = { u: ankle.u + SHIN * Math.sin(alpha), v: ankle.v - SHIN * Math.cos(alpha) };
  const phiA = Math.atan2(Math.cos(alpha), -Math.sin(alpha));
  const phiH = phiA + kRad;
  const hip = { u: knee.u + THIGH * Math.cos(phiH), v: knee.v + THIGH * Math.sin(phiH) };
  const sh = { u: hip.u + TORSO * Math.sin(lean), v: hip.v - TORSO * Math.cos(lean) };
  const heelRise = (f.heelLift ?? 0) * depthFrac;
  const heel = { u: ankle.u - 0.03, v: ankle.v + 0.02 - heelRise };
  const foot = { u: ankle.u + 0.06, v: ankle.v + 0.02 };

  const image: Point[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
  const world: Point3[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0.9 }));
  const n = () => (rand() - 0.5) * 2 * (o.noise ?? 0);
  const seg = { sh, hip, knee, ankle, heel, foot };
  const idx = {
    sh: [L.leftShoulder, L.rightShoulder],
    hip: [L.leftHip, L.rightHip],
    knee: [L.leftKnee, L.rightKnee],
    ankle: [L.leftAnkle, L.rightAnkle],
    heel: [L.leftHeel, L.rightHeel],
    foot: [L.leftFoot, L.rightFoot],
  } as const;
  const halfWidth = { sh: 0.09, hip: 0.06, knee: 0.06, ankle: 0.06, heel: 0.06, foot: 0.07 };

  for (const name of Object.keys(seg) as (keyof typeof seg)[]) {
    const pt = seg[name];
    idx[name].forEach((i, side) => {
      const sign = side === 0 ? -1 : 1;
      if (o.view === 'side') {
        // Camera looks from the side: forward = +x. The far side is slightly offset and less visible.
        image[i] = { x: 0.5 + pt.u + sign * 0.01 + n(), y: pt.v + n(), visibility: side === 0 ? 0.95 : 0.6 };
      } else {
        // Camera looks from the front: left/right spread on x, forward is depth.
        let x = 0.5 + sign * halfWidth[name];
        if (name === 'knee') x -= sign * (f.valgus ?? 0) * depthFrac;
        let y = pt.v;
        if (name === 'hip' && side === 0) y += (f.shift ?? 0) * depthFrac;
        image[i] = { x: x + n(), y: y + n(), visibility: 0.95 };
      }
      world[i] = { x: o.view === 'side' ? pt.u : sign * halfWidth[name], y: pt.v, z: o.view === 'side' ? sign * 0.05 : -pt.u };
    });
  }
  // Arms held out in front (as in a bodyweight squat), so the skeleton looks complete.
  for (const [shoulder, elbow, wrist] of [[11, 13, 15], [12, 14, 16]] as const) {
    const sp = image[shoulder];
    const sw = world[shoulder];
    image[elbow] = { x: sp.x + (o.view === 'side' ? 0.13 : 0), y: sp.y + 0.03, visibility: sp.visibility };
    image[wrist] = { x: sp.x + (o.view === 'side' ? 0.26 : 0), y: sp.y + 0.04, visibility: sp.visibility };
    world[elbow] = { x: sw.x + 0.13, y: sw.y + 0.03, z: sw.z };
    world[wrist] = { x: sw.x + 0.26, y: sw.y + 0.04, z: sw.z };
  }
  return { image, world };
}

export function ease(x: number) {
  return (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, x)))) / 2;
}

/** Knee angle and depth (0–1) at time t (seconds) for a repeating squat. */
export function squatAt(t: number, o: SimOptions, standSec = 1.2, pauseSec = 0.25, leadIn = 1.5): { k: number; depth: number } {
  const rep = standSec + o.eccSec + pauseSec + o.conSec;
  const r = t - leadIn;
  if (r <= 0 || r >= o.reps * rep) return { k: 178, depth: 0 };
  const p = r % rep;
  let depth = 0;
  if (p < standSec) depth = 0;
  else if (p < standSec + o.eccSec) depth = ease((p - standSec) / o.eccSec);
  else if (p < standSec + o.eccSec + pauseSec) depth = 1;
  else depth = 1 - ease((p - standSec - o.eccSec - pauseSec) / o.conSec);
  return { k: 178 - (178 - o.minAngle) * depth, depth };
}

/** Reps played in demo mode: one clean rep, then common mistakes. */
const DEMO_REPS: Pick<SimOptions, 'eccSec' | 'conSec' | 'minAngle' | 'fault'>[] = [
  { eccSec: 2.4, conSec: 0.8, minAngle: 78 },
  { eccSec: 0.7, conSec: 0.8, minAngle: 80 },
  { eccSec: 2.2, conSec: 0.9, minAngle: 82, fault: { lean: 0.8 } },
  { eccSec: 2.2, conSec: 2.0, minAngle: 115 },
];

/** Landmarks for demo mode at time t (seconds): stands, then loops through DEMO_REPS side-on. */
export function demoFrame(t: number): { image: Point[]; world: Point3[] } {
  const stand = 1.2;
  const pause = 0.25;
  const lens = DEMO_REPS.map((r) => stand + r.eccSec + pause + r.conSec);
  const cycle = lens.reduce((a, b) => a + b, 0);
  let local = Math.max(0, t - 1.5) % cycle;
  let i = 0;
  while (local >= lens[i]) local -= lens[i++];
  const rep = { ...DEMO_REPS[i], view: 'side' as const, reps: 1, noise: 0.0015 };
  const { k, depth } = t < 1.5 ? { k: 178, depth: 0 } : squatAt(local, rep, stand, pause, 0);
  let seed = Math.floor(t * 1000) + 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return simulatePose(k, rep, depth, rand);
}
