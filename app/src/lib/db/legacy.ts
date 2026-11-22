import { uid } from '../id';
import type { CompletedSession, Exercise, Plan, Schedule, Settings, Workout } from '../types';
import { insertCustomExercise, insertSessions, saveSettings, savePlans, saveWorkouts, setSchedule, DEFAULT_SETTINGS } from './repo';
import type { Db } from './schema';

/**
 * One-time import of data saved before the database existed (AsyncStorage keys `kc.*.v1`).
 * The old keys are left in place, so nothing is lost if the import is interrupted; the
 * `legacy_imported` meta flag makes sure it only happens once.
 */

export type LegacyData = {
  workouts: Workout[];
  customExercises: Exercise[];
  settings: Settings;
  history: CompletedSession[];
  plans: Plan[];
  schedule: Schedule | null;
};

export type KeyValueStore = { getItem(key: string): Promise<string | null> };

const parse = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

/** Returns the old data, or null if there is nothing worth importing. */
export async function readLegacy(store: KeyValueStore): Promise<LegacyData | null> {
  const [w, c, s, h, p, sch] = await Promise.all(
    ['kc.workouts.v1', 'kc.customExercises.v1', 'kc.settings.v1', 'kc.history.v1', 'kc.plans.v1', 'kc.schedule.v1'].map((k) =>
      store.getItem(k),
    ),
  );
  if (!w && !h && !p && !c) return null;
  return {
    workouts: parse<Workout[]>(w, []),
    customExercises: parse<Exercise[]>(c, []),
    settings: { ...DEFAULT_SETTINGS, ...parse<Partial<Settings>>(s, {}) },
    history: parse<CompletedSession[]>(h, []),
    plans: parse<Plan[]>(p, []),
    schedule: parse<Schedule | null>(sch, null),
  };
}

/** Writes the old data into the database under `userId`. */
export async function importLegacy(db: Db, userId: string, data: LegacyData): Promise<void> {
  // Exercise rows inside workouts must be unique in the database; older copies of a duplicated
  // workout shared them, so they get fresh ids here.
  const workouts = data.workouts.map((w) => ({ ...w, items: w.items.map((it) => ({ ...it, id: uid() })) }));
  await saveWorkouts(db, userId, workouts);
  for (const e of data.customExercises) await insertCustomExercise(db, userId, { ...e, custom: true });
  await savePlans(db, userId, data.plans);
  if (data.schedule && data.plans.some((p) => p.id === data.schedule!.planId)) await setSchedule(db, userId, data.schedule);
  await insertSessions(db, userId, data.history);
  await saveSettings(db, userId, data.settings);
}
