import { useScreenAwake } from '../../lib/keepAwake';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, H2, Screen, useTheme } from '../../components/ui';
import { FinishScreen, type PersonalBest } from '../../components/FinishScreen';
import { ExercisesLeft, SetProgressBar } from '../../components/WorkoutProgress';
import { confirm } from '../../lib/confirm';
import { formatDuration, uid } from '../../lib/id';
import { buildSteps, type Step } from '../../lib/plan';
import { useStore } from '../../lib/store';
import { setVolume } from '../../lib/stats';
import type { CompletedSession, LoggedSet, WorkoutItem } from '../../lib/types';
import { say, setVoiceEnabled, stopVoice } from '../../lib/voice';

/* ---------- spoken cues ---------- */

function workPhrase(item: WorkoutItem) {
  const load = item.weightKg > 0 ? ` at ${item.weightKg} kilos` : '';
  return item.mode === 'reps' ? `${item.reps} ${item.exerciseName}${load}` : `${item.exerciseName}, ${item.durationSec} seconds${load}`;
}

function announce(step: Step): string {
  switch (step.kind) {
    case 'prep':
      return `Get ready. First up: ${workPhrase(step.next)}.`;
    case 'work':
      return step.item.sets > 1
        ? `Set ${step.setNumber} of ${step.item.sets}. ${workPhrase(step.item)}. Go!`
        : `${workPhrase(step.item)}. Go!`;
    case 'rest':
      if (step.active) return `${step.active.exerciseName}, ${step.durationSec} seconds. Keep moving!`;
      return step.betweenExercises
        ? `Rest ${step.durationSec} seconds. Next: ${step.next.exerciseName}.`
        : `Rest ${step.durationSec} seconds.`;
  }
}

/* ---------- screen ---------- */

export default function Player() {
  useScreenAwake();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { workouts, settings, logSession, ready, schedule, plans, history } = useStore();
  const workout = workouts.find((w) => w.id === id);
  const t = useTheme();
  const insets = useSafeAreaInsets();

  const steps = useMemo(() => (workout ? buildSteps(workout, settings.prepSec) : []), [workout, settings.prepSec]);
  const totalSets = useMemo(() => steps.filter((s) => s.kind === 'work').length, [steps]);

  const [index, setIndex] = useState(0);
  const [stepStart, setStepStart] = useState(() => Date.now());
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [extraSec, setExtraSec] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [finished, setFinished] = useState(false);
  const [voiceOn, setVoiceOn] = useState(settings.voiceEnabled);

  const startedAt = useRef(Date.now());
  const finishedAt = useRef(Date.now());
  const [personalBests, setPersonalBests] = useState<PersonalBest[]>([]);
  const stats = useRef({ workSec: 0, restSec: 0 });
  const lastSpokenSecond = useRef<number | null>(null);
  /** Sets the user finished, keyed by step index so redoing a set replaces it. */
  const logged = useRef(new Map<number, LoggedSet>());
  /** What the user entered for the current set. */
  const [entry, setEntry] = useState({ reps: 0, weightKg: 0 });

  const step: Step | undefined = steps[index];
  const elapsed = ((pausedAt ?? now) - stepStart) / 1000;
  const duration = step && step.kind !== 'work' ? step.durationSec + extraSec : step?.durationSec;
  const remaining = duration !== undefined ? Math.max(0, duration - elapsed) : undefined;

  useEffect(() => {
    setVoiceEnabled(voiceOn);
  }, [voiceOn]);

  useEffect(() => () => stopVoice(), []);

  // Clock.
  useEffect(() => {
    if (finished || pausedAt !== null) return;
    const h = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(h);
  }, [finished, pausedAt]);

  // Announce each new step.
  useEffect(() => {
    if (step && !finished) say(announce(step));
    lastSpokenSecond.current = null;
  }, [index, finished]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefill weight/reps for each new set: what was entered for this set before (after Back),
  // else the previous set of the same exercise in this session, else the workout's targets.
  useEffect(() => {
    if (!step || step.kind !== 'work') return;
    const again = logged.current.get(index);
    if (again) {
      setEntry({ reps: again.reps, weightKg: again.weightKg });
      return;
    }
    let prev: LoggedSet | undefined;
    for (const [k, set] of logged.current) {
      const s = steps[k];
      if (k < index && s?.kind === 'work' && s.itemIndex === step.itemIndex) prev = set;
    }
    setEntry({ reps: prev?.reps ?? step.item.reps, weightKg: prev?.weightKg ?? step.item.weightKg });
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  const recordStep = useCallback(
    (completed: boolean) => {
      if (!step) return;
      const spent = Math.max(0, elapsed);
      if (step.kind === 'work') {
        stats.current.workSec += spent;
        if (completed) {
          logged.current.set(index, {
            exerciseId: step.item.exerciseId,
            exerciseName: step.item.exerciseName,
            setNumber: step.setNumber,
            mode: step.item.mode,
            reps: step.item.mode === 'reps' ? entry.reps : 0,
            weightKg: entry.weightKg,
            durationSec: step.item.mode === 'time' ? Math.round(Math.min(spent, step.durationSec ?? spent)) : Math.round(spent),
            at: Date.now(),
          });
        }
      } else if (step.kind === 'rest') {
        stats.current.restSec += spent;
      }
    },
    [step, elapsed, index, entry],
  );

  const saveSession = useCallback((endedEarly = false) => {
    if (!workout) return;
    const sets = [...logged.current.entries()].sort((a, b) => a[0] - b[0]).map(([, s]) => s);
    logSession({
      id: uid(),
      workoutId: workout.id,
      workoutName: workout.name,
      startedAt: startedAt.current,
      finishedAt: Date.now(),
      workSec: Math.round(stats.current.workSec),
      restSec: Math.round(stats.current.restSec),
      completedSets: sets.length,
      totalSets,
      sets,
      planId: schedule && plans.find((p) => p.id === schedule.planId)?.workoutIds.includes(workout.id) ? schedule.planId : undefined,
      endedEarly,
    });
  }, [workout, logSession, totalSets, schedule, plans]);

  const finish = useCallback(() => {
    finishedAt.current = Date.now();
    // Personal bests are judged against history from before this session is saved.
    const pbs = findPersonalBests([...logged.current.values()], history);
    setPersonalBests(pbs);
    setFinished(true);
    say(pbs.length ? `Workout complete. New personal best on ${pbs[0].exerciseName}! Great job!` : 'Workout complete. Great job!');
    saveSession();
  }, [saveSession, history]);

  const goTo = useCallback(
    (next: number, completed: boolean) => {
      recordStep(completed);
      if (next >= steps.length) {
        finish();
        return;
      }
      const ts = Date.now();
      setIndex(Math.max(0, next));
      setStepStart(ts);
      setNow(ts);
      setExtraSec(0);
      setPausedAt((p) => (p !== null ? ts : null));
    },
    [recordStep, steps.length, finish],
  );

  // Auto-advance timed steps and speak the countdown.
  useEffect(() => {
    if (finished || pausedAt !== null || remaining === undefined || !step) return;
    const whole = Math.ceil(remaining);
    if (remaining <= 0) {
      goTo(index + 1, true);
      return;
    }
    if (lastSpokenSecond.current === whole) return;
    if (settings.countdownBeeps && whole <= 3) {
      lastSpokenSecond.current = whole;
      say(String(whole));
    } else if (step.kind === 'rest' && whole === 10 && (duration ?? 0) > 15) {
      lastSpokenSecond.current = whole;
      say('10 seconds');
    } else if (step.kind === 'work' && whole === Math.ceil((duration ?? 0) / 2) && (duration ?? 0) >= 30) {
      lastSpokenSecond.current = whole;
      say('Halfway');
    }
  }, [remaining, finished, pausedAt, step, index, goTo, settings.countdownBeeps, duration]);

  const togglePause = () => {
    if (pausedAt === null) {
      setPausedAt(Date.now());
      stopVoice();
    } else {
      const ts = Date.now();
      setStepStart((s) => s + (ts - pausedAt));
      setPausedAt(null);
      setNow(ts);
    }
  };

  const quit = async () => {
    const n = logged.current.size;
    const message = n
      ? `The ${n} set${n === 1 ? '' : 's'} you logged will be saved to your history.`
      : 'No sets were logged, so nothing will be saved.';
    if (finished || (await confirm('End workout?', message, 'End'))) {
      stopVoice();
      if (!finished && n) saveSession(true);
      if (router.canGoBack()) router.back();
      else router.replace('/');
    }
  };

  if (!ready) return <Screen />;
  if (!workout || steps.length === 0) {
    return (
      <Screen style={{ padding: 24, paddingTop: insets.top + 24, gap: 12 }}>
        <H2>This workout has no exercises.</H2>
        <Button title="Back" onPress={() => router.back()} />
      </Screen>
    );
  }

  if (finished) {
    return (
      <FinishScreen
        workoutName={workout.name}
        totalSec={(finishedAt.current - startedAt.current) / 1000}
        workSec={stats.current.workSec}
        restSec={stats.current.restSec}
        setsDone={logged.current.size}
        totalSets={totalSets}
        volumeKg={[...logged.current.values()].reduce((n, s) => n + setVolume(s), 0)}
        personalBests={personalBests}
        onDone={() => router.dismissTo('/')}
      />
    );
  }

  // Active rest (cardio between sets) gets the "get ready" purple so it reads as work, not a break.
  const color = step.kind === 'work' ? t.work : step.kind === 'rest' ? (step.active ? t.prep : t.rest) : t.prep;
  const stepFraction = duration ? Math.min(1, elapsed / duration) : 0;

  return (
    <Screen style={{ backgroundColor: color }}>
      <View style={{ flex: 1, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16, paddingHorizontal: 20, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
        {/* top bar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={quit} accessibilityRole="button" accessibilityLabel="End workout" hitSlop={12}>
            <Text style={pill}>✕ End</Text>
          </Pressable>
          <Text style={{ color: '#fff', fontWeight: '700', opacity: 0.9 }} numberOfLines={1}>
            {workout.name}
          </Text>
          <Pressable onPress={() => setVoiceOn((v) => !v)} accessibilityRole="switch" accessibilityState={{ checked: voiceOn }} accessibilityLabel="Voice commands" hitSlop={12}>
            <Text style={pill}>{voiceOn ? '🔊 Voice' : '🔇 Muted'}</Text>
          </Pressable>
        </View>
        <SetProgressBar steps={steps} index={index} fraction={stepFraction} />

        {/* main */}
        <View style={{ flexGrow: 1, flexShrink: 0, justifyContent: 'center', alignItems: 'center', gap: 10, paddingVertical: 12 }}>
          <Text style={big.label}>
            {step.kind === 'work' ? 'WORK' : step.kind === 'rest' ? (step.active ? 'ACTIVE REST' : 'REST') : 'GET READY'}
          </Text>
          {step.kind === 'work' ? (
            <>
              <Text style={big.title} accessibilityRole="header">{step.item.exerciseName}</Text>
              <Text style={big.sub}>
                Set {step.setNumber} of {step.item.sets}
              </Text>
              {step.item.mode === 'reps' ? (
                <Text style={big.sub}>Target {step.item.reps} reps · {formatDuration(elapsed)}</Text>
              ) : (
                <Text style={big.timer} accessibilityLiveRegion="polite">{formatDuration(Math.ceil(remaining ?? 0))}</Text>
              )}
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
                <SetInput
                  label="Weight"
                  unit="kg"
                  value={entry.weightKg}
                  step={2.5}
                  max={1000}
                  onChange={(weightKg) => setEntry((e) => ({ ...e, weightKg }))}
                />
                {step.item.mode === 'reps' ? (
                  <SetInput label="Reps" value={entry.reps} step={1} max={1000} onChange={(reps) => setEntry((e) => ({ ...e, reps }))} />
                ) : null}
              </View>
            </>
          ) : (
            <>
              {step.kind === 'rest' && step.active ? (
                <Text style={big.title} accessibilityRole="header">{step.active.exerciseName}</Text>
              ) : null}
              <Text style={big.timer} accessibilityLiveRegion="polite">{formatDuration(Math.ceil(remaining ?? 0))}</Text>
              <Text style={big.sub}>
                {step.kind === 'rest' && step.active ? 'Then: ' : 'Next: '}
                {step.next.exerciseName}
                {step.kind === 'rest' && step.next.sets > 1 ? ` · set ${step.nextSetNumber} of ${step.next.sets}` : ''}
              </Text>
              {step.kind === 'rest' ? (
                <Pressable onPress={() => setExtraSec((x) => x + 15)} accessibilityRole="button" hitSlop={8}>
                  <Text style={[pill, { marginTop: 8 }]}>+15s rest</Text>
                </Pressable>
              ) : null}
            </>
          )}
          {pausedAt !== null ? <Text style={[big.sub, { fontWeight: '800' }]}>PAUSED</Text> : null}
        </View>

        {/* exercises left */}
        <ExercisesLeft steps={steps} index={index} />

        {/* controls */}
        <View style={{ gap: 10 }}>
          {step.kind === 'work' && step.item.mode === 'reps' ? (
            <Pressable onPress={() => goTo(index + 1, true)} accessibilityRole="button" style={primaryBtn}>
              <Text style={{ color: color, fontSize: 20, fontWeight: '800' }}>✓ Set done</Text>
            </Pressable>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <CtrlButton label="⏮ Back" onPress={() => goTo(index - 1, false)} disabled={index === 0} />
            <CtrlButton label={pausedAt === null ? '❚❚ Pause' : '▶ Resume'} onPress={togglePause} />
            <CtrlButton label="Skip ⏭" onPress={() => goTo(index + 1, false)} />
          </View>
        </View>
      </View>
    </Screen>
  );
}

/** Exercises where this session's heaviest set beats every earlier logged set. */
function findPersonalBests(sets: LoggedSet[], history: CompletedSession[]): PersonalBest[] {
  const top = new Map<string, LoggedSet>();
  for (const s of sets) {
    if (s.weightKg > 0 && s.weightKg > (top.get(s.exerciseId)?.weightKg ?? 0)) top.set(s.exerciseId, s);
  }
  const result: PersonalBest[] = [];
  for (const [exerciseId, s] of top) {
    let previous = 0;
    for (const session of history) {
      for (const p of session.sets ?? []) if (p.exerciseId === exerciseId) previous = Math.max(previous, p.weightKg);
    }
    // Only a real improvement counts; a first-ever session has nothing to beat.
    if (previous > 0 && s.weightKg > previous) result.push({ exerciseName: s.exerciseName, weightKg: s.weightKg, previousKg: previous });
  }
  return result;
}

/** Big − value + control for logging a set, styled for the coloured player background. */
function SetInput({
  label,
  unit,
  value,
  step,
  max,
  onChange,
}: {
  label: string;
  unit?: string;
  value: number;
  step: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const set = (n: number) => onChange(Math.round(Math.min(max, Math.max(0, n)) * 100) / 100);
  const btn = { width: 44, height: 52, alignItems: 'center' as const, justifyContent: 'center' as const };
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <Text style={{ color: '#fff', opacity: 0.85, fontWeight: '800', fontSize: 12, letterSpacing: 1 }}>{label.toUpperCase()}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 14 }}>
        <Pressable onPress={() => set(value - step)} style={btn} accessibilityRole="button" accessibilityLabel={`Decrease ${label}`}>
          <Text style={{ color: '#fff', fontSize: 26, fontWeight: '700' }}>−</Text>
        </Pressable>
        <Text
          style={{ color: '#fff', fontSize: 30, fontWeight: '800', minWidth: 64, textAlign: 'center', fontVariant: ['tabular-nums'] }}
          accessibilityLabel={`${label} ${value}${unit ? ' ' + unit : ''}`}
        >
          {value}
          {unit ? <Text style={{ fontSize: 15, fontWeight: '700' }}> {unit}</Text> : null}
        </Text>
        <Pressable onPress={() => set(value + step)} style={btn} accessibilityRole="button" accessibilityLabel={`Increase ${label}`}>
          <Text style={{ color: '#fff', fontSize: 26, fontWeight: '700' }}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function CtrlButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flex: 1,
        paddingVertical: 16,
        borderRadius: 14,
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.2)',
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

const pill = {
  color: '#fff',
  fontWeight: '700' as const,
  backgroundColor: 'rgba(255,255,255,0.2)',
  paddingHorizontal: 12,
  paddingVertical: 6,
  borderRadius: 999,
  overflow: 'hidden' as const,
};

const primaryBtn = {
  backgroundColor: '#fff',
  paddingVertical: 20,
  borderRadius: 16,
  alignItems: 'center' as const,
};

const big = {
  label: { color: '#fff', opacity: 0.85, fontWeight: '800' as const, letterSpacing: 2, fontSize: 14 },
  title: { color: '#fff', fontWeight: '800' as const, fontSize: 34, textAlign: 'center' as const },
  sub: { color: '#fff', opacity: 0.9, fontSize: 18, textAlign: 'center' as const },
  timer: { color: '#fff', fontWeight: '800' as const, fontSize: 96, fontVariant: ['tabular-nums' as const], letterSpacing: -2 },
};
