import type { Exercise } from './types';

/** Built-in exercise library. Ids are stable so shared workouts can reference them. */
export const BUILT_IN_EXERCISES: Exercise[] = [
  { id: 'push-up', name: 'Push-up', category: 'Upper body', defaultMode: 'reps', description: 'Hands under shoulders, body in a straight line, chest to the floor.' },
  { id: 'pike-push-up', name: 'Pike push-up', category: 'Upper body', defaultMode: 'reps', description: 'Hips high, lower the head towards the floor between the hands.' },
  { id: 'dip', name: 'Dip', category: 'Upper body', defaultMode: 'reps', description: 'On parallel bars or a bench, lower until elbows reach 90°.' },
  { id: 'pull-up', name: 'Pull-up', category: 'Upper body', defaultMode: 'reps', description: 'Overhand grip, pull until the chin clears the bar.' },
  { id: 'bench-press', name: 'Bench press', category: 'Upper body', defaultMode: 'reps' },
  { id: 'overhead-press', name: 'Overhead press', category: 'Upper body', defaultMode: 'reps' },
  { id: 'bent-over-row', name: 'Bent-over row', category: 'Upper body', defaultMode: 'reps' },
  { id: 'bicep-curl', name: 'Bicep curl', category: 'Upper body', defaultMode: 'reps' },

  { id: 'squat', name: 'Squat', category: 'Lower body', defaultMode: 'reps', description: 'Feet shoulder-width apart, hips back and down, knees track the toes.' },
  { id: 'lunge', name: 'Lunge', category: 'Lower body', defaultMode: 'reps', description: 'Step forward, lower the back knee towards the floor, alternate legs.' },
  { id: 'glute-bridge', name: 'Glute bridge', category: 'Lower body', defaultMode: 'reps' },
  { id: 'deadlift', name: 'Deadlift', category: 'Lower body', defaultMode: 'reps' },
  { id: 'calf-raise', name: 'Calf raise', category: 'Lower body', defaultMode: 'reps' },
  { id: 'wall-sit', name: 'Wall sit', category: 'Lower body', defaultMode: 'time' },
  { id: 'jump-squat', name: 'Jump squat', category: 'Lower body', defaultMode: 'reps' },

  { id: 'plank', name: 'Plank', category: 'Core', defaultMode: 'time', description: 'Forearms on the floor, body straight from head to heels.' },
  { id: 'side-plank', name: 'Side plank', category: 'Core', defaultMode: 'time' },
  { id: 'crunch', name: 'Crunch', category: 'Core', defaultMode: 'reps' },
  { id: 'russian-twist', name: 'Russian twist', category: 'Core', defaultMode: 'reps' },
  { id: 'leg-raise', name: 'Leg raise', category: 'Core', defaultMode: 'reps' },
  { id: 'hollow-hold', name: 'Hollow hold', category: 'Core', defaultMode: 'time' },

  { id: 'burpee', name: 'Burpee', category: 'Full body', defaultMode: 'reps', description: 'Squat, kick back to plank, push-up, jump up.' },
  { id: 'kettlebell-swing', name: 'Kettlebell swing', category: 'Full body', defaultMode: 'reps' },
  { id: 'thruster', name: 'Thruster', category: 'Full body', defaultMode: 'reps' },
  { id: 'bear-crawl', name: 'Bear crawl', category: 'Full body', defaultMode: 'time' },

  { id: 'jumping-jack', name: 'Jumping jacks', category: 'Cardio', defaultMode: 'time' },
  { id: 'mountain-climber', name: 'Mountain climbers', category: 'Cardio', defaultMode: 'time' },
  { id: 'high-knees', name: 'High knees', category: 'Cardio', defaultMode: 'time' },
  { id: 'jump-rope', name: 'Jump rope', category: 'Cardio', defaultMode: 'time' },

  { id: 'cat-cow', name: 'Cat-cow', category: 'Mobility', defaultMode: 'time' },
  { id: 'hip-flexor-stretch', name: 'Hip flexor stretch', category: 'Mobility', defaultMode: 'time' },
  { id: 'worlds-greatest-stretch', name: "World's greatest stretch", category: 'Mobility', defaultMode: 'reps' },
];
