import {
  clamp,
  concentricTempo,
  eccentricTempo,
  type AnalyzerEvent as Event,
  type IssueInfo,
  type LiveState as Live,
  type Phase,
  type PoseAnalyzer,
  type RepBase,
  type View,
} from './analyzer';
import { angle3, dist2, L, leanFromVertical, mid, vis, type Point, type PoseFrame } from './landmarks';

export type { Phase, View };

/**
 * Real-time squat analysis from pose landmarks. Platform-independent: feed it one
 * frame at a time (web camera today, native camera later) and it returns the live
 * state plus events (instant form cues and finished reps).
 */

export type Depth = 'deep' | 'parallel' | 'half' | 'shallow';
export type IssueId = 'knees-in' | 'chest-forward' | 'heels-up' | 'shift' | 'fast-descent' | 'slow-ascent' | 'shallow';

export const ISSUES: Record<IssueId, IssueInfo> = {
  'knees-in': {
    cue: 'Knees out',
    title: 'Knees caving in',
    detail: 'Your knees moved inwards. Push them out over your toes; caving knees strain the knee ligaments.',
  },
  'chest-forward': {
    cue: 'Chest up',
    title: 'Leaning too far forward',
    detail: 'Your torso tipped far forward, which loads the lower back. Brace your core and keep your chest up.',
  },
  'heels-up': {
    cue: 'Heels down',
    title: 'Heels lifting',
    detail: 'Your heels came off the floor. Keep the weight over the middle of your foot; ankle mobility work helps.',
  },
  shift: {
    cue: 'Stay centred',
    title: 'Shifting to one side',
    detail: 'Your hips shifted sideways. Keep the weight even on both feet.',
  },
  'fast-descent': {
    cue: 'Slow down',
    title: 'Dropping too fast',
    detail: 'The way down was fast. Lower under control for about 2 seconds.',
  },
  'slow-ascent': {
    cue: 'Drive up',
    title: 'Slow on the way up',
    detail: 'The way up was slow. Drive up explosively, in about 1 second.',
  },
  shallow: {
    cue: 'Go deeper',
    title: 'Not deep enough',
    detail: 'You stopped above parallel. Aim for hips level with your knees, if your mobility allows.',
  },
};

/** Which checks each camera view can judge reliably. */
export const CHECKS_BY_VIEW: Record<View, IssueId[]> = {
  side: ['chest-forward', 'heels-up', 'shallow', 'fast-descent', 'slow-ascent'],
  front: ['knees-in', 'shift', 'shallow', 'fast-descent', 'slow-ascent'],
  angled: ['chest-forward', 'shallow', 'fast-descent', 'slow-ascent'],
};

export type RepResult = RepBase & {
  depth: Depth;
  /** Smallest hip–knee–ankle angle reached, degrees (lower = deeper). */
  minKneeAngle: number;
  issues: IssueId[];
};

export type LiveState = Live<RepResult>;
export type AnalyzerEvent = Event<RepResult>;

export const CONFIG = {
  /** Knee angle above which you count as standing. */
  standingAngle: 150,
  /** Degrees below standing that start a rep. */
  startRepDrop: 15,
  /** Degrees below standing that count as back at the top. */
  finishRepMargin: 10,
  /** A rep must get at least this low (knee angle) to count. */
  minRepAngle: 140,
  depth: { deep: 80, parallel: 100, half: 125 },
  /** Target tempo, seconds. */
  eccentricControlled: 2.0,
  eccentricTooFast: 1.2,
  concentricExplosive: 1.0,
  concentricTooSlow: 1.6,
  /** Live "slow down" when dropping faster than this (deg/s) for several frames. */
  liveFastDescentDegPerSec: 170,
  /** Torso lean from vertical (degrees) treated as too far forward. */
  maxLean: 55,
  /** Knee width / ankle width, relative to standing, below which knees are caving. */
  valgusRatio: 0.8,
  /** Heel rise relative to shin length. */
  heelLift: 0.12,
  /** Hip height difference relative to torso length. */
  shift: 0.1,
  /** Frames an issue must persist before it is flagged (filters jitter). */
  persistFrames: 4,
  /** Seconds between repeats of the same spoken cue. */
  cueCooldownSec: 2.5,
};

type RepAcc = {
  startT: number;
  minAngle: number;
  minT: number;
  bottomT?: number;
  maxSinceBottom: number;
  issues: Set<IssueId>;
  streak: Partial<Record<IssueId, number>>;
  hipBelowKnee: boolean;
  view: View;
};


export class SquatAnalyzer implements PoseAnalyzer<RepResult> {
  private angleS?: number;
  private vel = 0;
  private lastT?: number;
  private viewRatio?: number;
  private view: View = 'angled';
  private phase: Phase = 'get-ready';
  private topRef = 170;
  private topSince?: number;
  private lastTopT = 0;
  private rep: RepAcc | null = null;
  private results: RepResult[] = [];
  private lastCue = new Map<IssueId, number>();
  private kneeWidthBase?: number;
  private heelBase?: number;
  private hiddenSince?: number;
  private badJoints: number[] = [];

  get reps(): RepResult[] {
    return this.results;
  }

  reset() {
    Object.assign(this, new SquatAnalyzer());
  }

  update(f: PoseFrame): { state: LiveState; events: AnalyzerEvent[] } {
    const events: AnalyzerEvent[] = [];
    const p = f.image;
    const w = f.world;
    this.badJoints = [];

    // 1. Is the body in view?
    const sideVis = (hip: number, knee: number, ankle: number) => (vis(p[hip]) + vis(p[knee]) + vis(p[ankle])) / 3;
    const visL = sideVis(L.leftHip, L.leftKnee, L.leftAnkle);
    const visR = sideVis(L.rightHip, L.rightKnee, L.rightAnkle);
    if (!p.length || !w.length || Math.max(visL, visR) < 0.5) {
      this.hiddenSince ??= f.t;
      // Brief dropouts are ignored; a long one cancels the rep in progress.
      if (f.t - this.hiddenSince > 1500) {
        this.rep = null;
        this.phase = 'not-visible';
      }
      return { state: this.state(), events };
    }
    this.hiddenSince = undefined;
    if (this.phase === 'not-visible') this.phase = 'get-ready';

    // 2. Camera view: shoulders/hips look wide from the front and narrow from the side.
    const midSh = mid(p[L.leftShoulder], p[L.rightShoulder]);
    const midHip = mid(p[L.leftHip], p[L.rightHip]);
    const torso = Math.max(1e-3, dist2(midSh, midHip, f.aspect));
    const width = Math.max(
      Math.abs(p[L.leftShoulder].x - p[L.rightShoulder].x),
      Math.abs(p[L.leftHip].x - p[L.rightHip].x),
    ) * f.aspect;
    const ratio = width / torso;
    this.viewRatio = this.viewRatio === undefined ? ratio : this.viewRatio + (ratio - this.viewRatio) * 0.15;
    this.view = this.viewRatio > 0.55 ? 'front' : this.viewRatio < 0.3 ? 'side' : 'angled';

    // 3. Knee angle from 3D world landmarks (less sensitive to camera angle).
    const kneeL = angle3(w[L.leftHip], w[L.leftKnee], w[L.leftAnkle]);
    const kneeR = angle3(w[L.rightHip], w[L.rightKnee], w[L.rightAnkle]);
    const useLeft = visL >= visR;
    const raw =
      this.view === 'front' ? (kneeL * visL + kneeR * visR) / Math.max(1e-6, visL + visR) : useLeft ? kneeL : kneeR;

    // 4. Smooth the angle and its speed (time-based, so frame rate does not matter).
    const dt = this.lastT === undefined ? 1 / 30 : clamp((f.t - this.lastT) / 1000, 1 / 240, 0.25);
    this.lastT = f.t;
    const prev = this.angleS ?? raw;
    const a = 1 - Math.exp(-dt / 0.05);
    this.angleS = prev + (raw - prev) * a;
    const instVel = (this.angleS - prev) / dt;
    this.vel += (instVel - this.vel) * (1 - Math.exp(-dt / 0.08));
    const angle = this.angleS;

    // Side-specific points for side-view checks.
    const s = useLeft
      ? { sh: L.leftShoulder, hip: L.leftHip, knee: L.leftKnee, ankle: L.leftAnkle, heel: L.leftHeel, foot: L.leftFoot }
      : { sh: L.rightShoulder, hip: L.rightHip, knee: L.rightKnee, ankle: L.rightAnkle, heel: L.rightHeel, foot: L.rightFoot };
    const shin = Math.max(1e-3, dist2(p[s.knee], p[s.ankle], f.aspect));
    const kneeWidth = Math.abs(p[L.leftKnee].x - p[L.rightKnee].x) * f.aspect;
    const ankleWidth = Math.max(1e-3, Math.abs(p[L.leftAnkle].x - p[L.rightAnkle].x) * f.aspect);
    const heelDiff = (p[s.heel].y - p[s.foot].y) / shin;

    // 5. Phases.
    switch (this.phase) {
      case 'get-ready': {
        if (angle > CONFIG.standingAngle) {
          this.topSince ??= f.t;
          if (f.t - this.topSince > 400) {
            this.phase = 'start';
            this.topRef = clamp(angle, CONFIG.standingAngle, 180);
            this.lastTopT = f.t;
            events.push({ type: 'ready' });
          }
        } else {
          this.topSince = undefined;
        }
        break;
      }
      case 'start': {
        // Track how straight "standing" is for this person, and baselines for comparisons.
        if (angle > this.topRef) this.topRef = Math.min(180, angle);
        else if (angle > this.topRef - 5) this.topRef += (angle - this.topRef) * 0.02;
        this.topRef = clamp(this.topRef, CONFIG.standingAngle, 180);
        if (angle > this.topRef - 6) {
          this.lastTopT = f.t;
          const kw = kneeWidth / ankleWidth;
          this.kneeWidthBase = this.kneeWidthBase === undefined ? kw : this.kneeWidthBase + (kw - this.kneeWidthBase) * 0.1;
          this.heelBase = this.heelBase === undefined ? heelDiff : this.heelBase + (heelDiff - this.heelBase) * 0.1;
        }
        if (angle < this.topRef - CONFIG.startRepDrop) {
          this.rep = {
            startT: this.lastTopT,
            minAngle: angle,
            minT: f.t,
            maxSinceBottom: angle,
            issues: new Set(),
            streak: {},
            hipBelowKnee: false,
            view: this.view,
          };
          this.phase = 'eccentric';
        }
        break;
      }
      case 'eccentric': {
        const r = this.rep!;
        if (angle < r.minAngle) {
          r.minAngle = angle;
          r.minT = f.t;
        }
        // Live: dropping too fast.
        this.flag(r, 'fast-descent', this.vel < -CONFIG.liveFastDescentDegPerSec, events);
        if (angle > r.minAngle + 8 && this.vel > 15) {
          r.bottomT = r.minT;
          r.maxSinceBottom = angle;
          this.phase = 'concentric';
        }
        break;
      }
      case 'concentric': {
        const r = this.rep!;
        r.maxSinceBottom = Math.max(r.maxSinceBottom, angle);
        if (angle < r.maxSinceBottom - 12) {
          // Went back down before standing up: carry on with the same rep.
          this.phase = 'eccentric';
          break;
        }
        if (angle > this.topRef - CONFIG.finishRepMargin) {
          this.finishRep(f.t, events);
        }
        break;
      }
    }

    // 6. Form checks while in the working part of a rep.
    const r = this.rep;
    if (r && (this.phase === 'eccentric' || this.phase === 'concentric') && angle < this.topRef - 25) {
      if (this.view === 'front') {
        const kw = kneeWidth / ankleWidth;
        const base = this.kneeWidthBase ?? 1;
        const caving = kw < base * CONFIG.valgusRatio;
        this.flag(r, 'knees-in', caving, events);
        if (caving) this.badJoints.push(L.leftKnee, L.rightKnee);
        const shift = Math.abs(p[L.leftHip].y - p[L.rightHip].y) / torso > CONFIG.shift;
        this.flag(r, 'shift', shift, events);
        if (shift) this.badJoints.push(L.leftHip, L.rightHip);
      } else {
        const lean = leanFromVertical(p[s.hip], p[s.sh], f.aspect);
        const leaning = lean > CONFIG.maxLean;
        this.flag(r, 'chest-forward', leaning, events);
        if (leaning) this.badJoints.push(s.sh, s.hip);
        if (this.view === 'side') {
          const heelsUp = this.heelBase !== undefined && this.heelBase - heelDiff > CONFIG.heelLift;
          this.flag(r, 'heels-up', heelsUp, events);
          if (heelsUp) this.badJoints.push(s.heel, s.foot);
          // Hip crease at or below the top of the knee.
          if (p[s.hip].y >= p[s.knee].y - 0.02 * shin) r.hipBelowKnee = true;
        }
      }
    }

    return { state: this.state(), events };
  }

  /** Marks an issue once it has persisted for a few frames, and emits a spoken cue. */
  private flag(r: RepAcc, id: IssueId, bad: boolean, events: AnalyzerEvent[]) {
    const n = bad ? (r.streak[id] ?? 0) + 1 : 0;
    r.streak[id] = n;
    if (n === CONFIG.persistFrames && !r.issues.has(id)) {
      r.issues.add(id);
      const last = this.lastCue.get(id) ?? -Infinity;
      const now = this.lastT ?? 0;
      if (now - last > CONFIG.cueCooldownSec * 1000) {
        this.lastCue.set(id, now);
        events.push({ type: 'cue', issue: id });
      }
    }
  }

  private finishRep(t: number, events: AnalyzerEvent[]) {
    const r = this.rep!;
    this.rep = null;
    this.phase = 'start';
    this.lastTopT = t;
    if (r.minAngle > CONFIG.minRepAngle) {
      events.push({ type: 'partial' });
      return;
    }
    const bottomT = r.bottomT ?? r.minT;
    const eccentricSec = Math.max(0, (bottomT - r.startT) / 1000);
    const concentricSec = Math.max(0, (t - bottomT) / 1000);

    let depth: Depth =
      r.minAngle <= CONFIG.depth.deep ? 'deep' : r.minAngle <= CONFIG.depth.parallel ? 'parallel' : r.minAngle <= CONFIG.depth.half ? 'half' : 'shallow';
    if (r.hipBelowKnee && (depth === 'half' || depth === 'shallow')) depth = 'parallel';

    const descent = eccentricTempo(eccentricSec, CONFIG.eccentricControlled, CONFIG.eccentricTooFast);
    const ascent = concentricTempo(concentricSec, CONFIG.concentricExplosive, CONFIG.concentricTooSlow);

    const issues = new Set(r.issues);
    if (descent === 'fast') issues.add('fast-descent');
    else issues.delete('fast-descent'); // a brief fast moment inside a slow descent is fine
    if (ascent === 'slow') issues.add('slow-ascent');
    if (depth === 'half' || depth === 'shallow') issues.add('shallow');

    const penalty: Record<IssueId, number> = {
      'knees-in': 20,
      'chest-forward': 15,
      'heels-up': 10,
      shift: 10,
      'fast-descent': 15,
      'slow-ascent': 10,
      shallow: depth === 'shallow' ? 25 : 15,
    };
    let score = 100;
    for (const i of issues) score -= penalty[i];
    if (descent === 'ok') score -= 5;
    if (ascent === 'ok') score -= 5;

    const rep: RepResult = {
      n: this.results.length + 1,
      depth,
      minKneeAngle: Math.round(r.minAngle),
      romDeg: Math.round(this.topRef - r.minAngle),
      eccentricSec: Math.round(eccentricSec * 10) / 10,
      concentricSec: Math.round(concentricSec * 10) / 10,
      eccentric: descent,
      concentric: ascent,
      issues: [...issues],
      score: clamp(score, 0, 100),
      view: r.view,
      range: { label: depthLabel(depth), good: depth === 'deep' || depth === 'parallel' },
      detail: `knee ${Math.round(r.minAngle)}° at the bottom`,
    };
    this.results.push(rep);
    events.push({ type: 'rep', rep, newCount: true });
  }

  private state(): LiveState {
    const angle = this.angleS;
    const lastRep = this.results[this.results.length - 1];
    const target = CONFIG.depth.parallel;
    return {
      phase: this.phase,
      view: this.view,
      metric: angle === undefined ? undefined : `Knee ${Math.round(angle)}°`,
      progress: angle === undefined ? 0 : clamp((this.topRef - angle) / Math.max(1, this.topRef - target), 0, 1.2),
      inRep: this.phase === 'eccentric' || this.phase === 'concentric',
      reps: this.results.length,
      lastRep,
      activeIssues: this.rep ? [...this.rep.issues] : lastRep?.issues ?? [],
      badJoints: this.badJoints,
    };
  }
}

/** One-line spoken summary of a finished rep. */
export function repSpeech(rep: RepResult): string {
  const main = rep.issues[0];
  if (!main) {
    const depth = rep.depth === 'deep' ? 'Deep' : 'Good depth';
    return `${rep.n}. ${depth}${rep.concentric === 'explosive' ? ', explosive' : ''}. Great rep!`;
  }
  return `${rep.n}. ${ISSUES[main].cue}.`;
}

export function depthLabel(d: Depth): string {
  return { deep: 'Deep', parallel: 'Parallel', half: 'Half squat', shallow: 'Shallow' }[d];
}

export type { Point };
