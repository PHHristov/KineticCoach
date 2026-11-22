/// <reference types="node" />
/**
 * Tests the local database layer against real SQLite (Node's built-in node:sqlite), through the
 * same Db interface the app uses with expo-sqlite.
 * Run: npm run test:db
 */
import { DatabaseSync } from 'node:sqlite';
import { BUILT_IN_EXERCISES } from '../src/lib/exercises';
import { importLegacy, readLegacy } from '../src/lib/db/legacy';
import * as repo from '../src/lib/db/repo';
import { migrate, MIGRATIONS, SCHEMA_VERSION, type Db, type SqlValue } from '../src/lib/db/schema';
import { samplePlanWithWorkouts } from '../src/lib/samples';
import type { CompletedSession, UserProfile, Workout } from '../src/lib/types';

function nodeDb(): Db & { raw: DatabaseSync } {
  const d = new DatabaseSync(':memory:');
  return {
    raw: d,
    async execAsync(sql) {
      d.exec(sql);
    },
    async runAsync(sql, ...p: SqlValue[]) {
      const r = d.prepare(sql).run(...p);
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    async getFirstAsync<T>(sql: string, ...p: SqlValue[]) {
      return ((d.prepare(sql).get(...p) as T | undefined) ?? null) as T | null;
    },
    async getAllAsync<T>(sql: string, ...p: SqlValue[]) {
      return d.prepare(sql).all(...p) as T[];
    },
    async withTransactionAsync(task) {
      d.exec('BEGIN');
      try {
        await task();
        d.exec('COMMIT');
      } catch (e) {
        d.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

let failed = 0;
function check(name: string, cond: boolean, info?: unknown) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failed++;
    console.log(`  ✗ ${name}`, info === undefined ? '' : JSON.stringify(info));
  }
}
const count = async (db: Db, sql: string, ...p: SqlValue[]) => (await db.getFirstAsync<{ c: number }>(sql, ...p))!.c;
const user = (id: string, name: string, at: number): UserProfile => ({ id, name, createdAt: at, lastActiveAt: at });

async function main() {
  console.log('Migrations');
  {
    const db = nodeDb();
    await migrate(db);
    const v = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    check(`fresh database migrates to version ${SCHEMA_VERSION}`, v?.user_version === SCHEMA_VERSION, v);
    await migrate(db);
    check('running migrations again is a no-op', (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version === SCHEMA_VERSION);
    const fk = await db.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys');
    check('foreign keys are on', fk?.foreign_keys === 1, fk);
    db.raw.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
    let threw = false;
    try {
      await migrate(db);
    } catch {
      threw = true;
    }
    check('a database from a newer app version is refused, not overwritten', threw);
  }

  console.log('Upgrading an existing version 1 database');
  {
    const old = nodeDb();
    old.raw.exec('PRAGMA foreign_keys = ON;');
    old.raw.exec(MIGRATIONS[0]);
    old.raw.exec('PRAGMA user_version = 1');
    old.raw.exec(`INSERT INTO users (id, name, settings, created_at, last_active_at) VALUES ('u', 'Old', '{}', 1, 1)`);
    old.raw.exec(`INSERT INTO workouts (id, user_id, name, type, created_at, updated_at) VALUES ('w', 'u', 'Old workout', 'Strength', 1, 1)`);
    old.raw.exec(`INSERT INTO workout_items (id, workout_id, position, exercise_id, exercise_name, mode, sets, reps, duration_sec, weight_kg, rest_between_sec, rest_after_sec)
                  VALUES ('i', 'w', 0, 'squat', 'Squat', 'reps', 3, 10, 30, 60, 90, 120)`);
    await migrate(old);
    const v = await old.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    const kept = await repo.listWorkouts(old, 'u');
    check(`upgrades to version ${SCHEMA_VERSION}`, v?.user_version === SCHEMA_VERSION, v);
    check('existing workouts survive the upgrade unchanged', kept.length === 1 && kept[0].items[0].weightKg === 60 && kept[0].items[0].activeRest === undefined, kept[0]?.items[0]);
  }

  const db = nodeDb();
  await migrate(db);

  console.log('Built-in exercises');
  await repo.syncBuiltInExercises(db);
  await repo.syncBuiltInExercises(db);
  check(`all ${BUILT_IN_EXERCISES.length} built-ins stored once (sync is idempotent)`, (await count(db, 'SELECT COUNT(*) c FROM exercises WHERE builtin = 1')) === BUILT_IN_EXERCISES.length);

  console.log('Users');
  await repo.insertUser(db, user('u1', 'Pavlin', 1000));
  await repo.insertUser(db, user('u2', "Anna O'Neil", 2000));
  let users = await repo.listUsers(db);
  check('lists most recently active first', users.map((u) => u.id).join() === 'u2,u1', users);
  check('names with quotes survive', users[0].name === "Anna O'Neil", users[0]);
  await repo.updateUser(db, { ...users[1], weightKg: 82.5, heightCm: 181, goal: 'strength', experience: 'intermediate', lastActiveAt: 3000 });
  users = await repo.listUsers(db);
  check('profile update saved and reorders by activity', users[0].id === 'u1' && users[0].weightKg === 82.5 && users[0].goal === 'strength', users[0]);
  await repo.saveSettings(db, 'u1', { voiceEnabled: false, countdownBeeps: true, prepSec: 5, displayName: 'ignored' });
  const st = await repo.getSettings(db, 'u1');
  check('settings saved per user; display name comes from the profile', !st.voiceEnabled && st.prepSec === 5 && st.displayName === 'Pavlin', st);
  check('other user keeps default settings', (await repo.getSettings(db, 'u2')).voiceEnabled === true);

  console.log('Workouts and plans');
  const { plan, workouts } = samplePlanWithWorkouts();
  await repo.saveWorkouts(db, 'u1', workouts);
  await repo.savePlans(db, 'u1', [plan]);
  let loaded = await repo.listWorkouts(db, 'u1');
  const first = loaded.find((w) => w.id === workouts[0].id)!;
  check('workouts round-trip with exercises in order', loaded.length === 4 && first.items.map((i) => i.exerciseId).join() === workouts[0].items.map((i) => i.exerciseId).join(), first);
  check('weights and rests round-trip', first.items[0].weightKg === workouts[0].items[0].weightKg && first.items[0].restAfterSec === workouts[0].items[0].restAfterSec);
  check("another user doesn't see them", (await repo.listWorkouts(db, 'u2')).length === 0);
  const edited: Workout = { ...first, name: 'Upper A (edited)', items: first.items.slice(0, 2), updatedAt: Date.now() + 1 };
  await repo.saveWorkouts(db, 'u1', [edited]);
  loaded = await repo.listWorkouts(db, 'u1');
  const after = loaded.find((w) => w.id === first.id)!;
  check('editing replaces the exercise list', after.name === 'Upper A (edited)' && after.items.length === 2, after);
  const cardio: Workout = {
    ...workouts[2],
    id: 'w-cardio',
    items: [{ ...workouts[2].items[0], id: 'i-cardio', activeRest: { exerciseId: 'jump-rope', exerciseName: 'Jump rope', sec: 60 } }],
  };
  await repo.saveWorkouts(db, 'u1', [cardio]);
  const cardioBack = (await repo.listWorkouts(db, 'u1')).find((w) => w.id === 'w-cardio')!;
  check('active rest (cardio between sets) round-trips', cardioBack.items[0].activeRest?.exerciseId === 'jump-rope' && cardioBack.items[0].activeRest?.sec === 60, cardioBack.items[0].activeRest);
  await repo.deleteWorkout(db, 'u1', 'w-cardio');
  let plans = await repo.listPlans(db, 'u1');
  check('plan keeps its 4 training days in order', plans[0].workoutIds.join() === plan.workoutIds.join(), plans[0]);

  console.log('Schedule (what the user committed to)');
  await repo.setSchedule(db, 'u1', { planId: plan.id, days: [0, 1, 3, 6], startedAt: 5000 });
  const sch = await repo.getSchedule(db, 'u1');
  check('schedule saved with weekdays', sch?.planId === plan.id && sch.days.join() === '0,1,3,6', sch);
  await repo.deleteWorkout(db, 'u1', workouts[1].id);
  plans = await repo.listPlans(db, 'u1');
  check('deleting a workout removes it from the plan and renumbers the days', plans[0].workoutIds.length === 3 && !plans[0].workoutIds.includes(workouts[1].id), plans[0]);
  check('remaining days keep their order', plans[0].workoutIds.join() === [workouts[0].id, workouts[2].id, workouts[3].id].join(), plans[0].workoutIds);

  console.log('Sessions and logged sets');
  const session: CompletedSession = {
    id: 's1',
    workoutId: workouts[0].id,
    workoutName: 'Upper A',
    planId: plan.id,
    startedAt: 10_000,
    finishedAt: 12_000,
    workSec: 600,
    restSec: 900,
    completedSets: 2,
    totalSets: 13,
    endedEarly: true,
    sets: [
      { exerciseId: 'bench-press', exerciseName: 'Bench press', setNumber: 1, mode: 'reps', reps: 8, weightKg: 62.5, durationSec: 30, at: 11_000 },
      { exerciseId: 'bench-press', exerciseName: 'Bench press', setNumber: 2, mode: 'reps', reps: 7, weightKg: 65, durationSec: 31, at: 11_500 },
    ],
  };
  await repo.insertSessions(db, 'u1', [session]);
  await repo.insertSessions(db, 'u1', [session]);
  const history = await repo.listSessions(db, 'u1');
  check('session saved once (re-saving the same id is ignored)', history.length === 1, history.length);
  check('every set kept with weight and reps', history[0].sets?.length === 2 && history[0].sets![1].weightKg === 65 && history[0].sets![1].reps === 7, history[0].sets);
  check('ended-early flag round-trips', history[0].endedEarly === true);
  const bench = await db.getAllAsync<{ total: number }>(
    "SELECT SUM(reps * weight_kg) total FROM session_sets WHERE exercise_id = 'bench-press'",
  );
  check('sets can be queried per exercise (e.g. bench volume 955 kg)', bench[0].total === 8 * 62.5 + 7 * 65, bench);

  console.log('Form checks');
  await repo.insertFormCheck(db, 'u1', {
    id: 'f1',
    exercise: 'bicep-curl',
    startedAt: 20_000,
    finishedAt: 21_000,
    count: 1,
    reps: [
      { n: 1, side: 'left', view: 'front', score: 85, rangeLabel: 'Full range', rangeGood: true, romDeg: 120, eccentricSec: 2.1, concentricSec: 1, eccentric: 'controlled', concentric: 'explosive', issues: ['shrug'], detail: 'elbow 165° → 45°' },
      { n: 1, side: 'right', view: 'front', score: 100, rangeLabel: 'Full range', rangeGood: true, romDeg: 122, eccentricSec: 2.3, concentricSec: 1, eccentric: 'controlled', concentric: 'explosive', issues: [], detail: 'elbow 166° → 44°' },
    ],
  });
  const fcs = await repo.listFormChecks(db, 'u1');
  check('form check saved with its rep count and average score', fcs.length === 1 && fcs[0].reps === 1 && fcs[0].avgScore === 92.5, fcs);
  check('each rep stored with its issues', (await count(db, "SELECT COUNT(*) c FROM form_check_reps WHERE form_check_id = 'f1' AND issues LIKE '%shrug%'")) === 1);

  console.log('Custom exercises');
  await repo.insertCustomExercise(db, 'u1', { id: 'c1', name: 'Archer push-up', category: 'Upper body', defaultMode: 'reps', custom: true });
  check('custom exercise belongs to its user only', (await repo.listCustomExercises(db, 'u1')).length === 1 && (await repo.listCustomExercises(db, 'u2')).length === 0);

  console.log('Transactions');
  const bad = { ...workouts[2], id: 'w-bad', items: [{ ...workouts[2].items[0], id: 'i-bad', mode: 'sideways' as never }] };
  let threw = false;
  try {
    await repo.saveWorkouts(db, 'u1', [bad]);
  } catch {
    threw = true;
  }
  check('an invalid exercise row fails the save…', threw);
  check('…and leaves no half-saved workout behind', (await count(db, "SELECT COUNT(*) c FROM workouts WHERE id = 'w-bad'")) === 0);

  console.log('Deleting a user');
  await repo.insertUser(db, user('u3', 'Temp', 4000));
  await repo.saveWorkouts(db, 'u2', samplePlanWithWorkouts().workouts);
  await repo.deleteUser(db, 'u1');
  const left = {
    workouts: await count(db, "SELECT COUNT(*) c FROM workouts WHERE user_id = 'u1'"),
    plans: await count(db, "SELECT COUNT(*) c FROM plans WHERE user_id = 'u1'"),
    schedules: await count(db, "SELECT COUNT(*) c FROM schedules WHERE user_id = 'u1'"),
    sessions: await count(db, "SELECT COUNT(*) c FROM sessions WHERE user_id = 'u1'"),
    sets: await count(db, 'SELECT COUNT(*) c FROM session_sets'),
    formChecks: await count(db, 'SELECT COUNT(*) c FROM form_checks'),
    formReps: await count(db, 'SELECT COUNT(*) c FROM form_check_reps'),
    items: await count(db, "SELECT COUNT(*) c FROM workout_items i JOIN workouts w ON w.id = i.workout_id WHERE w.user_id = 'u1'"),
    custom: await count(db, "SELECT COUNT(*) c FROM exercises WHERE user_id = 'u1'"),
  };
  check('removes all of their data', Object.values(left).every((v) => v === 0), left);
  check("other users' data is untouched", (await repo.listWorkouts(db, 'u2')).length === 4 && (await count(db, 'SELECT COUNT(*) c FROM exercises WHERE builtin = 1')) === BUILT_IN_EXERCISES.length);

  console.log('Importing data saved before the database');
  {
    const fresh = nodeDb();
    await migrate(fresh);
    const sample = samplePlanWithWorkouts();
    // An older duplicated workout shared exercise-row ids with its original.
    const dup = { ...sample.workouts[0], id: 'dup', name: 'Copy', items: sample.workouts[0].items };
    const kv = new Map<string, string>([
      ['kc.workouts.v1', JSON.stringify([...sample.workouts, dup])],
      ['kc.plans.v1', JSON.stringify([sample.plan])],
      ['kc.schedule.v1', JSON.stringify({ planId: sample.plan.id, days: [0, 2, 4, 6], startedAt: 1 })],
      ['kc.history.v1', JSON.stringify([session])],
      ['kc.settings.v1', JSON.stringify({ voiceEnabled: false, countdownBeeps: true, prepSec: 15, displayName: 'Pavlin' })],
      ['kc.customExercises.v1', JSON.stringify([{ id: 'c9', name: 'Zercher squat', category: 'Lower body', defaultMode: 'reps', custom: true }])],
    ]);
    const legacy = await readLegacy({ getItem: async (k) => kv.get(k) ?? null });
    check('old data is found', !!legacy && legacy.workouts.length === 5);
    await repo.insertUser(fresh, user('me', legacy!.settings.displayName || 'Me', 1));
    await importLegacy(fresh, 'me', legacy!);
    const data = await repo.loadUserData(fresh, 'me');
    check('workouts imported, including a duplicate that shared row ids', data.workouts.length === 5 && data.workouts.find((w) => w.id === 'dup')!.items.length === sample.workouts[0].items.length, data.workouts.length);
    check('plan, schedule, history, sets, settings and custom exercises imported', data.plans.length === 1 && data.schedule?.days.join() === '0,2,4,6' && data.history[0].sets?.length === 2 && data.settings.prepSec === 15 && data.customExercises.length === 1, {
      plans: data.plans.length,
      schedule: data.schedule,
      sets: data.history[0]?.sets?.length,
      prep: data.settings.prepSec,
      custom: data.customExercises.length,
    });
    check('nothing to import when there is no old data', (await readLegacy({ getItem: async () => null })) === null);
  }

  console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
