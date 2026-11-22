import { uid } from './id';
import type { ExerciseMode, Plan, Workout, WorkoutItem } from './types';

function item(
  exerciseId: string,
  exerciseName: string,
  mode: ExerciseMode,
  sets: number,
  repsOrSec: number,
  weightKg = 0,
  restBetweenSetsSec = 90,
  restAfterSec = 120,
): WorkoutItem {
  return {
    id: uid(),
    exerciseId,
    exerciseName,
    mode,
    sets,
    reps: mode === 'reps' ? repsOrSec : 10,
    durationSec: mode === 'time' ? repsOrSec : 30,
    weightKg,
    restBetweenSetsSec,
    restAfterSec,
  };
}

/** Each profile gets its own copies, so ids carry a unique suffix (database ids are global). */
function workout(id: string, name: string, description: string, type: Workout['type'], items: WorkoutItem[]): Workout {
  const now = Date.now();
  return { id: `${id}-${uid()}`, name, description, type, author: 'KineticCoach', items, createdAt: now, updatedAt: now };
}

export function sampleWorkouts(): Workout[] {
  return [
    workout('sample-hiit', '15-min Bodyweight HIIT', 'Quick full-body session, no equipment needed.', 'HIIT', [
      item('jumping-jack', 'Jumping jacks', 'time', 2, 40, 0, 20, 30),
      item('squat', 'Squat', 'reps', 3, 15, 0, 30, 45),
      item('push-up', 'Push-up', 'reps', 3, 10, 0, 30, 45),
      item('plank', 'Plank', 'time', 2, 45, 0, 20, 0),
    ]),
  ];
}

/** A classic 4-day upper/lower split, used as the starter plan. */
export function samplePlanWithWorkouts(): { plan: Plan; workouts: Workout[] } {
  const workouts = [
    workout('sample-upper-a', 'Upper A – Push focus', 'Bench, overhead press and rows.', 'Strength', [
      item('bench-press', 'Bench press', 'reps', 4, 8, 60, 120),
      item('overhead-press', 'Overhead press', 'reps', 3, 8, 35),
      item('bent-over-row', 'Bent-over row', 'reps', 3, 10, 50),
      item('dip', 'Dip', 'reps', 3, 10, 0, 90, 0),
    ]),
    workout('sample-lower-a', 'Lower A – Squat focus', 'Squats, lunges and core.', 'Strength', [
      item('squat', 'Squat', 'reps', 4, 8, 80, 120),
      item('lunge', 'Lunge', 'reps', 3, 10, 20),
      item('calf-raise', 'Calf raise', 'reps', 3, 15, 40),
      item('plank', 'Plank', 'time', 3, 45, 0, 45, 0),
    ]),
    workout('sample-upper-b', 'Upper B – Pull focus', 'Pull-ups, rows and arms.', 'Strength', [
      item('pull-up', 'Pull-up', 'reps', 4, 6, 0, 120),
      item('bench-press', 'Bench press', 'reps', 3, 10, 55),
      item('bent-over-row', 'Bent-over row', 'reps', 3, 10, 50),
      item('bicep-curl', 'Bicep curl', 'reps', 3, 12, 12, 60, 0),
    ]),
    workout('sample-lower-b', 'Lower B – Hinge focus', 'Deadlifts, bridges and core.', 'Strength', [
      item('deadlift', 'Deadlift', 'reps', 4, 6, 100, 150),
      item('glute-bridge', 'Glute bridge', 'reps', 3, 12, 40),
      item('jump-squat', 'Jump squat', 'reps', 3, 10, 0),
      item('hollow-hold', 'Hollow hold', 'time', 3, 30, 0, 45, 0),
    ]),
  ];
  const now = Date.now();
  return {
    plan: {
      id: `sample-upper-lower-${uid()}`,
      name: '4-day Upper/Lower split',
      description: 'Two upper-body and two lower-body days a week. Good for building strength.',
      author: 'KineticCoach',
      workoutIds: workouts.map((w) => w.id),
      createdAt: now,
      updatedAt: now,
    },
    workouts,
  };
}
