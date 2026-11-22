import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import type { Plan, Workout, WorkoutItem, WorkoutType } from './types';
import { WORKOUT_TYPES } from './types';
import { uid } from './id';

/**
 * Workouts and plans are shared as a compact, URL-safe code that contains the
 * content itself. No server is needed: the code travels inside a link.
 * When a backend exists this can be swapped for short server-side ids.
 */

const VERSION = 1;

/** Last three (active rest) are optional, so links made before active rest existed still import. */
type PackedItem = [string, string, 0 | 1, number, number, number, number, number, number, string?, string?, number?];
type PackedWorkout = { n: string; d: string; t: WorkoutType; a: string; i: PackedItem[] };
type PackedWorkoutCode = PackedWorkout & { v: number; k?: 'w' };
type PackedPlanCode = { v: number; k: 'p'; n: string; d: string; a: string; w: PackedWorkout[] };

export type Decoded =
  | { kind: 'workout'; workout: Workout }
  | { kind: 'plan'; plan: Plan; workouts: Workout[] };

function toBase64Url(text: string): string {
  const utf8 = encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_, h) =>
    String.fromCharCode(parseInt(h, 16)),
  );
  return btoa(utf8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code: string): string {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  return decodeURIComponent(
    Array.from(bin, (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''),
  );
}

function packWorkout(w: Workout): PackedWorkout {
  return {
    n: w.name,
    d: w.description,
    t: w.type,
    a: w.author,
    i: w.items.map((it) => ([
      it.exerciseId,
      it.exerciseName,
      it.mode === 'reps' ? 0 : 1,
      it.sets,
      it.reps,
      it.durationSec,
      it.weightKg,
      it.restBetweenSetsSec,
      it.restAfterSec,
      ...(it.activeRest ? ([it.activeRest.exerciseId, it.activeRest.exerciseName, it.activeRest.sec] as const) : []),
    ]) as PackedItem),
  };
}

const num = (x: unknown, min: number, max: number) => {
  const n = Number(x);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
};
const str = (x: unknown, max: number) => (typeof x === 'string' ? x.slice(0, max) : '');

function unpackWorkout(raw: PackedWorkout): Workout {
  if (!raw || !Array.isArray(raw.i)) throw new Error('Unsupported or damaged code.');
  const items: WorkoutItem[] = raw.i.slice(0, 100).map((r) => ({
    id: uid(),
    exerciseId: str(r[0], 80) || 'custom',
    exerciseName: str(r[1], 80) || 'Exercise',
    mode: r[2] === 1 ? 'time' : 'reps',
    sets: num(r[3], 1, 50),
    reps: num(r[4], 1, 1000),
    durationSec: num(r[5], 1, 3600),
    weightKg: Math.min(1000, Math.max(0, Math.round((Number(r[6]) || 0) * 100) / 100)),
    restBetweenSetsSec: num(r[7], 0, 3600),
    restAfterSec: num(r[8], 0, 3600),
    activeRest:
      typeof r[9] === 'string' && r[9] && Number(r[11]) > 0
        ? { exerciseId: str(r[9], 80), exerciseName: str(r[10], 80) || 'Cardio', sec: num(r[11], 5, 600) }
        : undefined,
  }));
  const now = Date.now();
  return {
    id: uid(),
    name: str(raw.n, 80) || 'Shared workout',
    description: str(raw.d, 500),
    type: WORKOUT_TYPES.includes(raw.t) ? raw.t : 'Custom',
    author: str(raw.a, 60),
    items,
    createdAt: now,
    updatedAt: now,
  };
}

export function encodeWorkout(w: Workout): string {
  const code: PackedWorkoutCode = { v: VERSION, ...packWorkout(w) };
  return toBase64Url(JSON.stringify(code));
}

export function encodePlan(plan: Plan, workouts: Workout[]): string {
  const byId = new Map(workouts.map((w) => [w.id, w]));
  const code: PackedPlanCode = {
    v: VERSION,
    k: 'p',
    n: plan.name,
    d: plan.description,
    a: plan.author,
    w: plan.workoutIds.map((id) => byId.get(id)).filter((w): w is Workout => !!w).map(packWorkout),
  };
  return toBase64Url(JSON.stringify(code));
}

/** Decodes and validates a share code or link. Throws if it is not valid. */
export function decodeShared(input: string): Decoded {
  let raw: PackedWorkoutCode | PackedPlanCode;
  try {
    raw = JSON.parse(fromBase64Url(extractCode(input)));
  } catch {
    throw new Error('This does not look like a KineticCoach share code.');
  }
  if (!raw || raw.v !== VERSION) throw new Error('Unsupported or damaged code.');

  if (raw.k === 'p') {
    if (!Array.isArray(raw.w) || raw.w.length === 0) throw new Error('This plan has no workouts.');
    const workouts = raw.w.slice(0, 7).map(unpackWorkout);
    const now = Date.now();
    return {
      kind: 'plan',
      workouts,
      plan: {
        id: uid(),
        name: str(raw.n, 80) || 'Shared plan',
        description: str(raw.d, 500),
        author: str(raw.a, 60),
        workoutIds: workouts.map((w) => w.id),
        createdAt: now,
        updatedAt: now,
      },
    };
  }
  return { kind: 'workout', workout: unpackWorkout(raw as PackedWorkoutCode) };
}

/** Accepts either a bare code or a full share link and returns the code. */
export function extractCode(input: string): string {
  const s = input.trim();
  const m = s.match(/[?&]code=([A-Za-z0-9_-]+)/);
  return m ? m[1] : s;
}

function linkFor(code: string): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/import?code=${code}`;
  }
  return Linking.createURL('/import', { queryParams: { code } });
}

export function shareLink(w: Workout): string {
  return linkFor(encodeWorkout(w));
}

export function planShareLink(plan: Plan, workouts: Workout[]): string {
  return linkFor(encodePlan(plan, workouts));
}
