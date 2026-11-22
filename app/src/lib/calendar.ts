import type { CompletedSession, Plan, Schedule, Workout } from './types';

export const WEEKDAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const DAY_MS = 24 * 60 * 60 * 1000;

/** 0 = Monday … 6 = Sunday. */
export function weekday(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function startOfDay(d: Date | number): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function startOfWeek(d: Date | number): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() - weekday(x));
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function sameDay(a: Date | number, b: Date | number): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

export function daysBetween(a: Date | number, b: Date | number): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS);
}

export type DayPlan = {
  date: Date;
  workout?: Workout;
  /** Sessions finished on this day (any workout). */
  sessions: CompletedSession[];
  /** True when the scheduled workout was finished that day. */
  done: boolean;
  /** Session of the scheduled workout that was ended early (if not done). */
  partial?: CompletedSession;
};

/** What the schedule says for a given day, plus what was actually done. */
export function planForDay(
  date: Date,
  schedule: Schedule | null,
  plan: Plan | undefined,
  workouts: Workout[],
  history: CompletedSession[],
): DayPlan {
  const sessions = history.filter((s) => sameDay(s.finishedAt, date));
  let workout: Workout | undefined;
  // Days before the plan was started are not scheduled (so they never show as missed).
  if (schedule && plan && startOfDay(date) >= startOfDay(schedule.startedAt)) {
    const slot = schedule.days.indexOf(weekday(date));
    const id = slot >= 0 ? plan.workoutIds[slot] : undefined;
    workout = id ? workouts.find((w) => w.id === id) : undefined;
  }
  const mine = workout ? sessions.filter((s) => s.workoutId === workout!.id) : [];
  const done = mine.some((s) => !s.endedEarly);
  const partial = done ? undefined : mine[0];
  return { date, workout, sessions, done, partial };
}

/** The next scheduled workout that has not been done yet, starting today. */
export function nextScheduled(
  from: Date,
  schedule: Schedule | null,
  plan: Plan | undefined,
  workouts: Workout[],
  history: CompletedSession[],
): DayPlan | undefined {
  for (let i = 0; i < 14; i++) {
    const day = planForDay(addDays(startOfDay(from), i), schedule, plan, workouts, history);
    if (day.workout && !day.done) return day;
  }
  return undefined;
}

export function relativeDayLabel(date: Date, today = new Date()): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return `${WEEKDAYS_LONG[weekday(date)]} ${date.getDate()}.${date.getMonth() + 1}.`;
}
