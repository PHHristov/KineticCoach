import { useScreenAwake } from '../../lib/keepAwake';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Button, Card, H1, H2, Screen, useTheme } from '../../components/ui';
import { ExercisesLeft, SetProgressBar } from '../../components/WorkoutProgress';
import { confirm } from '../../lib/confirm';
import { formatDuration, uid } from '../../lib/id';
import { buildSteps, type Step } from '../../lib/plan';
import { useStore } from '../../lib/store';
import type { WorkoutItem } from '../../lib/types';
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
      return step.betweenExercises
        ? `Rest ${step.durationSec} seconds. Next: ${step.next.exerciseName}.`
        : `Rest ${step.durationSec} seconds.`;
  }
}

/* ---------- screen ---------- */

export default function Player() {
  useScreenAwake();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { workouts, settings, logSession, ready } = useStore();
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
  const stats = useRef({ workSec: 0, restSec: 0, completedSets: 0 });
  const lastSpokenSecond = useRef<number | null>(null);

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

  const recordStep = useCallback(
    (completed: boolean) => {
      if (!step) return;
      const spent = Math.max(0, elapsed);
      if (step.kind === 'work') {
        stats.current.workSec += spent;
        if (completed) stats.current.completedSets += 1;
      } else if (step.kind === 'rest') {
        stats.current.restSec += spent;
      }
    },
    [step, elapsed],
  );

  const finish = useCallback(() => {
    setFinished(true);
    say('Workout complete. Great job!');
    if (workout) {
      logSession({
        id: uid(),
        workoutId: workout.id,
        workoutName: workout.name,
        startedAt: startedAt.current,
        finishedAt: Date.now(),
        workSec: Math.round(stats.current.workSec),
        restSec: Math.round(stats.current.restSec),
        completedSets: stats.current.completedSets,
        totalSets,
      });
    }
  }, [workout, logSession, totalSets]);

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
    if (finished || (await confirm('End workout?', 'Your progress in this session will not be saved.', 'End'))) {
      stopVoice();
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
    const total = (Date.now() - startedAt.current) / 1000;
    return (
      <Screen style={{ padding: 24, paddingTop: insets.top + 32, gap: 16, alignItems: 'center' }}>
        <View style={{ maxWidth: 520, width: '100%', gap: 16 }}>
          <Text style={{ fontSize: 56, textAlign: 'center' }}>🏁</Text>
          <H1>Workout complete</H1>
          <Body muted>{workout.name}</Body>
          <Card>
            <Row label="Total time" value={formatDuration(total)} />
            <Row label="Active time" value={formatDuration(stats.current.workSec)} />
            <Row label="Rest time" value={formatDuration(stats.current.restSec)} />
            <Row label="Sets completed" value={`${stats.current.completedSets} / ${totalSets}`} />
          </Card>
          <Button big title="Done" onPress={() => router.replace({ pathname: '/workout/[id]', params: { id: workout.id } })} />
        </View>
      </Screen>
    );
  }

  const color = step.kind === 'work' ? t.work : step.kind === 'rest' ? t.rest : t.prep;
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
          <Text style={big.label}>{step.kind === 'work' ? 'WORK' : step.kind === 'rest' ? 'REST' : 'GET READY'}</Text>
          {step.kind === 'work' ? (
            <>
              <Text style={big.title} accessibilityRole="header">{step.item.exerciseName}</Text>
              <Text style={big.sub}>
                Set {step.setNumber} of {step.item.sets}
                {step.item.weightKg > 0 ? ` · ${step.item.weightKg} kg` : ''}
              </Text>
              {step.item.mode === 'reps' ? (
                <>
                  <Text style={big.timer}>{step.item.reps}</Text>
                  <Text style={big.sub}>reps · {formatDuration(elapsed)}</Text>
                </>
              ) : (
                <Text style={big.timer} accessibilityLiveRegion="polite">{formatDuration(Math.ceil(remaining ?? 0))}</Text>
              )}
            </>
          ) : (
            <>
              <Text style={big.timer} accessibilityLiveRegion="polite">{formatDuration(Math.ceil(remaining ?? 0))}</Text>
              <Text style={big.sub}>
                Next: {step.next.exerciseName}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Body muted>{label}</Body>
      <Body style={{ fontWeight: '700' }}>{value}</Body>
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
