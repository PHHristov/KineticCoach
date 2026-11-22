import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import type { Workout, WorkoutItem, WorkoutType } from './types';
import { WORKOUT_TYPES } from './types';
import { uid } from './id';

/**
 * Workouts are shared as a compact, URL-safe code containing the workout itself.
 * No server is needed: the code travels inside a link (or is pasted by hand).
 * When a backend exists this can be swapped for short server-side ids.
 */

const VERSION = 1;

type Packed = {
  v: number;
  n: string;
  d: string;
  t: WorkoutType;
  a: string;
  i: [string, string, 0 | 1, number, number, number, number, number, number][];
};

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

export function encodeWorkout(w: Workout): string {
  const packed: Packed = {
    v: VERSION,
    n: w.name,
    d: w.description,
    t: w.type,
    a: w.author,
    i: w.items.map((it) => [
      it.exerciseId,
      it.exerciseName,
      it.mode === 'reps' ? 0 : 1,
      it.sets,
      it.reps,
      it.durationSec,
      it.weightKg,
      it.restBetweenSetsSec,
      it.restAfterSec,
    ]),
  };
  return toBase64Url(JSON.stringify(packed));
}

const num = (x: unknown, min: number, max: number) => {
  const n = Number(x);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
};
const str = (x: unknown, max: number) => (typeof x === 'string' ? x.slice(0, max) : '');

/** Decodes and validates a share code. Throws if the code is not a valid workout. */
export function decodeWorkout(code: string): Workout {
  const trimmed = extractCode(code);
  let raw: Packed;
  try {
    raw = JSON.parse(fromBase64Url(trimmed));
  } catch {
    throw new Error('This does not look like a KineticCoach workout code.');
  }
  if (!raw || raw.v !== VERSION || !Array.isArray(raw.i)) {
    throw new Error('Unsupported or damaged workout code.');
  }
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

/** Accepts either a bare code or a full share link and returns the code. */
export function extractCode(input: string): string {
  const s = input.trim();
  const m = s.match(/[?&]code=([A-Za-z0-9_-]+)/);
  return m ? m[1] : s;
}

export function shareLink(w: Workout): string {
  const code = encodeWorkout(w);
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/import?code=${code}`;
  }
  return Linking.createURL('/import', { queryParams: { code } });
}
