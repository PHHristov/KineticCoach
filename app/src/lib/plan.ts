import type { Workout, WorkoutItem } from './types';

/** Rough seconds per rep, used only to estimate the length of rep-based sets. */
export const SEC_PER_REP = 3;

export type Step =
  | {
      kind: 'prep';
      durationSec: number;
      next: WorkoutItem;
    }
  | {
      kind: 'work';
      item: WorkoutItem;
      itemIndex: number;
      setNumber: number; // 1-based
      /** Present for timed sets; rep-based sets are finished by the user. */
      durationSec?: number;
    }
  | {
      kind: 'rest';
      durationSec: number;
      /** What comes after this rest. */
      next: WorkoutItem;
      nextSetNumber: number;
      betweenExercises: boolean;
      /** Cardio to do during this rest (active rest), if any. */
      active?: { exerciseId: string; exerciseName: string };
    };

/** Flattens a workout into the ordered list of steps the player walks through. */
export function buildSteps(workout: Workout, prepSec: number): Step[] {
  const steps: Step[] = [];
  const items = workout.items.filter((i) => i.sets > 0);
  if (items.length === 0) return steps;

  if (prepSec > 0) steps.push({ kind: 'prep', durationSec: prepSec, next: items[0] });

  items.forEach((item, itemIndex) => {
    for (let set = 1; set <= item.sets; set++) {
      steps.push({
        kind: 'work',
        item,
        itemIndex,
        setNumber: set,
        durationSec: item.mode === 'time' ? item.durationSec : undefined,
      });
      const isLastSet = set === item.sets;
      const nextItem = items[itemIndex + 1];
      const active = item.activeRest && item.activeRest.sec > 0 ? item.activeRest : undefined;
      if (!isLastSet && active) {
        steps.push({
          kind: 'rest',
          durationSec: active.sec,
          next: item,
          nextSetNumber: set + 1,
          betweenExercises: false,
          active: { exerciseId: active.exerciseId, exerciseName: active.exerciseName },
        });
      } else if (!isLastSet && item.restBetweenSetsSec > 0) {
        steps.push({
          kind: 'rest',
          durationSec: item.restBetweenSetsSec,
          next: item,
          nextSetNumber: set + 1,
          betweenExercises: false,
        });
      } else if (isLastSet && nextItem && item.restAfterSec > 0) {
        steps.push({
          kind: 'rest',
          durationSec: item.restAfterSec,
          next: nextItem,
          nextSetNumber: 1,
          betweenExercises: true,
        });
      }
    }
  });
  return steps;
}

export function estimateStepSec(step: Step): number {
  if (step.kind === 'work') {
    return step.durationSec ?? step.item.reps * SEC_PER_REP;
  }
  return step.durationSec;
}

export function estimateWorkout(workout: Workout): { totalSec: number; restSec: number; sets: number } {
  const steps = buildSteps(workout, 0);
  let totalSec = 0;
  let restSec = 0;
  let sets = 0;
  for (const s of steps) {
    const d = estimateStepSec(s);
    totalSec += d;
    if (s.kind === 'rest') restSec += d;
    if (s.kind === 'work') sets++;
  }
  return { totalSec, restSec, sets };
}

export function describeSet(item: WorkoutItem): string {
  const load = item.weightKg > 0 ? ` @ ${item.weightKg} kg` : '';
  return item.mode === 'reps'
    ? `${item.sets} × ${item.reps} reps${load}`
    : `${item.sets} × ${item.durationSec}s${load}`;
}

/** "30s rest between sets" or "60s jump rope between sets" (active rest). */
export function describeRest(item: WorkoutItem): string {
  if (item.sets <= 1) return '';
  if (item.activeRest && item.activeRest.sec > 0) return `${item.activeRest.sec}s ${item.activeRest.exerciseName.toLowerCase()} between sets`;
  return `${item.restBetweenSetsSec}s rest between sets`;
}
