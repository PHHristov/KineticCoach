/**
 * Local database schema (SQLite). Every user-owned row carries `user_id`, and deleting a user
 * deletes everything they own (ON DELETE CASCADE).
 *
 * Schema changes: add a new step to MIGRATIONS (never edit a shipped one) and bump nothing else;
 * `migrate` runs the missing steps in one transaction and records the version in PRAGMA user_version.
 */

/** The small part of the SQLite API the app uses; expo-sqlite and Node's node:sqlite both fit it. */
export interface Db {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: SqlValue[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getFirstAsync<T>(sql: string, ...params: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: SqlValue[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

export type SqlValue = string | number | null;

export const MIGRATIONS: string[] = [
  // 1 — first version of the local database
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    weight_kg REAL,
    height_cm REAL,
    birth_year INTEGER,
    goal TEXT,
    experience TEXT,
    settings TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    last_active_at INTEGER NOT NULL
  );

  -- Built-in exercises have user_id NULL; custom ones belong to a user.
  CREATE TABLE exercises (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    default_mode TEXT NOT NULL CHECK (default_mode IN ('reps', 'time')),
    description TEXT,
    builtin INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE workouts (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE workout_items (
    id TEXT PRIMARY KEY NOT NULL,
    workout_id TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    exercise_id TEXT NOT NULL,
    exercise_name TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('reps', 'time')),
    sets INTEGER NOT NULL,
    reps INTEGER NOT NULL,
    duration_sec INTEGER NOT NULL,
    weight_kg REAL NOT NULL,
    rest_between_sec INTEGER NOT NULL,
    rest_after_sec INTEGER NOT NULL
  );

  CREATE TABLE plans (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    author TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- One row per training day: day 1 runs the workout at position 0, and so on.
  CREATE TABLE plan_days (
    plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    workout_id TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    PRIMARY KEY (plan_id, position)
  );

  -- What the user has committed to: one active plan and their training weekdays (0 = Monday).
  CREATE TABLE schedules (
    user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    days TEXT NOT NULL,
    started_at INTEGER NOT NULL
  );

  -- Completed (or ended-early) workouts.
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workout_id TEXT NOT NULL,
    workout_name TEXT NOT NULL,
    plan_id TEXT,
    started_at INTEGER NOT NULL,
    finished_at INTEGER NOT NULL,
    work_sec INTEGER NOT NULL,
    rest_sec INTEGER NOT NULL,
    completed_sets INTEGER NOT NULL,
    total_sets INTEGER NOT NULL,
    ended_early INTEGER NOT NULL DEFAULT 0
  );

  -- Every set the user logged: what they actually lifted.
  CREATE TABLE session_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    exercise_id TEXT NOT NULL,
    exercise_name TEXT NOT NULL,
    set_number INTEGER NOT NULL,
    mode TEXT NOT NULL,
    reps INTEGER NOT NULL,
    weight_kg REAL NOT NULL,
    duration_sec INTEGER NOT NULL,
    at INTEGER NOT NULL
  );

  -- Camera form checks and every rep's result.
  CREATE TABLE form_checks (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exercise TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    finished_at INTEGER NOT NULL,
    reps INTEGER NOT NULL,
    avg_score REAL
  );

  CREATE TABLE form_check_reps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    form_check_id TEXT NOT NULL REFERENCES form_checks(id) ON DELETE CASCADE,
    n INTEGER NOT NULL,
    side TEXT,
    view TEXT NOT NULL,
    score INTEGER NOT NULL,
    range_label TEXT NOT NULL,
    range_good INTEGER NOT NULL,
    rom_deg INTEGER NOT NULL,
    eccentric_sec REAL NOT NULL,
    concentric_sec REAL NOT NULL,
    eccentric TEXT NOT NULL,
    concentric TEXT NOT NULL,
    issues TEXT NOT NULL,
    detail TEXT NOT NULL
  );

  CREATE TABLE app_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);

  CREATE INDEX idx_exercises_user ON exercises(user_id);
  CREATE INDEX idx_workouts_user ON workouts(user_id);
  CREATE INDEX idx_items_workout ON workout_items(workout_id, position);
  CREATE INDEX idx_plans_user ON plans(user_id);
  CREATE INDEX idx_sessions_user ON sessions(user_id, finished_at);
  CREATE INDEX idx_sets_session ON session_sets(session_id, position);
  CREATE INDEX idx_sets_exercise ON session_sets(exercise_id);
  CREATE INDEX idx_form_checks_user ON form_checks(user_id, finished_at);
  CREATE INDEX idx_form_reps_check ON form_check_reps(form_check_id, n);
  `,
  // 2 — active rest (cardio between sets)
  `
  ALTER TABLE workout_items ADD COLUMN active_rest_exercise_id TEXT;
  ALTER TABLE workout_items ADD COLUMN active_rest_name TEXT;
  ALTER TABLE workout_items ADD COLUMN active_rest_sec INTEGER;
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** Brings the database up to SCHEMA_VERSION. Safe to call on every launch. */
export async function migrate(db: Db): Promise<void> {
  // Connection settings live outside the migration transaction.
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current > SCHEMA_VERSION) {
    throw new Error(`The database (version ${current}) is newer than this app (version ${SCHEMA_VERSION}). Update the app.`);
  }
  if (current === SCHEMA_VERSION) return;
  await db.withTransactionAsync(async () => {
    for (let v = current; v < SCHEMA_VERSION; v++) await db.execAsync(MIGRATIONS[v]);
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });
}
