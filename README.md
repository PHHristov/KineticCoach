# KineticCoach

A fitness app for creating, sharing and running workouts, with a timed player and voice coaching.
One codebase (Expo / React Native) runs in the **browser**, on **Android** and on **iOS**.

The product plan is in `UserStoryMap.drawio` (Users, Partners, Hardware tracks).
This first version covers the app side; sensor-driven coaching comes later.

## What works today

- **Exercise library**: 30+ built-in exercises with search and category filters, plus your own custom exercises.
- **Workout builder**: pick exercises, then set sets, reps or duration, weight, **rest between sets** and **rest after each exercise**. Reorder or remove exercises. Shows the estimated total time and rest time.
- **Navigation**: a bottom tab bar (Home, Workouts, Plans, Progress, Settings), plus a home icon in the header of every inner screen.
- **Home**: weight lifted this week and overall, a two-week calendar of upcoming workouts (scheduled, done, missed) and a short preview of the selected day's workout with a Start button.
- **Plans**: a plan is an ordered list of workouts, one per training day; a 4-workout plan is 4 days a week. When you start a plan you pick exactly that many weekdays, and the workouts are assigned to them in order. A 4-day Upper/Lower split is included.
- **Workout player**: get-ready countdown, then work and rest phases that move on by themselves. Timed sets count down; rep sets wait for **✓ Set done**. You can pause, go back, skip, or add 15 s to a rest. The screen stays on. A segmented progress bar shows the exact set you're on and which exercises are left.
- **Set logging**: enter the weight and reps you actually did for every set. The next set starts with the same values. If you end a workout early, the sets you logged are kept, but the day isn't ticked off.
- **Progress**: every exercise you've done, with a trend badge. Each exercise has a chart and a comparison with about three weeks earlier ("3 weeks ago you did 100 kg, now 110 kg (+10 %). Good progress!"), plus best weight, estimated 1-rep max and total lifted.
- **Squat form check (browser, beta)**: live pose tracking with MediaPipe Pose Landmarker (lite model, on-device, GPU). Counts reps and measures range of motion and depth (deep / parallel / half / shallow). It checks form for knees caving in, leaning too far forward, heels lifting and shifting sideways, and times each rep (target: slow lowering of about 2 s or more, explosive rise of about 1 s or less). Problems are shown and spoken the moment they're detected, within about 0.15–0.2 s. Side-on and front-on views are detected automatically, and only the checks that view can judge reliably are run. `/form-check?demo=1` plays simulated squats without a camera.
- **Voice commands** (can be turned off): announces each set ("Set 2 of 3. 10 Squat. Go!"), each rest and what comes next, "Halfway" on long sets, "10 seconds" on long rests and a 3-2-1 countdown.
- **Sharing**: workouts and whole plans become a link (`/import?code=…`); opening it shows a preview and a button to save it. No server needed. On phones the system share sheet is used.
- Data is stored on the device (AsyncStorage).

## Run it

Requires Node.js (installed with `brew install node`).

```bash
cd app
npm install
npm run web        # browser at http://localhost:8081
npm run ios        # needs Xcode + iOS simulator, or scan the QR code with Expo Go
npm run android    # needs Android Studio emulator, or Expo Go on a phone
```

For app-store builds use EAS: `npx eas-cli@latest build -p ios|android`.

## Code layout (`app/src`)

| Path | Purpose |
| --- | --- |
| `app/(tabs)/` | Tab screens: Home (`index`), Workouts, Plans, Progress, Settings |
| `app/` | Other screens (Expo Router): `workout/[id]`, `edit/[id]`, `play/[id]`, `plan/[id]`, `plan-edit/[id]`, `exercise/[id]`, exercises, import |
| `lib/types.ts` | Data model: Exercise, Workout, Plan, Schedule, LoggedSet, CompletedSession, Settings |
| `lib/plan.ts` | Turns a workout into the ordered list of work, rest and prep steps the player walks through |
| `lib/calendar.ts` | Which workout falls on which day, based on the plan and chosen weekdays |
| `lib/stats.ts` | Volume lifted, per-exercise history, and the three-week progression comparison |
| `lib/pose/` | Squat analyzer (platform-independent), landmark geometry, squat simulator for tests and demo |
| `components/pose/` | `PoseCamera.web.tsx` (camera + MediaPipe + skeleton overlay); `PoseCamera.tsx` native placeholder |
| `scripts/test-squat.ts` | Analyzer tests on simulated squats: `npm run test:pose` |
| `lib/voice.ts` | Text-to-speech wrapper; future sensor cues will go through it too |
| `lib/share.ts` | Encodes and decodes workouts and plans in share links |
| `lib/store.tsx` | State and on-device storage |
| `components/` | UI kit, exercise library or picker, progress bar, progress chart |

## Next steps (from the story map)

- Accounts plus a backend, so workouts can be shared publicly and synced across devices
- Form check in the iOS/Android apps: a native camera with MediaPipe pose (needs a development build), feeding the same `SquatAnalyzer`
- Form check during a workout's squat sets, saving each rep's form data to the session
- Analyzers for more exercises (push-up, lunge, deadlift)
- Partner flow: video explanations and recorded audio cues per exercise
- Hardware: connect sensors, rep counting and movement evaluation driving the voice coach
