import {
  clamp,
  concentricTempo,
  eccentricTempo,
  IssueTracker,
  type AnalyzerEvent,
  type IssueInfo,
  type LiveState,
  type Phase,
  type PoseAnalyzer,
  type RepBase,
  type View,
} from './analyzer';
import { angle3, dist2, L, leanFromVertical, mid, vis, type Point, type PoseFrame } from './landmarks';

/**
 * Real-time bicep curl analysis. Tracks each arm separately so both
 * simultaneous curls (counted once) and alternating curls (counted per arm) work.
 */

export type CurlIssue =
  | 'elbow-drift'
  | 'swing'
  | 'elbow-flare'
  | 'shrug'
  | 'fast-lower'
  | 'no-extension'
  | 'partial-top';

export const CURL_ISSUES: Record<CurlIssue, IssueInfo> = {
  'elbow-drift': {
    cue: 'Elbows still',
    title: 'Elbows moving forward',
    detail: 'Your elbows swung forward, so your shoulders took over. Keep your upper arms still at your sides.',
  },
  swing: {
    cue: "Don't swing",
    title: 'Swinging the body',
    detail: 'Your torso rocked to lift the weight. Stand tall and brace; use a lighter weight if you need momentum.',
  },
  'elbow-flare': {
    cue: 'Elbows in',
    title: 'Elbows flaring out',
    detail: 'Your elbows moved out to the sides. Keep them close to your body for the whole rep.',
  },
  shrug: {
    cue: 'Shoulders down',
    title: 'Shrugging the shoulders',
    detail: 'Your shoulders rose towards your ears. Keep them down and relaxed so the biceps do the work.',
  },
  'fast-lower': {
    cue: 'Lower slowly',
    title: 'Dropping the weight',
    detail: 'The way down was fast. Lower under control for about 2 seconds; the lowering builds a lot of strength.',
  },
  'no-extension': {
    cue: 'Straighten fully',
    title: 'Not straightening the arm',
    detail: "You didn't straighten your arm at the bottom. Lower all the way for the full range of motion.",
  },
  'partial-top': {
    cue: 'Curl higher',
    title: 'Not curling all the way up',
    detail: "You stopped short of the top. Curl until your forearm is close to your upper arm and squeeze.",
  },
};

export const CURL_CHECKS_BY_VIEW: Record<View, CurlIssue[]> = {
  side: ['elbow-drift', 'swing', 'fast-lower', 'no-extension', 'partial-top'],
  front: ['elbow-flare', 'shrug', 'fast-lower', 'no-extension', 'partial-top'],
  angled: ['elbow-drift', 'fast-lower', 'no-extension', 'partial-top'],
};

export type CurlRep = RepBase & {
  issues: CurlIssue[];
  /** Smallest elbow angle reached (lower = higher curl). */
  topAngle: number;
  /** Elbow angle at the start of the rep (higher = straighter arm). */
  bottomAngle: number;
  /** Which arm; undefined when filmed side-on, where only the near arm is visible. */
  side?: 'left' | 'right' | 'both';
};

export const CURL_CONFIG = {
  /** Elbow angle above which the arm counts as straight enough to start. */
  extendedAngle: 140,
  /** Degrees of bend that start a rep. Big enough to ignore tracking jitter and grip adjustments. */
  startRepBend: 35,
  /** The bend must hold for this many frames before a rep starts. */
  startFrames: 3,
  /** A failed attempt only gets "curl higher" if it bent at least this much; smaller moves are ignored. */
  partialMinBend: 45,
  /** Seconds between "curl higher" cues. */
  partialCooldownSec: 3,
  /** Degrees from the bottom that count as back down. */
  finishRepMargin: 8,
  /** If the arm stops within this many degrees of the bottom, the rep ends there. */
  stallMargin: 30,
  /** Below this speed (deg/s) the arm counts as stopped. */
  stallSpeed: 15,
  /** A rep must bend the elbow to at least this angle to count. */
  minRepAngle: 100,
  /** Top of the curl: full at or below this angle, "most of the way" below the next. */
  fullTopAngle: 55,
  partialTopAngle: 75,
  /** The arm should straighten to at least this angle between reps. */
  fullExtension: 150,
  /**
   * Measured lowering time stops just before full extension, so it reads about 10–15% short.
   * 1.7 s measured ≈ 2 s real lowering; 1.05 s measured ≈ 1.2 s real ("dropping").
   */
  eccentricControlled: 1.7,
  eccentricTooFast: 1.05,
  /** Curls are lifted under control too: up in about 1–1.5 s is ideal. */
  concentricExplosive: 1.5,
  concentricTooSlow: 3.0,
  liveFastLowerDegPerSec: 220,
  /** Upper arm swinging forward from its resting angle, degrees. */
  elbowDrift: 25,
  /** Torso rocking from its resting lean, degrees. */
  swing: 12,
  /** Elbow moving sideways, relative to shoulder width (arm movement doesn't change shoulder width). */
  flare: 0.28,
  /**
   * Shrug = shoulders rising towards the ears. Both must agree, so arm posture and looking down
   * at the hands don't count: the shoulder-to-ear gap shrinks by this fraction…
   */
  shrugNeckDrop: 0.25,
  /** …and the shoulder-to-hip distance grows by this fraction (skipped if the hips are out of view). */
  shrugTorsoGain: 0.03,
  /** Frames a shrug must last on top of the usual persistence (about a quarter second in all). */
  shrugExtraFrames: 4,
  persistFrames: 4,
  cueCooldownSec: 2.5,
  /** Reps of both arms finishing this close together count as one. */
  pairWindowMs: 600,
};

type ArmIdx = { sh: number; el: number; wr: number; hip: number };
const ARMS: Record<'left' | 'right', ArmIdx> = {
  left: { sh: L.leftShoulder, el: L.leftElbow, wr: L.leftWrist, hip: L.leftHip },
  right: { sh: L.rightShoulder, el: L.rightElbow, wr: L.rightWrist, hip: L.rightHip },
};

type ArmPhase = 'get-ready' | 'start' | 'concentric' | 'eccentric';

/** State machine for one arm. */
class Arm {
  angle?: number;
  vel = 0;
  phase: ArmPhase = 'get-ready';
  bottomRef = 160;
  readySince?: number;
  lastBottomT = 0;
  // Per-rep accumulators
  startT = 0;
  startAngle = 0;
  minAngle = 180;
  minT = 0;
  topT?: number;
  maxSinceTop = 0;
  stalledFrames = 0;
  bentFrames = 0;
  /** Completed reps by this arm. */
  count = 0;
  readonly tracker = new IssueTracker(CURL_CONFIG.persistFrames, CURL_CONFIG.cueCooldownSec * 1000);
  // Baselines measured while the arm hangs straight.
  upperArmBase?: number;
  leanBase?: number;
  flareBase?: number;
  neckBase?: number;
  torsoBase?: number;
  shrugStreak = 0;
  constructor(readonly side: 'left' | 'right') {}
}

type Pending = { rep: Omit<CurlRep, 'n'>; t: number };

export class CurlAnalyzer implements PoseAnalyzer<CurlRep> {
  private arms = { left: new Arm('left'), right: new Arm('right') };
  private lastT?: number;
  private viewRatio?: number;
  private view: View = 'angled';
  private hiddenSince?: number;
  private visible = false;
  private readySent = false;
  private results: CurlRep[] = [];
  private pending: Pending[] = [];
  private lastPartialT = -Infinity;
  /** Rounds completed: left + right (or both together) count as one rep. */
  private rounds = 0;
  private badJoints: number[] = [];

  get reps(): CurlRep[] {
    return this.results;
  }

  reset() {
    Object.assign(this, new CurlAnalyzer());
  }

  update(f: PoseFrame): { state: LiveState<CurlRep>; events: AnalyzerEvent<CurlRep>[] } {
    const events: AnalyzerEvent<CurlRep>[] = [];
    const p = f.image;
    const w = f.world;
    this.badJoints = [];
    this.flushPending(f.t, events, false);

    const armVis = (a: ArmIdx) => (vis(p[a.sh]) + vis(p[a.el]) + vis(p[a.wr])) / 3;
    const visL = p.length ? armVis(ARMS.left) : 0;
    const visR = p.length ? armVis(ARMS.right) : 0;
    if (!p.length || !w.length || Math.max(visL, visR) < 0.5) {
      this.hiddenSince ??= f.t;
      if (f.t - this.hiddenSince > 1500) {
        this.visible = false;
        for (const arm of Object.values(this.arms)) if (arm.phase !== 'get-ready') arm.phase = 'get-ready';
      }
      return { state: this.state(), events };
    }
    this.hiddenSince = undefined;
    this.visible = true;

    // Camera view, as for squats: shoulders look wide from the front, narrow from the side.
    const midSh = mid(p[L.leftShoulder], p[L.rightShoulder]);
    const hipsVisible = Math.min(vis(p[L.leftHip]), vis(p[L.rightHip])) > 0.4;
    const midHip = hipsVisible ? mid(p[L.leftHip], p[L.rightHip]) : undefined;
    const shoulderW = Math.abs(p[L.leftShoulder].x - p[L.rightShoulder].x) * f.aspect;
    const torso = midHip ? Math.max(1e-3, dist2(midSh, midHip, f.aspect)) : undefined;
    // Without hips in frame, compare shoulder width to upper-arm length instead.
    const upperL = Math.max(1e-3, dist2(p[L.leftShoulder], p[L.leftElbow], f.aspect));
    const ratio = torso ? shoulderW / torso : shoulderW / (upperL * 1.6);
    this.viewRatio = this.viewRatio === undefined ? ratio : this.viewRatio + (ratio - this.viewRatio) * 0.15;
    // The camera doesn't move mid-rep: only re-judge the view between reps. (A shrug or a lean
    // changes the shoulder/torso ratio and would otherwise switch the front-view checks off.)
    const inRep = Object.values(this.arms).some((a) => a.phase === 'concentric' || a.phase === 'eccentric');
    if (!inRep) this.view = this.viewRatio > 0.55 ? 'front' : this.viewRatio < 0.3 ? 'side' : 'angled';

    const dt = this.lastT === undefined ? 1 / 30 : clamp((f.t - this.lastT) / 1000, 1 / 240, 0.25);
    this.lastT = f.t;

    // Side-on, only the arm facing the camera is reliable.
    const active: ('left' | 'right')[] =
      this.view === 'front' ? (['left', 'right'] as const).filter((s) => (s === 'left' ? visL : visR) >= 0.5) : [visL >= visR ? 'left' : 'right'];

    for (const side of active) this.updateArm(this.arms[side], f, dt, midHip, events);
    return { state: this.state(active), events };
  }

  private updateArm(arm: Arm, f: PoseFrame, dt: number, midHip: Point | undefined, events: AnalyzerEvent<CurlRep>[]) {
    const p = f.image;
    const w = f.world;
    const idx = ARMS[arm.side];
    const raw = angle3(w[idx.sh], w[idx.el], w[idx.wr]);
    const prev = arm.angle ?? raw;
    arm.angle = prev + (raw - prev) * (1 - Math.exp(-dt / 0.05));
    arm.vel += ((arm.angle - prev) / dt - arm.vel) * (1 - Math.exp(-dt / 0.08));
    const angle = arm.angle;

    // Measurements for the form checks.
    const upperLen = Math.max(1e-3, dist2(p[idx.sh], p[idx.el], f.aspect));
    const upperArmAngle = leanFromVertical(p[idx.el], p[idx.sh], f.aspect); // 0 = hanging straight down
    const hip = vis(p[idx.hip]) > 0.4 ? p[idx.hip] : midHip;
    const lean = hip ? leanFromVertical(hip, p[idx.sh], f.aspect) * Math.sign((p[idx.sh].x - hip.x) || 1) : undefined;
    // Shoulder width is the yardstick for front-view checks: it doesn't change as the arms move.
    const shoulderW = Math.max(1e-3, Math.abs(p[L.leftShoulder].x - p[L.rightShoulder].x) * f.aspect);
    const flare = (Math.abs(p[idx.el].x - p[idx.sh].x) * f.aspect) / shoulderW;
    const shMidY = (p[L.leftShoulder].y + p[L.rightShoulder].y) / 2;
    const earsVisible = Math.min(vis(p[L.leftEar]), vis(p[L.rightEar])) > 0.5;
    const neck = earsVisible ? (shMidY - (p[L.leftEar].y + p[L.rightEar].y) / 2) / shoulderW : undefined;
    const torsoLen = hipsVisibleBoth(p) ? ((p[L.leftHip].y + p[L.rightHip].y) / 2 - shMidY) / shoulderW : undefined;

    switch (arm.phase) {
      case 'get-ready': {
        if (angle > CURL_CONFIG.extendedAngle) {
          arm.readySince ??= f.t;
          if (f.t - arm.readySince > 400) {
            arm.phase = 'start';
            arm.bottomRef = clamp(angle, CURL_CONFIG.extendedAngle, 180);
            arm.lastBottomT = f.t;
            if (!this.readySent) {
              this.readySent = true;
              events.push({ type: 'ready' });
            }
          }
        } else arm.readySince = undefined;
        break;
      }
      case 'start': {
        // Follow the straight-arm angle, but don't jump to every jitter spike (that would make
        // the normal resting angle look like the start of a bend).
        if (angle > arm.bottomRef) arm.bottomRef = Math.min(180, arm.bottomRef + (angle - arm.bottomRef) * 0.15);
        else if (angle > arm.bottomRef - 5) arm.bottomRef += (angle - arm.bottomRef) * 0.02;
        if (angle > arm.bottomRef - 8) {
          arm.lastBottomT = f.t;
          const ema = (base: number | undefined, v: number) => (base === undefined ? v : base + (v - base) * 0.1);
          arm.upperArmBase = ema(arm.upperArmBase, upperArmAngle);
          if (lean !== undefined) arm.leanBase = ema(arm.leanBase, lean);
          arm.flareBase = ema(arm.flareBase, flare);
          if (neck !== undefined) arm.neckBase = ema(arm.neckBase, neck);
          if (torsoLen !== undefined) arm.torsoBase = ema(arm.torsoBase, torsoLen);
        }
        arm.bentFrames = angle < arm.bottomRef - CURL_CONFIG.startRepBend ? arm.bentFrames + 1 : 0;
        if (arm.bentFrames >= CURL_CONFIG.startFrames) {
          arm.bentFrames = 0;
          arm.phase = 'concentric';
          arm.startT = arm.lastBottomT;
          arm.startAngle = arm.bottomRef;
          arm.minAngle = angle;
          arm.minT = f.t;
          arm.topT = undefined;
          arm.tracker.nextRep();
        }
        break;
      }
      case 'concentric': {
        if (angle < arm.minAngle) {
          arm.minAngle = angle;
          arm.minT = f.t;
        }
        if (angle > arm.minAngle + 10 && arm.vel > 15) {
          arm.phase = 'eccentric';
          arm.topT = arm.minT;
          arm.maxSinceTop = angle;
          arm.stalledFrames = 0;
        }
        break;
      }
      case 'eccentric': {
        arm.maxSinceTop = Math.max(arm.maxSinceTop, angle);
        this.check(arm, 'fast-lower', arm.vel > CURL_CONFIG.liveFastLowerDegPerSec, f.t, events);
        if (angle < arm.maxSinceTop - 12) {
          arm.phase = 'concentric'; // curled back up before reaching the bottom
          break;
        }
        // Done when the arm is straight again, or when it stops close to straight.
        arm.stalledFrames = angle > arm.bottomRef - CURL_CONFIG.stallMargin && Math.abs(arm.vel) < CURL_CONFIG.stallSpeed ? arm.stalledFrames + 1 : 0;
        if (angle > arm.bottomRef - CURL_CONFIG.finishRepMargin || arm.stalledFrames >= CURL_CONFIG.persistFrames) {
          this.finishArmRep(arm, f.t, events);
        }
        break;
      }
    }

    // Form checks while the elbow is clearly bent.
    if ((arm.phase === 'concentric' || arm.phase === 'eccentric') && angle < arm.bottomRef - 25) {
      if (this.view === 'front') {
        const flaring = arm.flareBase !== undefined && flare - arm.flareBase > CURL_CONFIG.flare;
        this.check(arm, 'elbow-flare', flaring, f.t, events);
        if (flaring) this.badJoints.push(idx.sh, idx.el);
        const neckShrank = neck !== undefined && arm.neckBase !== undefined && neck < arm.neckBase * (1 - CURL_CONFIG.shrugNeckDrop);
        const torsoGrew =
          torsoLen === undefined || arm.torsoBase === undefined || torsoLen > arm.torsoBase * (1 + CURL_CONFIG.shrugTorsoGain);
        arm.shrugStreak = neckShrank && torsoGrew ? arm.shrugStreak + 1 : 0;
        const shrugging = arm.shrugStreak > CURL_CONFIG.shrugExtraFrames;
        this.check(arm, 'shrug', shrugging, f.t, events);
        if (shrugging) this.badJoints.push(L.leftShoulder, L.rightShoulder);
      } else {
        const drifting = arm.upperArmBase !== undefined && upperArmAngle - arm.upperArmBase > CURL_CONFIG.elbowDrift;
        this.check(arm, 'elbow-drift', drifting, f.t, events);
        if (drifting) this.badJoints.push(idx.sh, idx.el);
        const swinging = lean !== undefined && arm.leanBase !== undefined && Math.abs(lean - arm.leanBase) > CURL_CONFIG.swing;
        this.check(arm, 'swing', swinging, f.t, events);
        if (swinging && hip) this.badJoints.push(idx.sh, idx.hip);
      }
    }
  }

  private check(arm: Arm, id: CurlIssue, bad: boolean, now: number, events: AnalyzerEvent<CurlRep>[]) {
    if (arm.tracker.flag(id, bad, now)) events.push({ type: 'cue', issue: id });
  }

  private finishArmRep(arm: Arm, t: number, events: AnalyzerEvent<CurlRep>[]) {
    arm.phase = 'start';
    arm.lastBottomT = t;
    if (arm.minAngle > CURL_CONFIG.minRepAngle) {
      // Only a real attempt that fell short gets "curl higher"; small movements are ignored.
      const bend = arm.startAngle - arm.minAngle;
      if (bend >= CURL_CONFIG.partialMinBend && t - this.lastPartialT > CURL_CONFIG.partialCooldownSec * 1000) {
        this.lastPartialT = t;
        events.push({ type: 'partial' });
      }
      return;
    }
    const topT = arm.topT ?? arm.minT;
    const concentricSec = Math.max(0, (topT - arm.startT) / 1000);
    const eccentricSec = Math.max(0, (t - topT) / 1000);
    const eccentric = eccentricTempo(eccentricSec, CURL_CONFIG.eccentricControlled, CURL_CONFIG.eccentricTooFast);
    const concentric = concentricTempo(concentricSec, CURL_CONFIG.concentricExplosive, CURL_CONFIG.concentricTooSlow);

    const issues = new Set(arm.tracker.issues as Set<CurlIssue>);
    if (eccentric === 'fast') issues.add('fast-lower');
    else issues.delete('fast-lower');
    if (arm.startAngle < CURL_CONFIG.fullExtension) issues.add('no-extension');
    if (arm.minAngle > CURL_CONFIG.partialTopAngle) issues.add('partial-top');

    const full = arm.minAngle <= CURL_CONFIG.fullTopAngle && arm.startAngle >= CURL_CONFIG.fullExtension;
    const penalty: Record<CurlIssue, number> = {
      'elbow-drift': 15,
      swing: 20,
      'elbow-flare': 10,
      shrug: 10,
      'fast-lower': 15,
      'no-extension': 15,
      'partial-top': 15,
    };
    let score = 100;
    for (const i of issues) score -= penalty[i];
    if (eccentric === 'ok') score -= 5;
    if (concentric === 'slow') score -= 5;
    if (!full && !issues.has('partial-top') && !issues.has('no-extension')) score -= 5; // "most of the way"

    const rep: Omit<CurlRep, 'n'> = {
      issues: [...issues],
      score: clamp(score, 0, 100),
      view: this.view,
      romDeg: Math.round(arm.startAngle - arm.minAngle),
      eccentricSec: Math.round(eccentricSec * 10) / 10,
      concentricSec: Math.round(concentricSec * 10) / 10,
      eccentric,
      concentric,
      range: { label: full ? 'Full range' : issues.has('partial-top') || issues.has('no-extension') ? 'Partial range' : 'Most of the range', good: full },
      detail: `elbow ${Math.round(arm.startAngle)}° → ${Math.round(arm.minAngle)}°`,
      topAngle: Math.round(arm.minAngle),
      bottomAngle: Math.round(arm.startAngle),
      side: this.view === 'front' ? arm.side : undefined,
    };
    if (this.view !== 'front') {
      // Side-on we only see the near arm: treat each rep as a round for both arms.
      this.emit(['left', 'right'], rep, events);
      return;
    }
    this.pending.push({ t, rep });
    this.flushPending(t, events, false);
  }

  /** Emits finished arm reps, merging left+right reps that finish together into one. */
  private flushPending(now: number, events: AnalyzerEvent<CurlRep>[], force: boolean) {
    if (this.pending.length >= 2) {
      const [a, b] = this.pending;
      if (a.rep.side !== b.rep.side && Math.abs(a.t - b.t) <= CURL_CONFIG.pairWindowMs) {
        this.pending.splice(0, 2);
        const issues = [...new Set([...a.rep.issues, ...b.rep.issues])];
        this.emit(
          ['left', 'right'],
          {
            ...a.rep,
            side: 'both',
            issues,
            score: Math.min(a.rep.score, b.rep.score),
            romDeg: Math.round((a.rep.romDeg + b.rep.romDeg) / 2),
            eccentricSec: Math.min(a.rep.eccentricSec, b.rep.eccentricSec),
            eccentric: a.rep.eccentricSec <= b.rep.eccentricSec ? a.rep.eccentric : b.rep.eccentric,
            range: a.rep.range.good && b.rep.range.good ? a.rep.range : a.rep.range.good ? b.rep.range : a.rep.range,
          },
          events,
        );
      }
    }
    while (this.pending.length && (force || now - this.pending[0].t > CURL_CONFIG.pairWindowMs)) {
      const p = this.pending.shift()!;
      this.emit([p.rep.side as 'left' | 'right'], p.rep, events);
    }
  }

  /**
   * Records a finished rep. Each arm keeps its own count; the rep counter is the furthest arm,
   * so left + right (alternating or together) is one rep and a one-arm set counts every rep.
   */
  private emit(sides: ('left' | 'right')[], rep: Omit<CurlRep, 'n'>, events: AnalyzerEvent<CurlRep>[]) {
    for (const s of sides) this.arms[s].count++;
    const n = Math.max(...sides.map((s) => this.arms[s].count));
    const before = this.rounds;
    this.rounds = Math.max(this.arms.left.count, this.arms.right.count);
    const full = { ...rep, n } as CurlRep;
    this.results.push(full);
    events.push({ type: 'rep', rep: full, newCount: this.rounds > before });
  }

  private state(active: ('left' | 'right')[] = []): LiveState<CurlRep> {
    const arms = active.map((s) => this.arms[s]).filter((a) => a.angle !== undefined);
    const lastRep = this.results[this.results.length - 1];
    // Show the arm that is most bent (the one working right now).
    const lead = arms.sort((a, b) => (a.angle ?? 180) - (b.angle ?? 180))[0];
    const inRep = arms.some((a) => a.phase === 'concentric' || a.phase === 'eccentric');
    const phase: Phase = !this.visible
      ? this.hiddenSince !== undefined ? 'not-visible' : 'get-ready'
      : !lead || lead.phase === 'get-ready' ? 'get-ready' : lead.phase;
    const issues = new Set<string>();
    for (const a of arms) if (a.phase === 'concentric' || a.phase === 'eccentric') a.tracker.issues.forEach((i) => issues.add(i));
    return {
      phase,
      view: this.view,
      metric: lead?.angle === undefined ? undefined : `Elbow ${Math.round(lead.angle)}°`,
      progress: lead?.angle === undefined ? 0 : clamp((lead.bottomRef - lead.angle) / Math.max(1, lead.bottomRef - CURL_CONFIG.fullTopAngle), 0, 1.2),
      reps: this.rounds,
      perSide: this.arms.left.count && this.arms.right.count ? { left: this.arms.left.count, right: this.arms.right.count } : undefined,
      lastRep,
      activeIssues: inRep ? [...issues] : lastRep?.issues ?? [],
      badJoints: this.badJoints,
      inRep,
    };
  }
}

function hipsVisibleBoth(p: Point[]): boolean {
  return Math.min(vis(p[L.leftHip]), vis(p[L.rightHip])) > 0.4;
}

export function curlRepSpeech(rep: CurlRep): string {
  const main = rep.issues[0];
  if (!main) return `${rep.n}. ${rep.range.good ? 'Full range' : 'Good'}${rep.eccentric === 'controlled' ? ', controlled' : ''}. Nice curl!`;
  return `${rep.n}. ${CURL_ISSUES[main].cue}.`;
}
