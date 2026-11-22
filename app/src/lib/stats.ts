import { startOfDay, startOfWeek } from './calendar';
import type { CompletedSession, LoggedSet } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Weight moved in a set: reps × kg. Timed sets and bodyweight sets count as 0. */
export function setVolume(s: LoggedSet): number {
  return s.mode === 'reps' ? s.reps * s.weightKg : 0;
}

export function sessionVolume(s: CompletedSession): number {
  return (s.sets ?? []).reduce((n, x) => n + setVolume(x), 0);
}

export function volumeSummary(history: CompletedSession[], now = new Date()) {
  const weekStart = startOfWeek(now).getTime();
  let week = 0;
  let total = 0;
  let weekSessions = 0;
  for (const s of history) {
    const v = sessionVolume(s);
    total += v;
    if (s.finishedAt >= weekStart) {
      week += v;
      weekSessions++;
    }
  }
  return { week, total, weekSessions, totalSessions: history.length };
}

export function formatKg(kg: number): string {
  if (kg >= 10000) return `${(kg / 1000).toFixed(kg >= 100000 ? 0 : 1)} t`;
  return `${Math.round(kg).toLocaleString('en-US')} kg`;
}

/** Estimated one-rep max (Epley formula). */
export function oneRepMax(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  return reps === 1 ? weightKg : weightKg * (1 + reps / 30);
}

/** One session's result for a single exercise. */
export type ExerciseEntry = {
  sessionId: string;
  date: number;
  workoutName: string;
  sets: LoggedSet[];
  /** Heaviest weight lifted in the session. */
  topWeight: number;
  /** Most reps in a set at that top weight (or overall, for bodyweight). */
  topReps: number;
  longestSec: number;
  volume: number;
  best1RM: number;
};

export type ExerciseSummary = {
  exerciseId: string;
  exerciseName: string;
  /** Oldest first. */
  entries: ExerciseEntry[];
  /** What is tracked: weight if it was ever loaded, else reps, else seconds held. */
  metric: 'weight' | 'reps' | 'time';
};

/** Groups all logged sets by exercise, one entry per session. */
export function exerciseSummaries(history: CompletedSession[]): ExerciseSummary[] {
  const map = new Map<string, ExerciseSummary>();
  const sessions = history.slice().sort((a, b) => a.finishedAt - b.finishedAt);
  for (const session of sessions) {
    const byExercise = new Map<string, LoggedSet[]>();
    for (const set of session.sets ?? []) {
      const list = byExercise.get(set.exerciseId) ?? [];
      list.push(set);
      byExercise.set(set.exerciseId, list);
    }
    for (const [exerciseId, sets] of byExercise) {
      const topWeight = Math.max(...sets.map((s) => s.weightKg));
      const atTop = sets.filter((s) => s.weightKg === topWeight);
      const entry: ExerciseEntry = {
        sessionId: session.id,
        date: session.finishedAt,
        workoutName: session.workoutName,
        sets,
        topWeight,
        topReps: Math.max(...atTop.map((s) => s.reps)),
        longestSec: Math.max(...sets.map((s) => (s.mode === 'time' ? s.durationSec : 0))),
        volume: sets.reduce((n, s) => n + setVolume(s), 0),
        best1RM: Math.max(...sets.map((s) => oneRepMax(s.weightKg, s.reps))),
      };
      let summary = map.get(exerciseId);
      if (!summary) {
        summary = { exerciseId, exerciseName: sets[0].exerciseName, entries: [], metric: 'reps' };
        map.set(exerciseId, summary);
      }
      summary.exerciseName = sets[0].exerciseName;
      summary.entries.push(entry);
    }
  }
  for (const s of map.values()) {
    if (s.entries.some((e) => e.topWeight > 0)) s.metric = 'weight';
    else if (s.entries.every((e) => e.sets.every((x) => x.mode === 'time'))) s.metric = 'time';
    else s.metric = 'reps';
  }
  return [...map.values()].sort((a, b) => b.entries[b.entries.length - 1].date - a.entries[a.entries.length - 1].date);
}

export function metricValue(summary: ExerciseSummary, e: ExerciseEntry): number {
  return summary.metric === 'weight' ? e.topWeight : summary.metric === 'time' ? e.longestSec : e.topReps;
}

export function metricUnit(summary: ExerciseSummary): string {
  return summary.metric === 'weight' ? 'kg' : summary.metric === 'time' ? 's' : 'reps';
}

export type Progression = {
  verdict: 'new' | 'good' | 'steady' | 'down';
  from?: ExerciseEntry;
  to: ExerciseEntry;
  change: number;
  pct: number;
  /** Whole days between the two compared sessions. */
  days: number;
};

/**
 * Compares the latest session with the one from about three weeks earlier
 * (or the first session, if the history is shorter than that).
 */
export function progression(summary: ExerciseSummary, lookbackDays = 21): Progression {
  const entries = summary.entries;
  const to = entries[entries.length - 1];
  if (entries.length < 2) return { verdict: 'new', to, change: 0, pct: 0, days: 0 };
  const cutoff = startOfDay(to.date).getTime() - lookbackDays * DAY_MS;
  const older = entries.filter((e) => e.date <= cutoff + DAY_MS - 1);
  const from = older.length ? older[older.length - 1] : entries[0];
  const a = metricValue(summary, from);
  const b = metricValue(summary, to);
  const change = b - a;
  const pct = a > 0 ? (change / a) * 100 : b > 0 ? 100 : 0;
  const verdict = pct >= 2.5 ? 'good' : pct > -2.5 ? 'steady' : 'down';
  return { verdict, from, to, change, pct, days: Math.round((startOfDay(to.date).getTime() - startOfDay(from.date).getTime()) / DAY_MS) };
}

export function describeProgression(summary: ExerciseSummary, p: Progression): string {
  const unit = metricUnit(summary);
  const now = `${metricValue(summary, p.to)} ${unit}`;
  if (p.verdict === 'new' || !p.from) return `First session logged: ${now}. Do it again to see your progress.`;
  const before = `${metricValue(summary, p.from)} ${unit}`;
  const when = p.days >= 7 ? `${Math.round(p.days / 7)} week${Math.round(p.days / 7) === 1 ? '' : 's'} ago` : `${p.days} day${p.days === 1 ? '' : 's'} ago`;
  const sign = p.change > 0 ? '+' : '';
  const delta = `${sign}${Math.round(p.change * 10) / 10} ${unit}, ${sign}${Math.round(p.pct)}%`;
  switch (p.verdict) {
    case 'good':
      return `${when} you did ${before}, now ${now} (${delta}). Good progress!`;
    case 'steady':
      return `${when} you did ${before}, now ${now} (${delta}). Holding steady.`;
    case 'down':
      return `${when} you did ${before}, now ${now} (${delta}). Down a little; check recovery and sleep.`;
  }
}
