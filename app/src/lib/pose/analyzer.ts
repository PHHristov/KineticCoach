import type { PoseFrame } from './landmarks';

/** Shared shapes for every exercise analyzer (squat, bicep curl, …). */

export type View = 'side' | 'front' | 'angled';

/**
 * start = resting position between reps (standing for squats, arms straight for curls).
 * eccentric = lowering the weight; concentric = lifting it.
 */
export type Phase = 'not-visible' | 'get-ready' | 'start' | 'eccentric' | 'concentric';

export type Tempo = 'controlled' | 'ok' | 'fast' | 'explosive' | 'slow';

export type IssueInfo = { cue: string; title: string; detail: string };

export type RepBase = {
  n: number;
  issues: string[];
  score: number;
  view: View;
  /** Degrees travelled by the main joint. */
  romDeg: number;
  eccentricSec: number;
  concentricSec: number;
  eccentric: Tempo;
  concentric: Tempo;
  /** Range of motion verdict, e.g. "Deep" or "Full range". */
  range: { label: string; good: boolean };
  /** Extra measurement line, e.g. "knee 80° at the bottom". */
  detail: string;
  side?: 'left' | 'right' | 'both';
};

export type LiveState<R extends RepBase = RepBase> = {
  phase: Phase;
  view: View;
  /** Short live reading of the main joint, e.g. "Knee 92°". */
  metric?: string;
  /** 0 at the start position, 1 at the target end of the movement. */
  progress: number;
  /** Rep counter. For two-arm exercises, left + right counts as one. */
  reps: number;
  /** Per-arm counts, when both arms have done reps. */
  perSide?: { left: number; right: number };
  lastRep?: R;
  /** Problems seen in the rep in progress (or the last rep between reps). */
  activeIssues: string[];
  /** Landmarks to draw in red. */
  badJoints: number[];
  inRep: boolean;
};

export type AnalyzerEvent<R extends RepBase = RepBase> =
  | { type: 'ready' }
  | { type: 'cue'; issue: string }
  /** newCount is false when the rep did not move the counter (the second arm of a pair). */
  | { type: 'rep'; rep: R; newCount?: boolean }
  | { type: 'partial' };

export interface PoseAnalyzer<R extends RepBase = RepBase> {
  update(f: PoseFrame): { state: LiveState<R>; events: AnalyzerEvent<R>[] };
  reset(): void;
  readonly reps: R[];
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Seconds → tempo verdict for the lowering phase. */
export function eccentricTempo(sec: number, controlled: number, tooFast: number): Tempo {
  return sec >= controlled ? 'controlled' : sec >= tooFast ? 'ok' : 'fast';
}

/** Seconds → tempo verdict for the lifting phase. */
export function concentricTempo(sec: number, explosive: number, tooSlow: number): Tempo {
  return sec <= explosive ? 'explosive' : sec <= tooSlow ? 'ok' : 'slow';
}

/**
 * Tracks how long each issue has persisted and fires a cue the first time it is
 * confirmed in a rep (with a cool-down between repeats of the same cue).
 */
export class IssueTracker {
  private streak = new Map<string, number>();
  private lastCue = new Map<string, number>();
  readonly issues = new Set<string>();

  constructor(private persistFrames: number, private cooldownMs: number) {}

  /** Returns true when the issue was just confirmed and a cue should be spoken. */
  flag(id: string, bad: boolean, now: number): boolean {
    const n = bad ? (this.streak.get(id) ?? 0) + 1 : 0;
    this.streak.set(id, n);
    if (n !== this.persistFrames || this.issues.has(id)) return false;
    this.issues.add(id);
    const last = this.lastCue.get(id) ?? -Infinity;
    if (now - last <= this.cooldownMs) return false;
    this.lastCue.set(id, now);
    return true;
  }

  /** Start a new rep: keep cue cool-downs, clear per-rep state. */
  nextRep() {
    this.streak.clear();
    this.issues.clear();
  }
}
