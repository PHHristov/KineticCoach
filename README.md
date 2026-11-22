# KineticCoach

A fitness app for creating, sharing and running workouts, with a timed player and voice coaching.
One codebase (Expo / React Native) runs in the **browser**, on **Android** and on **iOS**.

The product plan is in `UserStoryMap.drawio` (Users, Partners, Hardware tracks).
This first version covers the app side; sensor-driven coaching comes later.

## What works today

- **Exercise library**: 30+ built-in exercises with search and category filters, plus your own custom exercises.
- **Workout builder**: pick exercises, then set sets, reps or duration, weight, **rest between sets** and **rest after each exercise**. Reorder or remove exercises. Shows the estimated total time and rest time.
- **Workout player**: get-ready countdown, then work and rest phases that move on by themselves. Timed sets count down; rep sets wait for **✓ Set done**. You can pause, go back, skip, or add 15 s to a rest. The screen stays on.
- **Voice commands** (can be turned off): announces each set ("Set 2 of 3. 10 Squat. Go!"), each rest and what comes next, "Halfway" on long sets, "10 seconds" on long rests and a 3-2-1 countdown.
- **Sharing**: a workout becomes a link (`/import?code=…`); opening it shows a preview and a button to save it. No server needed. On phones the system share sheet is used.
- **Session summary**: total, active and rest time, and sets completed. Every session is also saved to history.
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
| `app/` | Screens (Expo Router): home, exercises, settings, import, `workout/[id]`, `edit/[id]`, `play/[id]` |
| `lib/types.ts` | Data model: Exercise, Workout, WorkoutItem, Settings, CompletedSession |
| `lib/plan.ts` | Turns a workout into the ordered list of work, rest and prep steps the player walks through |
| `lib/voice.ts` | Text-to-speech wrapper; future sensor cues will go through it too |
| `lib/share.ts` | Encodes and decodes workouts in share links |
| `lib/store.tsx` | State and on-device storage |
| `components/` | UI kit and the exercise library or picker |

## Next steps (from the story map)

- Accounts plus a backend, so workouts can be shared publicly and synced across devices
- Workout history and progress charts
- Partner flow: video explanations and recorded audio cues per exercise
- Hardware: connect sensors, rep counting and movement evaluation driving the voice coach
