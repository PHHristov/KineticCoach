import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { importLegacy, readLegacy } from './db/legacy';
import { openAppDatabase } from './db/open';
import * as repo from './db/repo';
import type { Db } from './db/schema';
import { BUILT_IN_EXERCISES } from './exercises';
import { uid } from './id';
import { samplePlanWithWorkouts, sampleWorkouts } from './samples';
import type { CompletedSession, Exercise, FormCheckRecord, Plan, Schedule, Settings, UserProfile, Workout } from './types';

/**
 * App state for the active user, backed by the local SQLite database.
 * Screens read plain arrays and call save functions; each write updates the screen at once and is
 * then stored in the database.
 */

type NewProfile = Omit<UserProfile, 'id' | 'createdAt' | 'lastActiveAt'>;

type Store = {
  /** True once the database is open and the active user's data (if any) is loaded. */
  ready: boolean;
  /** Set when the database couldn't be opened. */
  error: string | null;
  users: UserProfile[];
  user: UserProfile | null;
  /** More than one profile and nobody picked yet this time the app opened. */
  needsProfilePick: boolean;
  createUser: (p: NewProfile) => Promise<UserProfile>;
  switchUser: (id: string) => Promise<void>;
  updateUser: (u: UserProfile) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;

  workouts: Workout[];
  exercises: Exercise[];
  settings: Settings;
  history: CompletedSession[];
  plans: Plan[];
  schedule: Schedule | null;
  saveWorkout: (w: Workout) => void;
  /** Saves several workouts at once (e.g. when importing a plan). */
  saveWorkouts: (ws: Workout[]) => void;
  deleteWorkout: (id: string) => void;
  addCustomExercise: (e: Omit<Exercise, 'id' | 'custom'>) => Exercise;
  deleteCustomExercise: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  logSession: (s: CompletedSession) => void;
  savePlan: (p: Plan) => void;
  deletePlan: (id: string) => void;
  setSchedule: (s: Schedule | null) => void;
  saveFormCheck: (fc: FormCheckRecord) => void;
  /** Saved camera form checks, newest first. */
  formChecks: repo.FormCheckSummary[];
};

const Ctx = createContext<Store | null>(null);

const ACTIVE_USER_KEY = 'active_user_id';
/**
 * In a browser a page reload restarts the app; remember the profile picked in this tab so a
 * refresh doesn't ask "Who's training?" again. (On phones, the app asks each time it's launched.)
 */
const PICKED_KEY = 'kc.pickedProfile';
const pickedThisTab = (id: string | undefined) => {
  try {
    return !!id && typeof sessionStorage !== 'undefined' && sessionStorage.getItem(PICKED_KEY) === id;
  } catch {
    return false;
  }
};
const rememberPick = (id: string) => {
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(PICKED_KEY, id);
  } catch {
    // storage unavailable (private mode): just ask again next time
  }
};
const LEGACY_KEY = 'legacy_imported';

function upsert<T extends { id: string }>(list: T[], items: T[]): T[] {
  const next = list.slice();
  for (const it of items) {
    const i = next.findIndex((x) => x.id === it.id);
    if (i === -1) next.unshift(it);
    else next[i] = it;
  }
  return next;
}

/** Writes in the background; a failure is logged and doesn't break the screen. */
function persist(task: Promise<unknown>, what: string) {
  task.catch((e) => console.error(`Could not save ${what}:`, e));
}

const EMPTY: repo.UserData = { workouts: [], plans: [], schedule: null, history: [], customExercises: [], settings: repo.DEFAULT_SETTINGS, formChecks: [] };

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const dbRef = useRef<Db | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [picked, setPicked] = useState(false);
  const [data, setData] = useState<repo.UserData>(EMPTY);
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = userId;
  const settingsRef = useRef(data.settings);
  settingsRef.current = data.settings;

  const load = useCallback(async (db: Db, id: string | null) => {
    setData(id ? await repo.loadUserData(db, id) : EMPTY);
    setUserId(id);
  }, []);

  // Open the database, import pre-database data once, and restore the last active user.
  useEffect(() => {
    (async () => {
      try {
        const db = await openAppDatabase();
        dbRef.current = db;
        let list = await repo.listUsers(db);
        if (!list.length && !(await repo.getMeta(db, LEGACY_KEY))) {
          const legacy = await readLegacy(AsyncStorage);
          if (legacy) {
            const now = Date.now();
            const me: UserProfile = { id: uid(), name: legacy.settings.displayName.trim() || 'Me', createdAt: now, lastActiveAt: now };
            await repo.insertUser(db, me, legacy.settings);
            await importLegacy(db, me.id, legacy);
            await repo.setMeta(db, ACTIVE_USER_KEY, me.id);
            list = await repo.listUsers(db);
          }
          await repo.setMeta(db, LEGACY_KEY, '1');
        }
        setUsers(list);
        const saved = await repo.getMeta(db, ACTIVE_USER_KEY);
        const active = list.find((u) => u.id === saved) ?? list[0] ?? null;
        await load(db, active?.id ?? null);
        setPicked(list.length <= 1 || pickedThisTab(active?.id));
      } catch (e) {
        console.error('Could not open the database', e);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setReady(true);
      }
    })();
  }, [load]);

  const db = () => {
    if (!dbRef.current) throw new Error('Database not open');
    return dbRef.current;
  };

  /* ---------- profiles ---------- */

  const createUser = useCallback(
    async (p: NewProfile) => {
      const now = Date.now();
      const u: UserProfile = { ...p, name: p.name.trim(), id: uid(), createdAt: now, lastActiveAt: now };
      await repo.insertUser(db(), u);
      // New profiles start with the sample workouts and the 4-day plan.
      const sample = samplePlanWithWorkouts();
      await repo.saveWorkouts(db(), u.id, [...sampleWorkouts(), ...sample.workouts]);
      await repo.savePlans(db(), u.id, [sample.plan]);
      await repo.setMeta(db(), ACTIVE_USER_KEY, u.id);
      setUsers(await repo.listUsers(db()));
      await load(db(), u.id);
      setPicked(true);
      rememberPick(u.id);
      return u;
    },
    [load],
  );

  const switchUser = useCallback(
    async (id: string) => {
      await repo.touchUser(db(), id);
      await repo.setMeta(db(), ACTIVE_USER_KEY, id);
      setUsers(await repo.listUsers(db()));
      await load(db(), id);
      setPicked(true);
      rememberPick(id);
    },
    [load],
  );

  const updateUser = useCallback(async (u: UserProfile) => {
    await repo.updateUser(db(), { ...u, name: u.name.trim() });
    setUsers(await repo.listUsers(db()));
    if (u.id === userIdRef.current) setData((d) => ({ ...d, settings: { ...d.settings, displayName: u.name.trim() } }));
  }, []);

  const deleteUser = useCallback(
    async (id: string) => {
      await repo.deleteUser(db(), id);
      const list = await repo.listUsers(db());
      setUsers(list);
      if (id === userIdRef.current) {
        const next = list[0] ?? null;
        if (next) await repo.setMeta(db(), ACTIVE_USER_KEY, next.id);
        await load(db(), next?.id ?? null);
        setPicked(list.length <= 1);
      }
    },
    [load],
  );

  /* ---------- active user's data ---------- */

  const forUser = (fn: (db: Db, userId: string) => Promise<unknown>, what: string) => {
    const id = userIdRef.current;
    if (id && dbRef.current) persist(fn(dbRef.current, id), what);
  };

  const saveWorkout = useCallback((w: Workout) => {
    const next = { ...w, updatedAt: Date.now() };
    setData((d) => ({ ...d, workouts: upsert(d.workouts, [next]) }));
    forUser((db, u) => repo.saveWorkouts(db, u, [next]), 'the workout');
  }, []);

  const saveWorkouts = useCallback((ws: Workout[]) => {
    setData((d) => ({ ...d, workouts: upsert(d.workouts, ws) }));
    forUser((db, u) => repo.saveWorkouts(db, u, ws), 'the workouts');
  }, []);

  const deleteWorkout = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      workouts: d.workouts.filter((w) => w.id !== id),
      // Keep plans consistent: drop the workout from any plan that used it.
      plans: d.plans.map((p) => (p.workoutIds.includes(id) ? { ...p, workoutIds: p.workoutIds.filter((x) => x !== id) } : p)),
    }));
    forUser((db, u) => repo.deleteWorkout(db, u, id), 'the deletion');
  }, []);

  const addCustomExercise = useCallback((e: Omit<Exercise, 'id' | 'custom'>) => {
    const ex: Exercise = { ...e, id: 'custom-' + uid(), custom: true };
    setData((d) => ({ ...d, customExercises: [...d.customExercises, ex] }));
    forUser((db, u) => repo.insertCustomExercise(db, u, ex), 'the exercise');
    return ex;
  }, []);

  const deleteCustomExercise = useCallback((id: string) => {
    setData((d) => ({ ...d, customExercises: d.customExercises.filter((e) => e.id !== id) }));
    forUser((db, u) => repo.deleteCustomExercise(db, u, id), 'the deletion');
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    const settings = { ...settingsRef.current, ...patch };
    settingsRef.current = settings;
    setData((d) => ({ ...d, settings }));
    forUser((db, u) => repo.saveSettings(db, u, settings), 'settings');
  }, []);

  const logSession = useCallback((s: CompletedSession) => {
    setData((d) => ({ ...d, history: [s, ...d.history] }));
    forUser((db, u) => repo.insertSessions(db, u, [s]), 'the workout session');
  }, []);

  const savePlan = useCallback((p: Plan) => {
    const next = { ...p, updatedAt: Date.now() };
    setData((d) => ({ ...d, plans: upsert(d.plans, [next]) }));
    forUser((db, u) => repo.savePlans(db, u, [next]), 'the plan');
  }, []);

  const deletePlan = useCallback((id: string) => {
    setData((d) => ({ ...d, plans: d.plans.filter((p) => p.id !== id), schedule: d.schedule?.planId === id ? null : d.schedule }));
    forUser((db, u) => repo.deletePlan(db, u, id), 'the deletion');
  }, []);

  const setSchedule = useCallback((s: Schedule | null) => {
    setData((d) => ({ ...d, schedule: s }));
    forUser((db, u) => repo.setSchedule(db, u, s), 'the schedule');
  }, []);

  const saveFormCheck = useCallback((fc: FormCheckRecord) => {
    const avgScore = fc.reps.length ? fc.reps.reduce((t, r) => t + r.score, 0) / fc.reps.length : null;
    setData((d) => ({ ...d, formChecks: [{ id: fc.id, exercise: fc.exercise, finishedAt: fc.finishedAt, reps: fc.count, avgScore }, ...d.formChecks] }));
    forUser((db, u) => repo.insertFormCheck(db, u, fc), 'the form check');
  }, []);

  const exercises = useMemo(
    () => [...BUILT_IN_EXERCISES, ...data.customExercises].sort((a, b) => a.name.localeCompare(b.name)),
    [data.customExercises],
  );
  const user = users.find((u) => u.id === userId) ?? null;

  const value = useMemo<Store>(
    () => ({
      ready,
      error,
      users,
      user,
      needsProfilePick: ready && users.length > 1 && !picked,
      createUser,
      switchUser,
      updateUser,
      deleteUser,
      workouts: data.workouts,
      exercises,
      settings: data.settings,
      history: data.history,
      plans: data.plans,
      schedule: data.schedule,
      saveWorkout,
      saveWorkouts,
      deleteWorkout,
      addCustomExercise,
      deleteCustomExercise,
      updateSettings,
      logSession,
      savePlan,
      deletePlan,
      setSchedule,
      saveFormCheck,
      formChecks: data.formChecks,
    }),
    [ready, error, users, user, picked, createUser, switchUser, updateUser, deleteUser, data, exercises,
      saveWorkout, saveWorkouts, deleteWorkout, addCustomExercise, deleteCustomExercise, updateSettings,
      logSession, savePlan, deletePlan, setSchedule, saveFormCheck],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used inside StoreProvider');
  return s;
}
