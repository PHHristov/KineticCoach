import { BUILT_IN_EXERCISES } from '../exercises';
import type {
  CompletedSession,
  Exercise,
  ExerciseCategory,
  ExerciseMode,
  FormCheckRecord,
  LoggedSet,
  Plan,
  Schedule,
  Settings,
  UserProfile,
  Workout,
  WorkoutType,
} from '../types';
import type { Db } from './schema';

/**
 * Reads and writes the local database. Every function works on one user's data.
 * Multi-row writes run in a transaction, so a failure never leaves half a workout behind.
 */

export const DEFAULT_SETTINGS: Settings = { voiceEnabled: true, countdownBeeps: true, prepSec: 10, displayName: '' };

const n = (v: number | undefined | null) => (v === undefined || v === null || Number.isNaN(v) ? null : v);
const s = (v: string | undefined | null) => (v === undefined ? null : v);

/* ---------------- meta ---------------- */

export async function getMeta(db: Db, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setMeta(db: Db, key: string, value: string): Promise<void> {
  await db.runAsync('INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}

/* ---------------- users ---------------- */

type UserRow = {
  id: string;
  name: string;
  weight_kg: number | null;
  height_cm: number | null;
  birth_year: number | null;
  goal: string | null;
  experience: string | null;
  settings: string;
  created_at: number;
  last_active_at: number;
};

function toUser(r: UserRow): UserProfile {
  return {
    id: r.id,
    name: r.name,
    weightKg: r.weight_kg ?? undefined,
    heightCm: r.height_cm ?? undefined,
    birthYear: r.birth_year ?? undefined,
    goal: (r.goal ?? undefined) as UserProfile['goal'],
    experience: (r.experience ?? undefined) as UserProfile['experience'],
    createdAt: r.created_at,
    lastActiveAt: r.last_active_at,
  };
}

/** Most recently active first. */
export async function listUsers(db: Db): Promise<UserProfile[]> {
  const rows = await db.getAllAsync<UserRow>('SELECT * FROM users ORDER BY last_active_at DESC');
  return rows.map(toUser);
}

export async function insertUser(db: Db, u: UserProfile, settings: Settings = DEFAULT_SETTINGS): Promise<void> {
  await db.runAsync(
    `INSERT INTO users (id, name, weight_kg, height_cm, birth_year, goal, experience, settings, created_at, last_active_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    u.id,
    u.name,
    n(u.weightKg),
    n(u.heightCm),
    n(u.birthYear),
    s(u.goal),
    s(u.experience),
    JSON.stringify(stripName(settings)),
    u.createdAt,
    u.lastActiveAt,
  );
}

export async function updateUser(db: Db, u: UserProfile): Promise<void> {
  await db.runAsync(
    `UPDATE users SET name = ?, weight_kg = ?, height_cm = ?, birth_year = ?, goal = ?, experience = ?, last_active_at = ? WHERE id = ?`,
    u.name,
    n(u.weightKg),
    n(u.heightCm),
    n(u.birthYear),
    s(u.goal),
    s(u.experience),
    u.lastActiveAt,
    u.id,
  );
}

export async function touchUser(db: Db, id: string, at = Date.now()): Promise<void> {
  await db.runAsync('UPDATE users SET last_active_at = ? WHERE id = ?', at, id);
}

/** Deletes the user and everything they own (cascade). */
export async function deleteUser(db: Db, id: string): Promise<void> {
  await db.runAsync('DELETE FROM users WHERE id = ?', id);
}

function stripName(settings: Settings): Omit<Settings, 'displayName'> {
  const { displayName: _ignored, ...rest } = settings;
  return rest;
}

export async function getSettings(db: Db, userId: string): Promise<Settings> {
  const row = await db.getFirstAsync<{ settings: string; name: string }>('SELECT settings, name FROM users WHERE id = ?', userId);
  let parsed: Partial<Settings> = {};
  try {
    parsed = JSON.parse(row?.settings ?? '{}');
  } catch {
    // corrupt settings fall back to defaults
  }
  return { ...DEFAULT_SETTINGS, ...parsed, displayName: row?.name ?? '' };
}

export async function saveSettings(db: Db, userId: string, settings: Settings): Promise<void> {
  await db.runAsync('UPDATE users SET settings = ? WHERE id = ?', JSON.stringify(stripName(settings)), userId);
}

/* ---------------- exercises ---------------- */

/** Keeps the built-in library in the database (so queries can join on it). Idempotent. */
export async function syncBuiltInExercises(db: Db): Promise<void> {
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    for (const e of BUILT_IN_EXERCISES) {
      await db.runAsync(
        `INSERT INTO exercises (id, user_id, name, category, default_mode, description, builtin, created_at)
         VALUES (?, NULL, ?, ?, ?, ?, 1, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, category = excluded.category,
           default_mode = excluded.default_mode, description = excluded.description`,
        e.id,
        e.name,
        e.category,
        e.defaultMode,
        s(e.description),
        now,
      );
    }
  });
}

type ExerciseRow = { id: string; name: string; category: string; default_mode: string; description: string | null };

export async function listCustomExercises(db: Db, userId: string): Promise<Exercise[]> {
  const rows = await db.getAllAsync<ExerciseRow>(
    'SELECT id, name, category, default_mode, description FROM exercises WHERE user_id = ? ORDER BY name',
    userId,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category as ExerciseCategory,
    defaultMode: r.default_mode as ExerciseMode,
    description: r.description ?? undefined,
    custom: true,
  }));
}

export async function insertCustomExercise(db: Db, userId: string, e: Exercise): Promise<void> {
  await db.runAsync(
    `INSERT INTO exercises (id, user_id, name, category, default_mode, description, builtin, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    e.id,
    userId,
    e.name,
    e.category,
    e.defaultMode,
    s(e.description),
    Date.now(),
  );
}

export async function deleteCustomExercise(db: Db, userId: string, id: string): Promise<void> {
  await db.runAsync('DELETE FROM exercises WHERE id = ? AND user_id = ? AND builtin = 0', id, userId);
}

/* ---------------- workouts ---------------- */

type WorkoutRow = { id: string; name: string; description: string; type: string; author: string; created_at: number; updated_at: number };
type ItemRow = {
  id: string;
  workout_id: string;
  exercise_id: string;
  exercise_name: string;
  mode: string;
  sets: number;
  reps: number;
  duration_sec: number;
  weight_kg: number;
  rest_between_sec: number;
  rest_after_sec: number;
  active_rest_exercise_id: string | null;
  active_rest_name: string | null;
  active_rest_sec: number | null;
};

export async function listWorkouts(db: Db, userId: string): Promise<Workout[]> {
  const rows = await db.getAllAsync<WorkoutRow>('SELECT * FROM workouts WHERE user_id = ? ORDER BY updated_at DESC', userId);
  const items = await db.getAllAsync<ItemRow>(
    `SELECT i.* FROM workout_items i JOIN workouts w ON w.id = i.workout_id WHERE w.user_id = ? ORDER BY i.workout_id, i.position`,
    userId,
  );
  const byWorkout = new Map<string, ItemRow[]>();
  for (const it of items) {
    const list = byWorkout.get(it.workout_id) ?? [];
    list.push(it);
    byWorkout.set(it.workout_id, list);
  }
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    type: r.type as WorkoutType,
    author: r.author,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    items: (byWorkout.get(r.id) ?? []).map((i) => ({
      id: i.id,
      exerciseId: i.exercise_id,
      exerciseName: i.exercise_name,
      mode: i.mode as ExerciseMode,
      sets: i.sets,
      reps: i.reps,
      durationSec: i.duration_sec,
      weightKg: i.weight_kg,
      restBetweenSetsSec: i.rest_between_sec,
      restAfterSec: i.rest_after_sec,
      activeRest:
        i.active_rest_exercise_id && i.active_rest_sec
          ? { exerciseId: i.active_rest_exercise_id, exerciseName: i.active_rest_name ?? i.active_rest_exercise_id, sec: i.active_rest_sec }
          : undefined,
    })),
  }));
}

/** Inserts or replaces a workout and its exercises. */
export async function saveWorkouts(db: Db, userId: string, workouts: Workout[]): Promise<void> {
  if (!workouts.length) return;
  await db.withTransactionAsync(async () => {
    for (const w of workouts) {
      await db.runAsync(
        `INSERT INTO workouts (id, user_id, name, description, type, author, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, type = excluded.type,
           author = excluded.author, updated_at = excluded.updated_at
         WHERE workouts.user_id = excluded.user_id`,
        w.id,
        userId,
        w.name,
        w.description,
        w.type,
        w.author,
        w.createdAt,
        w.updatedAt,
      );
      await db.runAsync('DELETE FROM workout_items WHERE workout_id = ?', w.id);
      let position = 0;
      for (const it of w.items) {
        await db.runAsync(
          `INSERT INTO workout_items (id, workout_id, position, exercise_id, exercise_name, mode, sets, reps, duration_sec, weight_kg, rest_between_sec, rest_after_sec,
             active_rest_exercise_id, active_rest_name, active_rest_sec)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          it.id,
          w.id,
          position++,
          it.exerciseId,
          it.exerciseName,
          it.mode,
          it.sets,
          it.reps,
          it.durationSec,
          it.weightKg,
          it.restBetweenSetsSec,
          it.restAfterSec,
          it.activeRest?.exerciseId ?? null,
          it.activeRest?.exerciseName ?? null,
          it.activeRest?.sec ?? null,
        );
      }
    }
  });
}

/** Deleting a workout also removes it from the user's plans (plan_days cascade) and renumbers them. */
export async function deleteWorkout(db: Db, userId: string, id: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    const plans = await db.getAllAsync<{ plan_id: string }>(
      'SELECT DISTINCT d.plan_id FROM plan_days d JOIN plans p ON p.id = d.plan_id WHERE d.workout_id = ? AND p.user_id = ?',
      id,
      userId,
    );
    await db.runAsync('DELETE FROM workouts WHERE id = ? AND user_id = ?', id, userId);
    for (const { plan_id } of plans) await renumberPlanDays(db, plan_id);
  });
}

async function renumberPlanDays(db: Db, planId: string): Promise<void> {
  const days = await db.getAllAsync<{ workout_id: string }>('SELECT workout_id FROM plan_days WHERE plan_id = ? ORDER BY position', planId);
  await db.runAsync('DELETE FROM plan_days WHERE plan_id = ?', planId);
  let position = 0;
  for (const d of days) await db.runAsync('INSERT INTO plan_days (plan_id, position, workout_id) VALUES (?, ?, ?)', planId, position++, d.workout_id);
}

/* ---------------- plans + schedule ---------------- */

type PlanRow = { id: string; name: string; description: string; author: string; created_at: number; updated_at: number };

export async function listPlans(db: Db, userId: string): Promise<Plan[]> {
  const rows = await db.getAllAsync<PlanRow>('SELECT * FROM plans WHERE user_id = ? ORDER BY updated_at DESC', userId);
  const days = await db.getAllAsync<{ plan_id: string; workout_id: string }>(
    'SELECT d.plan_id, d.workout_id FROM plan_days d JOIN plans p ON p.id = d.plan_id WHERE p.user_id = ? ORDER BY d.plan_id, d.position',
    userId,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    author: r.author,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    workoutIds: days.filter((d) => d.plan_id === r.id).map((d) => d.workout_id),
  }));
}

export async function savePlans(db: Db, userId: string, plans: Plan[]): Promise<void> {
  if (!plans.length) return;
  await db.withTransactionAsync(async () => {
    for (const p of plans) {
      await db.runAsync(
        `INSERT INTO plans (id, user_id, name, description, author, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, author = excluded.author,
           updated_at = excluded.updated_at
         WHERE plans.user_id = excluded.user_id`,
        p.id,
        userId,
        p.name,
        p.description,
        p.author,
        p.createdAt,
        p.updatedAt,
      );
      await db.runAsync('DELETE FROM plan_days WHERE plan_id = ?', p.id);
      let position = 0;
      for (const wid of p.workoutIds) {
        // A day pointing at a workout that no longer exists is dropped rather than failing the save.
        const exists = await db.getFirstAsync<{ id: string }>('SELECT id FROM workouts WHERE id = ? AND user_id = ?', wid, userId);
        if (exists) await db.runAsync('INSERT INTO plan_days (plan_id, position, workout_id) VALUES (?, ?, ?)', p.id, position++, wid);
      }
    }
  });
}

export async function deletePlan(db: Db, userId: string, id: string): Promise<void> {
  await db.runAsync('DELETE FROM plans WHERE id = ? AND user_id = ?', id, userId);
}

export async function getSchedule(db: Db, userId: string): Promise<Schedule | null> {
  const row = await db.getFirstAsync<{ plan_id: string; days: string; started_at: number }>(
    'SELECT plan_id, days, started_at FROM schedules WHERE user_id = ?',
    userId,
  );
  if (!row) return null;
  let days: number[] = [];
  try {
    days = JSON.parse(row.days);
  } catch {
    // treat as no days
  }
  return { planId: row.plan_id, days, startedAt: row.started_at };
}

export async function setSchedule(db: Db, userId: string, schedule: Schedule | null): Promise<void> {
  if (!schedule) {
    await db.runAsync('DELETE FROM schedules WHERE user_id = ?', userId);
    return;
  }
  await db.runAsync(
    `INSERT INTO schedules (user_id, plan_id, days, started_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET plan_id = excluded.plan_id, days = excluded.days, started_at = excluded.started_at`,
    userId,
    schedule.planId,
    JSON.stringify(schedule.days),
    schedule.startedAt,
  );
}

/* ---------------- sessions (history) ---------------- */

type SessionRow = {
  id: string;
  workout_id: string;
  workout_name: string;
  plan_id: string | null;
  started_at: number;
  finished_at: number;
  work_sec: number;
  rest_sec: number;
  completed_sets: number;
  total_sets: number;
  ended_early: number;
};
type SetRow = {
  session_id: string;
  exercise_id: string;
  exercise_name: string;
  set_number: number;
  mode: string;
  reps: number;
  weight_kg: number;
  duration_sec: number;
  at: number;
};

/** Newest first, with every logged set. */
export async function listSessions(db: Db, userId: string): Promise<CompletedSession[]> {
  const rows = await db.getAllAsync<SessionRow>('SELECT * FROM sessions WHERE user_id = ? ORDER BY finished_at DESC', userId);
  const sets = await db.getAllAsync<SetRow>(
    `SELECT st.* FROM session_sets st JOIN sessions se ON se.id = st.session_id WHERE se.user_id = ? ORDER BY st.session_id, st.position`,
    userId,
  );
  const bySession = new Map<string, LoggedSet[]>();
  for (const r of sets) {
    const list = bySession.get(r.session_id) ?? [];
    list.push({
      exerciseId: r.exercise_id,
      exerciseName: r.exercise_name,
      setNumber: r.set_number,
      mode: r.mode as ExerciseMode,
      reps: r.reps,
      weightKg: r.weight_kg,
      durationSec: r.duration_sec,
      at: r.at,
    });
    bySession.set(r.session_id, list);
  }
  return rows.map((r) => ({
    id: r.id,
    workoutId: r.workout_id,
    workoutName: r.workout_name,
    planId: r.plan_id ?? undefined,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    workSec: r.work_sec,
    restSec: r.rest_sec,
    completedSets: r.completed_sets,
    totalSets: r.total_sets,
    endedEarly: !!r.ended_early,
    sets: bySession.get(r.id) ?? [],
  }));
}

export async function insertSessions(db: Db, userId: string, sessions: CompletedSession[]): Promise<void> {
  if (!sessions.length) return;
  await db.withTransactionAsync(async () => {
    for (const se of sessions) {
      const inserted = await db.runAsync(
        `INSERT OR IGNORE INTO sessions (id, user_id, workout_id, workout_name, plan_id, started_at, finished_at, work_sec, rest_sec, completed_sets, total_sets, ended_early)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        se.id,
        userId,
        se.workoutId,
        se.workoutName,
        s(se.planId),
        se.startedAt,
        se.finishedAt,
        Math.round(se.workSec),
        Math.round(se.restSec),
        se.completedSets,
        se.totalSets,
        se.endedEarly ? 1 : 0,
      );
      // Already saved (e.g. a retried save): don't add its sets a second time.
      if (inserted.changes === 0) continue;
      let position = 0;
      for (const st of se.sets ?? []) {
        await db.runAsync(
          `INSERT INTO session_sets (session_id, position, exercise_id, exercise_name, set_number, mode, reps, weight_kg, duration_sec, at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          se.id,
          position++,
          st.exerciseId,
          st.exerciseName,
          st.setNumber,
          st.mode,
          st.reps,
          st.weightKg,
          st.durationSec,
          st.at,
        );
      }
    }
  });
}

/* ---------------- form checks ---------------- */

export async function insertFormCheck(db: Db, userId: string, fc: FormCheckRecord): Promise<void> {
  const avg = fc.reps.length ? fc.reps.reduce((t, r) => t + r.score, 0) / fc.reps.length : null;
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO form_checks (id, user_id, exercise, started_at, finished_at, reps, avg_score) VALUES (?, ?, ?, ?, ?, ?, ?)',
      fc.id,
      userId,
      fc.exercise,
      fc.startedAt,
      fc.finishedAt,
      fc.count,
      avg,
    );
    for (const r of fc.reps) {
      await db.runAsync(
        `INSERT INTO form_check_reps (form_check_id, n, side, view, score, range_label, range_good, rom_deg, eccentric_sec, concentric_sec, eccentric, concentric, issues, detail)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        fc.id,
        r.n,
        s(r.side),
        r.view,
        r.score,
        r.rangeLabel,
        r.rangeGood ? 1 : 0,
        r.romDeg,
        r.eccentricSec,
        r.concentricSec,
        r.eccentric,
        r.concentric,
        JSON.stringify(r.issues),
        r.detail,
      );
    }
  });
}

export type FormCheckSummary = { id: string; exercise: string; finishedAt: number; reps: number; avgScore: number | null };

export async function listFormChecks(db: Db, userId: string): Promise<FormCheckSummary[]> {
  const rows = await db.getAllAsync<{ id: string; exercise: string; finished_at: number; reps: number; avg_score: number | null }>(
    'SELECT id, exercise, finished_at, reps, avg_score FROM form_checks WHERE user_id = ? ORDER BY finished_at DESC',
    userId,
  );
  return rows.map((r) => ({ id: r.id, exercise: r.exercise, finishedAt: r.finished_at, reps: r.reps, avgScore: r.avg_score }));
}

/* ---------------- everything for one user ---------------- */

export type UserData = {
  workouts: Workout[];
  plans: Plan[];
  schedule: Schedule | null;
  history: CompletedSession[];
  customExercises: Exercise[];
  settings: Settings;
  formChecks: FormCheckSummary[];
};

export async function loadUserData(db: Db, userId: string): Promise<UserData> {
  const [workouts, plans, schedule, history, customExercises, settings, formChecks] = [
    await listWorkouts(db, userId),
    await listPlans(db, userId),
    await getSchedule(db, userId),
    await listSessions(db, userId),
    await listCustomExercises(db, userId),
    await getSettings(db, userId),
    await listFormChecks(db, userId),
  ];
  return { workouts, plans, schedule, history, customExercises, settings, formChecks };
}
