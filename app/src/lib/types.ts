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
  /**
   * Active rest ("cardio acceleration"): instead of resting between sets, do this cardio
   * exercise for `sec` seconds. Replaces restBetweenSetsSec when set.
   */
  activeRest?: ActiveRest;
}

export interface ActiveRest {
  exerciseId: string;
  exerciseName: string;
  sec: number;
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

/** One set as actually performed, with what the user entered. */
export interface LoggedSet {
  exerciseId: string;
  exerciseName: string;
  setNumber: number;
  mode: ExerciseMode;
  reps: number;
  weightKg: number;
  durationSec: number;
  at: number;
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
  /** Sets logged during the session (missing on sessions from before set logging). */
  sets?: LoggedSet[];
  /** Plan this session was scheduled from, if any. */
  planId?: string;
  /** True when the user pressed End before reaching the end of the workout. */
  endedEarly?: boolean;
}

/**
 * A training plan: an ordered list of workouts, one per training day.
 * A 4-workout plan is a 4-day-a-week plan.
 */
export interface Plan {
  id: string;
  name: string;
  description: string;
  author: string;
  workoutIds: string[];
  createdAt: number;
  updatedAt: number;
}

/** The plan the user follows and the weekdays they train on. */
export interface Schedule {
  planId: string;
  /** Weekdays, 0 = Monday … 6 = Sunday, sorted. days[i] runs plan.workoutIds[i]. */
  days: number[];
  startedAt: number;
}

export type Goal = 'strength' | 'muscle' | 'fitness' | 'weight-loss' | 'mobility';
export type Experience = 'beginner' | 'intermediate' | 'advanced';

/** A person using the app on this device. Body data is optional. */
export interface UserProfile {
  id: string;
  name: string;
  weightKg?: number;
  heightCm?: number;
  birthYear?: number;
  goal?: Goal;
  experience?: Experience;
  createdAt: number;
  lastActiveAt: number;
}

/** One rep's result from a camera form check, as stored. */
export interface FormCheckRepRecord {
  n: number;
  side?: string;
  view: string;
  score: number;
  rangeLabel: string;
  rangeGood: boolean;
  romDeg: number;
  eccentricSec: number;
  concentricSec: number;
  eccentric: string;
  concentric: string;
  issues: string[];
  detail: string;
}

export interface FormCheckRecord {
  id: string;
  exercise: string;
  startedAt: number;
  finishedAt: number;
  reps: FormCheckRepRecord[];
  /** Rep counter (left + right = one rep for curls), which can differ from reps.length. */
  count: number;
}
