import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { BUILT_IN_EXERCISES } from './exercises';
import { uid } from './id';
import { samplePlanWithWorkouts, sampleWorkouts } from './samples';
import type { CompletedSession, Exercise, Plan, Schedule, Settings, Workout } from './types';

const KEYS = {
  workouts: 'kc.workouts.v1',
  customExercises: 'kc.customExercises.v1',
  settings: 'kc.settings.v1',
  history: 'kc.history.v1',
  plans: 'kc.plans.v1',
  schedule: 'kc.schedule.v1',
};

const DEFAULT_SETTINGS: Settings = {
  voiceEnabled: true,
  countdownBeeps: true,
  prepSec: 10,
  displayName: '',
};

type Store = {
  ready: boolean;
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
};

const Ctx = createContext<Store | null>(null);

async function load<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function persist(key: string, value: unknown) {
  AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {});
}

function upsert<T extends { id: string }>(list: T[], items: T[]): T[] {
  const next = list.slice();
  for (const it of items) {
    const i = next.findIndex((x) => x.id === it.id);
    if (i === -1) next.unshift(it);
    else next[i] = it;
  }
  return next;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [custom, setCustom] = useState<Exercise[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [history, setHistory] = useState<CompletedSession[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [schedule, setScheduleState] = useState<Schedule | null>(null);

  useEffect(() => {
    (async () => {
      const [w, c, s, h, p, sch] = await Promise.all([
        load<Workout[] | null>(KEYS.workouts, null),
        load<Exercise[]>(KEYS.customExercises, []),
        load<Settings>(KEYS.settings, DEFAULT_SETTINGS),
        load<CompletedSession[]>(KEYS.history, []),
        load<Plan[] | null>(KEYS.plans, null),
        load<Schedule | null>(KEYS.schedule, null),
      ]);
      let loadedWorkouts = w ?? sampleWorkouts();
      let loadedPlans = p;
      if (!loadedPlans) {
        // First run of the plans feature: add the starter plan and its workouts.
        const sample = samplePlanWithWorkouts();
        loadedPlans = [sample.plan];
        const missing = sample.workouts.filter((sw) => !loadedWorkouts.some((x) => x.id === sw.id));
        loadedWorkouts = [...loadedWorkouts, ...missing];
      }
      setWorkouts(loadedWorkouts);
      setCustom(c);
      setSettings({ ...DEFAULT_SETTINGS, ...s });
      setHistory(h);
      setPlans(loadedPlans);
      setScheduleState(sch);
      setReady(true);
    })();
  }, []);

  useEffect(() => { if (ready) persist(KEYS.workouts, workouts); }, [ready, workouts]);
  useEffect(() => { if (ready) persist(KEYS.customExercises, custom); }, [ready, custom]);
  useEffect(() => { if (ready) persist(KEYS.settings, settings); }, [ready, settings]);
  useEffect(() => { if (ready) persist(KEYS.history, history); }, [ready, history]);
  useEffect(() => { if (ready) persist(KEYS.plans, plans); }, [ready, plans]);
  useEffect(() => { if (ready) persist(KEYS.schedule, schedule); }, [ready, schedule]);

  const saveWorkout = useCallback((w: Workout) => {
    setWorkouts((prev) => upsert(prev, [{ ...w, updatedAt: Date.now() }]));
  }, []);

  const saveWorkouts = useCallback((ws: Workout[]) => {
    setWorkouts((prev) => upsert(prev, ws));
  }, []);

  const deleteWorkout = useCallback((id: string) => {
    setWorkouts((prev) => prev.filter((w) => w.id !== id));
    // Keep plans consistent: drop the workout from any plan that used it.
    setPlans((prev) => prev.map((p) => (p.workoutIds.includes(id) ? { ...p, workoutIds: p.workoutIds.filter((x) => x !== id) } : p)));
  }, []);

  const addCustomExercise = useCallback((e: Omit<Exercise, 'id' | 'custom'>) => {
    const ex: Exercise = { ...e, id: 'custom-' + uid(), custom: true };
    setCustom((prev) => [...prev, ex]);
    return ex;
  }, []);

  const deleteCustomExercise = useCallback((id: string) => {
    setCustom((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const logSession = useCallback((s: CompletedSession) => {
    setHistory((prev) => [s, ...prev].slice(0, 2000));
  }, []);

  const savePlan = useCallback((p: Plan) => {
    setPlans((prev) => upsert(prev, [{ ...p, updatedAt: Date.now() }]));
  }, []);

  const deletePlan = useCallback((id: string) => {
    setPlans((prev) => prev.filter((p) => p.id !== id));
    setScheduleState((s) => (s?.planId === id ? null : s));
  }, []);

  const setSchedule = useCallback((s: Schedule | null) => setScheduleState(s), []);

  const exercises = useMemo(
    () => [...BUILT_IN_EXERCISES, ...custom].sort((a, b) => a.name.localeCompare(b.name)),
    [custom],
  );

  const value = useMemo<Store>(
    () => ({
      ready, workouts, exercises, settings, history, plans, schedule,
      saveWorkout, saveWorkouts, deleteWorkout, addCustomExercise, deleteCustomExercise,
      updateSettings, logSession, savePlan, deletePlan, setSchedule,
    }),
    [ready, workouts, exercises, settings, history, plans, schedule,
      saveWorkout, saveWorkouts, deleteWorkout, addCustomExercise, deleteCustomExercise,
      updateSettings, logSession, savePlan, deletePlan, setSchedule],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used inside StoreProvider');
  return s;
}
