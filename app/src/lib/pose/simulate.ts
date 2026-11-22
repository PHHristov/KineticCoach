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

/* ---------------- bicep curl ---------------- */

export type CurlFault = {
  /** Upper arm swings forward by this many degrees at the top. */
  elbowDrift?: number;
  /** Torso rocks back by this many degrees at the top. */
  swing?: number;
  /** Elbows move out sideways at the top (image units). */
  flare?: number;
  /** Shoulders rise at the top (image units). */
  shrug?: number;
};

export type CurlSimOptions = {
  view: 'side' | 'front';
  reps: number;
  conSec: number;
  eccSec: number;
  /** Smallest elbow angle at the top. */
  topAngle: number;
  /** Elbow angle when the arm is down. */
  startAngle?: number;
  /** both = together, alternate = left then right, left = only the left arm moves. */
  arms?: 'both' | 'alternate' | 'left';
  fault?: CurlFault;
  /** Random jitter on every landmark, image and 3D (like real tracking noise). */
  noise?: number;
  fps?: number;
};

const UPPER = 0.15;
const FORE = 0.14;
const TRUNK = 0.3;

/** Elbow angle for one arm at time t; `slot` picks which rep slots this arm curls in. */
export function curlAt(t: number, o: CurlSimOptions, slot: 'all' | 'even' | 'odd' = 'all', leadIn = 1.5) {
  const start = o.startAngle ?? 170;
  const rest = 1.0;
  const pause = 0.3;
  const len = rest + o.conSec + pause + o.eccSec;
  const r = t - leadIn;
  const total = (slot === 'all' ? o.reps : o.reps * 2) * len;
  if (r <= 0 || r >= total) return { e: start, prog: 0 };
  const i = Math.floor(r / len);
  if ((slot === 'even' && i % 2) || (slot === 'odd' && i % 2 === 0)) return { e: start, prog: 0 };
  const p = r % len;
  let prog = 0;
  if (p < rest) prog = 0;
  else if (p < rest + o.conSec) prog = ease((p - rest) / o.conSec);
  else if (p < rest + o.conSec + pause) prog = 1;
  else prog = 1 - ease((p - rest - o.conSec - pause) / o.eccSec);
  return { e: start - (start - o.topAngle) * prog, prog };
}

/** Landmarks of a person standing and curling, with the given elbow angles per arm. */
export function simulateCurlPose(
  arms: { left: { e: number; prog: number }; right: { e: number; prog: number } },
  o: CurlSimOptions,
  rand: () => number,
): { image: Point[]; world: Point3[] } {
  const f = o.fault ?? {};
  const n = () => (rand() - 0.5) * 2 * (o.noise ?? 0);
  const image: Point[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
  const world: Point3[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0.9 }));
  const progMax = Math.max(arms.left.prog, arms.right.prog);
  const lean = ((f.swing ?? 0) * progMax * Math.PI) / 180; // leaning back
  const shrug = (f.shrug ?? 0) * progMax;

  // Legs and hips: standing straight.
  const hipY = 0.62;
  const set = (i: number, x: number, y: number, wx: number, wy: number, wz: number, v = 0.95) => {
    image[i] = { x: x + n(), y: y + n(), visibility: v };
    world[i] = { x: wx + n(), y: wy + n(), z: wz + n(), visibility: v };
  };
  const sides = [
    { s: 'left' as const, sign: -1, sh: L.leftShoulder, el: L.leftElbow, wr: L.leftWrist, hip: L.leftHip, knee: L.leftKnee, ankle: L.leftAnkle, heel: L.leftHeel, foot: L.leftFoot },
    { s: 'right' as const, sign: 1, sh: L.rightShoulder, el: L.rightElbow, wr: L.rightWrist, hip: L.rightHip, knee: L.rightKnee, ankle: L.rightAnkle, heel: L.rightHeel, foot: L.rightFoot },
  ];
  for (const d of sides) {
    const arm = arms[d.s];
    const drift = (((f.elbowDrift ?? 0) * arm.prog + 5) * Math.PI) / 180; // upper arm angle from vertical
    const theta = drift + ((180 - arm.e) * Math.PI) / 180; // forearm angle from straight down
    // Sagittal-plane positions (u = forward, v = down) for shoulder/elbow/wrist.
    const sh = { u: TRUNK * Math.sin(-lean), v: hipY - TRUNK * Math.cos(lean) - shrug };
    const el = { u: sh.u + UPPER * Math.sin(drift), v: sh.v + UPPER * Math.cos(drift) };
    const wr = { u: el.u + FORE * Math.sin(theta), v: el.v + FORE * Math.cos(theta) };
    const flare = (f.flare ?? 0) * arm.prog;
    if (o.view === 'side') {
      const vis = d.s === 'left' ? 0.95 : 0.6;
      const off = d.sign * 0.01;
      set(d.sh, 0.5 + sh.u + off, sh.v, sh.u, sh.v, d.sign * 0.18, vis);
      set(d.el, 0.5 + el.u + off, el.v, el.u, el.v, d.sign * 0.2, vis);
      set(d.wr, 0.5 + wr.u + off, wr.v, wr.u, wr.v, d.sign * 0.2, vis);
      set(d.hip, 0.5 + off, hipY, 0, hipY, d.sign * 0.1, vis);
      set(d.knee, 0.5 + off, hipY + 0.2, 0, hipY + 0.2, d.sign * 0.1, vis);
      set(d.ankle, 0.5 + off, hipY + 0.4, 0, hipY + 0.4, d.sign * 0.1, vis);
      set(d.heel, 0.47 + off, hipY + 0.42, -0.03, hipY + 0.42, d.sign * 0.1, vis);
      set(d.foot, 0.56 + off, hipY + 0.42, 0.06, hipY + 0.42, d.sign * 0.1, vis);
    } else {
      const shX = 0.5 + d.sign * 0.09;
      const elX = shX + d.sign * flare;
      // Facing the camera: forward motion becomes depth (z), so only y changes on screen.
      set(d.sh, shX, sh.v, d.sign * 0.09, sh.v, -sh.u);
      set(d.el, elX, el.v, d.sign * 0.09 + d.sign * flare, el.v, -el.u);
      set(d.wr, elX, wr.v, d.sign * 0.09 + d.sign * flare, wr.v, -wr.u);
      set(d.hip, 0.5 + d.sign * 0.06, hipY, d.sign * 0.06, hipY, 0);
      set(d.knee, 0.5 + d.sign * 0.06, hipY + 0.2, d.sign * 0.06, hipY + 0.2, 0);
      set(d.ankle, 0.5 + d.sign * 0.06, hipY + 0.4, d.sign * 0.06, hipY + 0.4, 0);
      set(d.heel, 0.5 + d.sign * 0.06, hipY + 0.42, d.sign * 0.06, hipY + 0.42, 0.03);
      set(d.foot, 0.5 + d.sign * 0.07, hipY + 0.43, d.sign * 0.07, hipY + 0.43, -0.06);
    }
  }
  return { image, world };
}

/** Curl demo: side-on, one clean rep then common mistakes, looping. */
const CURL_DEMO: Pick<CurlSimOptions, 'conSec' | 'eccSec' | 'topAngle' | 'fault'>[] = [
  { conSec: 1.0, eccSec: 2.5, topAngle: 40 },
  { conSec: 1.0, eccSec: 0.6, topAngle: 42 },
  { conSec: 1.1, eccSec: 2.2, topAngle: 45, fault: { elbowDrift: 40 } },
  { conSec: 0.9, eccSec: 2.2, topAngle: 45, fault: { swing: 20 } },
  { conSec: 1.0, eccSec: 2.2, topAngle: 88 },
];

export function curlDemoFrame(t: number): { image: Point[]; world: Point3[] } {
  const slot = (r: { conSec: number; eccSec: number }) => 1.0 + r.conSec + 0.3 + r.eccSec;
  // Side-on mistakes first, then a short front-on section alternating arms (left + right = one rep).
  const alternate = { conSec: 1.0, eccSec: 2.2, topAngle: 42 };
  const sideLen = CURL_DEMO.map(slot).reduce((a, b) => a + b, 0);
  const frontLen = 4 * slot(alternate) + 1.5; // 1.5 s to turn and settle
  const cycle = sideLen + frontLen;
  let seed = Math.floor(t * 1000) + 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  if (t < 1.5) return simulateCurlPose({ left: { e: 170, prog: 0 }, right: { e: 170, prog: 0 } }, { ...CURL_DEMO[0], view: 'side', reps: 1, noise: 0.0015 }, rand);

  let local = (t - 1.5) % cycle;
  if (local < sideLen) {
    let i = 0;
    while (local >= slot(CURL_DEMO[i])) local -= slot(CURL_DEMO[i++]);
    const rep: CurlSimOptions = { ...CURL_DEMO[i], view: 'side', reps: 1, noise: 0.0015 };
    const arm = curlAt(local, rep, 'all', 0);
    return simulateCurlPose({ left: arm, right: arm }, rep, rand);
  }
  const opts: CurlSimOptions = { ...alternate, view: 'front', reps: 2, noise: 0.0015, arms: 'alternate' };
  const ft = local - sideLen;
  return simulateCurlPose({ left: curlAt(ft, opts, 'even'), right: curlAt(ft, opts, 'odd') }, opts, rand);
}
