import { CURL_CONFIG } from './curlAnalyzer';
import { angle3, L, type Point, type Point3 } from './landmarks';
import { curlAt, simulateCurlPose, simulatePose, squatAt } from './simulate';
import { CONFIG as SQUAT } from './squatAnalyzer';

/**
 * Technique guides: an animated "perfect rep" plus the targets the form checker uses.
 * Targets are built from the analyzer settings, so the guide and the checker always agree.
 */

export type GuideView = 'side' | 'front';

export type GuidePhase = {
  label: string;
  /** Spoken when the phase starts. */
  say: string;
  sec: number;
  /** Speak the seconds while this phase runs ("two", "three"). */
  count?: boolean;
};

export type Guide = {
  /** Resting position shown between reps. */
  rest: { label: string; sec: number };
  phases: GuidePhase[];
  /** Joint whose angle is shown live, e.g. "Elbow". */
  angleLabel: string;
  /** Key points; each mentions the number the checker looks for. */
  points: { title: string; detail: string }[];
  frame: (t: number, view: GuideView) => { image: Point[]; world: Point3[] };
  angle: (world: Point3[]) => number;
};

let seed = 1;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const CURL_UP = 1.0;
const CURL_SQUEEZE = 0.5;
const CURL_DOWN = 2.5;
const CURL_REST = 1.2;

export const CURL_GUIDE: Guide = {
  rest: { label: 'Arms straight, elbows at your sides', sec: CURL_REST },
  phases: [
    { label: 'Curl up', say: 'Curl up', sec: CURL_UP },
    { label: 'Squeeze', say: 'Squeeze', sec: CURL_SQUEEZE },
    { label: 'Lower slowly', say: 'Lower slowly', sec: CURL_DOWN, count: true },
  ],
  angleLabel: 'Elbow',
  points: [
    { title: 'Start with a straight arm', detail: `Let the arm hang fully straight at the bottom of every rep (elbow ${CURL_CONFIG.fullExtension}° or more).` },
    { title: 'Curl all the way up', detail: `Bring the hand up until the forearm nearly touches the upper arm (elbow ${CURL_CONFIG.fullTopAngle}° or less), then squeeze.` },
    { title: 'Elbows stay put', detail: `Only the forearm moves. The upper arm stays by your side; moving it forward more than ${CURL_CONFIG.elbowDrift}° counts as drifting.` },
    { title: 'No swinging', detail: `Stand tall with your core braced. Rocking the body more than ${CURL_CONFIG.swing}° means the weight is too heavy.` },
    { title: 'Tempo', detail: `Up in about ${CURL_UP} s, then lower in 2–3 s. Lowering in about a second counts as dropping the weight.` },
    { title: 'Facing the camera', detail: 'Keep your elbows close to your body (no flaring out) and your shoulders down (no shrugging).' },
  ],
  frame: (t, view) => {
    const o = { view, reps: 1, conSec: CURL_UP, eccSec: CURL_DOWN, topAngle: 40, noise: 0 } as const;
    const arm = curlAt(t % cycleLength(CURL_GUIDE), o, 'all', 0, CURL_REST, CURL_SQUEEZE);
    return simulateCurlPose({ left: arm, right: arm }, o, rand);
  },
  angle: (w) => angle3(w[L.leftShoulder], w[L.leftElbow], w[L.leftWrist]),
};

const SQ_STAND = 1.2;
const SQ_DOWN = 2.4;
const SQ_HOLD = 0.4;
const SQ_UP = 0.8;

export const SQUAT_GUIDE: Guide = {
  rest: { label: 'Stand tall, feet shoulder-width apart', sec: SQ_STAND },
  phases: [
    { label: 'Lower under control', say: 'Down', sec: SQ_DOWN, count: true },
    { label: 'Hips at knee level', say: 'Bottom', sec: SQ_HOLD },
    { label: 'Drive up!', say: 'Drive up', sec: SQ_UP },
  ],
  angleLabel: 'Knee',
  points: [
    { title: 'Depth', detail: `Sit back and down until your hips are level with your knees (knee ${SQUAT.depth.parallel}° or less). Deeper is fine if it stays comfortable.` },
    { title: 'Lower under control', detail: `Take ${SQUAT.eccentricControlled}–3 s on the way down. Under ${SQUAT.eccentricTooFast} s counts as dropping.` },
    { title: 'Drive up fast', detail: `Push the floor away and stand up in about ${SQUAT.concentricExplosive} s.` },
    { title: 'Chest up', detail: `Lean forward naturally, but keep your torso within about ${SQUAT.maxLean}° of upright.` },
    { title: 'Heels down', detail: 'Keep your whole foot on the floor; weight over the middle of the foot.' },
    { title: 'Facing the camera', detail: 'Knees track over your toes (they shouldn’t cave in) and your hips stay level.' },
  ],
  frame: (t, view) => {
    const o = { view, reps: 1, eccSec: SQ_DOWN, conSec: SQ_UP, minAngle: 85, noise: 0 } as const;
    const { k, depth } = squatAt(t % cycleLength(SQUAT_GUIDE), o, SQ_STAND, SQ_HOLD, 0);
    return simulatePose(k, o, depth, rand);
  },
  angle: (w) => angle3(w[L.leftHip], w[L.leftKnee], w[L.leftAnkle]),
};

export function cycleLength(g: Guide): number {
  return g.rest.sec + g.phases.reduce((n, p) => n + p.sec, 0);
}

/** Which phase is showing at time t, and how far into it. index -1 = resting. */
export function phaseAt(g: Guide, t: number): { index: number; label: string; elapsed: number; sec: number } {
  let local = t % cycleLength(g);
  if (local < g.rest.sec) return { index: -1, label: g.rest.label, elapsed: local, sec: g.rest.sec };
  local -= g.rest.sec;
  for (let i = 0; i < g.phases.length; i++) {
    const p = g.phases[i];
    if (local < p.sec || i === g.phases.length - 1) return { index: i, label: p.label, elapsed: Math.min(local, p.sec), sec: p.sec };
    local -= p.sec;
  }
  return { index: -1, label: g.rest.label, elapsed: 0, sec: g.rest.sec };
}
