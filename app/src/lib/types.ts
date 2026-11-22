export type ExerciseMode = 'reps' | 'time';

export type ExerciseCategory =
  | 'Upper body'
  | 'Lower body'
  | 'Core'
  | 'Full body'
  | 'Cardio'
  | 'Mobility';

export const CATEGORIES: ExerciseCategory[] = [
  'Upper body',
  'Lower body',
  'Core',
  'Full body',
  'Cardio',
  'Mobility',
];

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  description?: string;
  /** Whether a set is normally counted in reps or held for a duration. */
  defaultMode: ExerciseMode;
  /** True for exercises the user created themselves. */
  custom?: boolean;
}

export type WorkoutType = 'HIIT' | 'Strength' | 'Bodyweight' | 'Mobility' | 'Custom';
export const WORKOUT_TYPES: WorkoutType[] = ['HIIT', 'Strength', 'Bodyweight', 'Mobility', 'Custom'];

/** One exercise inside a workout, with its set scheme and rest periods. */
export interface WorkoutItem {
  id: string;
  exerciseId: string;
  /** Snapshot of the exercise so shared workouts work without the author's library. */
  exerciseName: string;
  mode: ExerciseMode;
  sets: number;
  /** Target reps per set (mode = 'reps'). */
  reps: number;
  /** Seconds per set (mode = 'time'). */
  durationSec: number;
  /** Optional weight in kg, 0 = bodyweight. */
  weightKg: number;
  /** Rest between sets of this exercise. */
  restBetweenSetsSec: number;
  /** Rest after the last set, before the next exercise. */
  restAfterSec: number;
}

export interface Workout {
  id: string;
  name: string;
  description: string;
  type: WorkoutType;
  author: string;
  items: WorkoutItem[];
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  voiceEnabled: boolean;
  /** Spoken 3-2-1 countdown at the end of timed steps. */
  countdownBeeps: boolean;
  /** Seconds of "get ready" before the first exercise. */
  prepSec: number;
  displayName: string;
}

export interface CompletedSession {
  id: string;
  workoutId: string;
  workoutName: string;
  startedAt: number;
  finishedAt: number;
  /** Total active (non-rest) seconds. */
  workSec: number;
  restSec: number;
  completedSets: number;
  totalSets: number;
}
