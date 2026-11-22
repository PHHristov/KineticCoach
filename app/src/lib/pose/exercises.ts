import type { IssueInfo, PoseAnalyzer, RepBase, View } from './analyzer';
import { CURL_CHECKS_BY_VIEW, CURL_ISSUES, CurlAnalyzer, curlRepSpeech, type CurlRep } from './curlAnalyzer';
import { CURL_GUIDE, SQUAT_GUIDE, type Guide } from './guide';
import { L, type Point, type Point3 } from './landmarks';
import { curlDemoFrame, demoFrame } from './simulate';
import { CHECKS_BY_VIEW, ISSUES, repSpeech, SquatAnalyzer, type RepResult } from './squatAnalyzer';

/** Everything the form-check screen needs to know about one exercise. */
export type FormExercise = {
  id: 'squat' | 'bicep-curl';
  name: string;
  /** Library exercise ids this check applies to (for links from workouts). */
  exerciseIds: string[];
  create: () => PoseAnalyzer<RepBase>;
  issues: Record<string, IssueInfo>;
  checksByView: Record<View, string[]>;
  repSpeech: (rep: RepBase) => string;
  readyText: string;
  partialText: string;
  setupTips: string[];
  gauge: { label: string; target: string };
  /** Arrow + verb for each phase in rep cards. */
  eccentricLabel: string;
  concentricLabel: string;
  tempoTarget: string;
  /** Word for a good (quick) lift: squats should be explosive, curls a steady strong pace. */
  goodLiftLabel: string;
  demoFrame: (t: number) => { image: Point[]; world: Point3[] };
  /** Technique demo and targets. */
  guide: Guide;
  /** Landmark whose angle the guide highlights. */
  guideJoint: number;
};

export const FORM_EXERCISES: FormExercise[] = [
  {
    id: 'squat',
    name: 'Squat',
    exerciseIds: ['squat', 'jump-squat'],
    create: () => new SquatAnalyzer(),
    issues: ISSUES,
    checksByView: CHECKS_BY_VIEW,
    repSpeech: (r) => repSpeech(r as RepResult),
    readyText: 'Ready. Start squatting.',
    partialText: 'Go lower to count the rep',
    setupTips: [
      'Put the camera at hip height, 2–3 m away, so your whole body from feet to head is in view.',
      'Side-on checks depth, back angle and heels. Facing the camera checks your knees and balance.',
    ],
    gauge: { label: 'DEPTH', target: 'PARALLEL' },
    eccentricLabel: '↓',
    concentricLabel: '↑',
    tempoTarget: '2+ s down, about 1 s up',
    goodLiftLabel: 'explosive',
    demoFrame,
    guide: SQUAT_GUIDE,
    guideJoint: L.leftKnee,
  },
  {
    id: 'bicep-curl',
    name: 'Bicep curl',
    exerciseIds: ['bicep-curl', 'hammer-curl'],
    create: () => new CurlAnalyzer(),
    issues: CURL_ISSUES,
    checksByView: CURL_CHECKS_BY_VIEW,
    repSpeech: (r) => curlRepSpeech(r as CurlRep),
    readyText: 'Ready. Start curling.',
    partialText: 'Curl higher to count the rep',
    setupTips: [
      'Put the camera at chest height, 2–3 m away, so your head, arms and hips are in view.',
      'Side-on checks elbow position and body swing. Facing the camera checks elbow flare and shrugging, and counts each arm.',
    ],
    gauge: { label: 'CURL', target: 'TOP' },
    // In a curl you lift first (up), then lower (down).
    eccentricLabel: '↓',
    concentricLabel: '↑',
    tempoTarget: 'about 1 s up, 2+ s down',
    goodLiftLabel: 'good pace',
    demoFrame: curlDemoFrame,
    guide: CURL_GUIDE,
    guideJoint: L.leftElbow,
  },
];

export function formExercise(id: string | undefined): FormExercise {
  return FORM_EXERCISES.find((e) => e.id === id) ?? FORM_EXERCISES[0];
}

/** The form check for a library exercise, if there is one. */
export function formExerciseFor(exerciseId: string): FormExercise | undefined {
  return FORM_EXERCISES.find((e) => e.exerciseIds.includes(exerciseId));
}
