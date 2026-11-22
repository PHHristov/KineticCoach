import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { BUILT_IN_EXERCISES } from './exercises';
import { uid } from './id';
import type { CompletedSession, Exercise, Settings, Workout } from './types';

const KEYS = {
  workouts: 'kc.workouts.v1',
  customExercises: 'kc.customExercises.v1',
  settings: 'kc.settings.v1',
  history: 'kc.history.v1',
};

const DEFAULT_SETTINGS: Settings = {
  voiceEnabled: true,
  countdownBeeps: true,
  prepSec: 10,
  displayName: '',
};

function sampleWorkouts(): Workout[] {
  const now = Date.now();
  return [
    {
      id: 'sample-hiit',
      name: '15-min Bodyweight HIIT',
      description: 'Quick full-body session, no equipment needed.',
      type: 'HIIT',
      author: 'KineticCoach',
      createdAt: now,
      updatedAt: now,
      items: [
        { id: uid(), exerciseId: 'jumping-jack', exerciseName: 'Jumping jacks', mode: 'time', sets: 2, reps: 10, durationSec: 40, weightKg: 0, restBetweenSetsSec: 20, restAfterSec: 30 },
        { id: uid(), exerciseId: 'squat', exerciseName: 'Squat', mode: 'reps', sets: 3, reps: 15, durationSec: 30, weightKg: 0, restBetweenSetsSec: 30, restAfterSec: 45 },
        { id: uid(), exerciseId: 'push-up', exerciseName: 'Push-up', mode: 'reps', sets: 3, reps: 10, durationSec: 30, weightKg: 0, restBetweenSetsSec: 30, restAfterSec: 45 },
        { id: uid(), exerciseId: 'plank', exerciseName: 'Plank', mode: 'time', sets: 2, reps: 10, durationSec: 45, weightKg: 0, restBetweenSetsSec: 20, restAfterSec: 0 },
      ],
    },
  ];
}

type Store = {
  ready: boolean;
  workouts: Workout[];
  exercises: Exercise[];
  settings: Settings;
  history: CompletedSession[];
  saveWorkout: (w: Workout) => void;
  deleteWorkout: (id: string) => void;
  addCustomExercise: (e: Omit<Exercise, 'id' | 'custom'>) => Exercise;
  deleteCustomExercise: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  logSession: (s: CompletedSession) => void;
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

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [custom, setCustom] = useState<Exercise[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [history, setHistory] = useState<CompletedSession[]>([]);

  useEffect(() => {
    (async () => {
      const [w, c, s, h] = await Promise.all([
        load<Workout[] | null>(KEYS.workouts, null),
        load<Exercise[]>(KEYS.customExercises, []),
        load<Settings>(KEYS.settings, DEFAULT_SETTINGS),
        load<CompletedSession[]>(KEYS.history, []),
      ]);
      setWorkouts(w ?? sampleWorkouts());
      setCustom(c);
      setSettings({ ...DEFAULT_SETTINGS, ...s });
      setHistory(h);
      setReady(true);
    })();
  }, []);

  useEffect(() => { if (ready) persist(KEYS.workouts, workouts); }, [ready, workouts]);
  useEffect(() => { if (ready) persist(KEYS.customExercises, custom); }, [ready, custom]);
  useEffect(() => { if (ready) persist(KEYS.settings, settings); }, [ready, settings]);
  useEffect(() => { if (ready) persist(KEYS.history, history); }, [ready, history]);

  const saveWorkout = useCallback((w: Workout) => {
    setWorkouts((prev) => {
      const next = { ...w, updatedAt: Date.now() };
      const i = prev.findIndex((p) => p.id === w.id);
      if (i === -1) return [next, ...prev];
      const copy = prev.slice();
      copy[i] = next;
      return copy;
    });
  }, []);

  const deleteWorkout = useCallback((id: string) => {
    setWorkouts((prev) => prev.filter((w) => w.id !== id));
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
    setHistory((prev) => [s, ...prev].slice(0, 500));
  }, []);

  const exercises = useMemo(
    () => [...BUILT_IN_EXERCISES, ...custom].sort((a, b) => a.name.localeCompare(b.name)),
    [custom],
  );

  const value = useMemo<Store>(
    () => ({
      ready, workouts, exercises, settings, history,
      saveWorkout, deleteWorkout, addCustomExercise, deleteCustomExercise, updateSettings, logSession,
    }),
    [ready, workouts, exercises, settings, history, saveWorkout, deleteWorkout, addCustomExercise, deleteCustomExercise, updateSettings, logSession],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used inside StoreProvider');
  return s;
}
