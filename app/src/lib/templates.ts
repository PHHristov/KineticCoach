import { BUILT_IN_EXERCISES } from './exercises';
import { uid } from './id';
import { samplePlanWithWorkouts } from './samples';
import type { ActiveRest, Plan, Workout, WorkoutItem } from './types';

/**
 * Ready-made plans anyone can add to their profile. `build()` returns fresh copies with new ids,
 * so every profile (and every "add again") gets its own workouts.
 */
export type PlanTemplate = {
  id: string;
  name: string;
  summary: string;
  daysPerWeek: number;
  build: () => { plan: Plan; workouts: Workout[] };
};

const exerciseName = (id: string) => {
  const e = BUILT_IN_EXERCISES.find((x) => x.id === id);
  if (!e) throw new Error(`Unknown exercise in template: ${id}`);
  return e.name;
};

const cardio = (id: string, sec: number): ActiveRest => ({ exerciseId: id, exerciseName: exerciseName(id), sec });

function set(id: string, sets: number, reps: number, active?: ActiveRest, restAfterSec = 60): WorkoutItem {
  return {
    id: uid(),
    exerciseId: id,
    exerciseName: exerciseName(id),
    mode: 'reps',
    sets,
    reps,
    durationSec: 30,
    weightKg: 0,
    restBetweenSetsSec: 60,
    restAfterSec,
    activeRest: active,
  };
}

function hold(id: string, sets: number, sec: number, active?: ActiveRest, restAfterSec = 60): WorkoutItem {
  return { ...set(id, sets, 10, active, restAfterSec), mode: 'time', durationSec: sec };
}

function workout(name: string, description: string, items: WorkoutItem[]): Workout {
  const now = Date.now();
  // The last exercise has nothing after it to rest for.
  const fixed = items.map((it, i) => (i === items.length - 1 ? { ...it, restAfterSec: 0 } : it));
  return { id: uid(), name, description, type: 'Strength', author: 'KineticCoach', items: fixed, createdAt: now, updatedAt: now };
}

/** Fat-loss 4-day split built on active rest (cardio bursts between sets). */
function shred4(): { plan: Plan; workouts: Workout[] } {
  const rope = cardio('jump-rope', 60);
  const jacks = cardio('jumping-jack', 60);
  const climbers = cardio('mountain-climber', 45);
  const burpees = cardio('burpee', 30);
  const shortJacks = cardio('jumping-jack', 30);
  const workouts = [
    workout('Shred 1 – Chest, shoulders, triceps', 'Push day. Jump rope between every set.', [
      set('bench-press', 4, 10, rope),
      set('incline-dumbbell-press', 3, 12, rope),
      set('overhead-press', 3, 10, rope),
      set('lateral-raise', 3, 15, rope),
      set('triceps-pushdown', 3, 12, rope),
      set('cable-fly', 3, 15, rope),
    ]),
    workout('Shred 2 – Legs', 'Leg day. Jumping jacks between every set.', [
      set('squat', 4, 10, jacks),
      set('romanian-deadlift', 3, 10, jacks),
      set('leg-press', 3, 15, jacks),
      set('lunge', 3, 12, jacks),
      set('leg-curl', 3, 12, jacks),
      set('calf-raise', 3, 20, jacks),
    ]),
    workout('Shred 3 – Back and biceps', 'Pull day. Mountain climbers between every set.', [
      set('pull-up', 4, 8, climbers),
      set('bent-over-row', 4, 10, climbers),
      set('lat-pulldown', 3, 12, climbers),
      set('seated-cable-row', 3, 12, climbers),
      set('face-pull', 3, 15, climbers),
      set('bicep-curl', 3, 12, climbers),
      set('hammer-curl', 3, 12, climbers),
    ]),
    workout('Shred 4 – Full body and core', 'Power and core. Burpees between every set.', [
      set('deadlift', 4, 6, burpees),
      set('thruster', 3, 10, burpees),
      set('kettlebell-swing', 3, 15, burpees),
      set('russian-twist', 3, 20, shortJacks),
      set('leg-raise', 3, 12, shortJacks),
      hold('plank', 3, 45, shortJacks),
    ]),
  ];
  const now = Date.now();
  return {
    workouts,
    plan: {
      id: uid(),
      name: '4-Day Shred (active rest)',
      description:
        'Fat-loss focused 4-day split. Instead of resting between sets, do a short cardio burst (jump rope, jumping jacks, ' +
        'mountain climbers or burpees) to keep your heart rate up; rest 60 s when moving to the next exercise. ' +
        'Pick weights you can lift for the target reps with good form, and add a little each week. ' +
        'Inspired by the cardio-acceleration method.',
      author: 'KineticCoach',
      workoutIds: workouts.map((w) => w.id),
      createdAt: now,
      updatedAt: now,
    },
  };
}

export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    id: 'shred-4',
    name: '4-Day Shred (active rest)',
    summary: 'Fat loss with cardio bursts between every set: push, legs, pull, full body.',
    daysPerWeek: 4,
    build: shred4,
  },
  {
    id: 'upper-lower-4',
    name: '4-day Upper/Lower split',
    summary: 'Classic strength split: two upper-body and two lower-body days.',
    daysPerWeek: 4,
    build: samplePlanWithWorkouts,
  },
];
