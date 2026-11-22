import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ExerciseGuide } from '../components/pose/ExerciseGuide';
import PoseCamera from '../components/pose/PoseCamera';
import type { CameraStatus } from '../components/pose/types';
import type { LiveState, RepBase, Tempo, View as CamView } from '../lib/pose/analyzer';
import { FORM_EXERCISES, formExercise, type FormExercise } from '../lib/pose/exercises';
import type { PoseFrame } from '../lib/pose/landmarks';
import { useScreenAwake } from '../lib/keepAwake';
import { uid } from '../lib/id';
import { useStore } from '../lib/store';
import { say, setVoiceEnabled, stopVoice } from '../lib/voice';

const GREEN = '#22C55E';
const RED = '#EF4444';
const AMBER = '#F59E0B';
const PANEL = 'rgba(0,0,0,0.62)';

const VIEW_LABEL: Record<CamView, string> = { side: 'Side view', front: 'Front view', angled: 'Angled view' };

export default function FormCheckScreen() {
  useScreenAwake();
  const insets = useSafeAreaInsets();
  const { settings, saveFormCheck } = useStore();
  const params = useLocalSearchParams<{ demo?: string; exercise?: string; guide?: string }>();
  const demoMode = params.demo === '1';
  const [exerciseId, setExerciseId] = useState(formExercise(params.exercise).id);
  const ex = formExercise(exerciseId);
  const analyzer = useMemo(() => ex.create(), [ex]);

  const [status, setStatus] = useState<CameraStatus>({ kind: 'starting', message: 'Starting…' });
  const [live, setLive] = useState<LiveState | null>(null);
  const [reps, setReps] = useState<RepBase[]>([]);
  const [banner, setBanner] = useState<{ text: string; good: boolean; at: number } | null>(null);
  const [voiceOn, setVoiceOn] = useState(settings.voiceEnabled);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [stats, setStats] = useState<{ fps: number; inferenceMs: number } | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [showGuide, setShowGuide] = useState(params.guide === '1');
  const lastUi = useRef(0);

  // A link opened while this screen is already showing (e.g. from a workout) can switch exercise or open the guide.
  useEffect(() => {
    if (params.exercise) setExerciseId(formExercise(params.exercise).id);
  }, [params.exercise]);
  useEffect(() => {
    if (params.guide === '1') setShowGuide(true);
  }, [params.guide]);

  useEffect(() => setVoiceEnabled(voiceOn), [voiceOn]);
  useEffect(() => () => stopVoice(), []);

  // Switching exercise starts a fresh set.
  useEffect(() => {
    setReps([]);
    setLive(null);
    setBanner(null);
  }, [analyzer]);

  // Banner fades after a moment.
  useEffect(() => {
    if (!banner) return;
    const h = setTimeout(() => setBanner((b) => (b && b.at === banner.at ? null : b)), banner.good ? 1600 : 2200);
    return () => clearTimeout(h);
  }, [banner]);

  const onFrame = useCallback(
    (f: PoseFrame) => {
      const { state, events } = analyzer.update(f);
      for (const e of events) {
        if (e.type === 'ready') {
          say(ex.readyText);
          setBanner({ text: 'Ready — go!', good: true, at: f.t });
        } else if (e.type === 'cue') {
          // Fastest feedback: show and say the cue the moment the problem is detected.
          const info = ex.issues[e.issue];
          say(info.cue);
          setBanner({ text: info.cue, good: false, at: f.t });
        } else if (e.type === 'partial') {
          say(ex.partialText);
          setBanner({ text: ex.partialText, good: false, at: f.t });
        } else if (e.type === 'rep') {
          setReps((r) => [...r, e.rep]);
          if (e.newCount === false) {
            // Second arm of a pair: the counter didn't move, so only speak up about problems.
            const main = e.rep.issues[0];
            if (main) say(`${e.rep.side === 'right' ? 'Right' : 'Left'} arm: ${ex.issues[main].cue}`);
          } else {
            say(ex.repSpeech(e.rep));
            if (!e.rep.issues.length) setBanner({ text: `Rep ${e.rep.n} — great!`, good: true, at: f.t });
          }
        }
      }
      // Throttle React updates to ~20 per second; the skeleton itself is drawn every frame.
      if (events.length || f.t - lastUi.current > 50) {
        lastUi.current = f.t;
        setLive(state);
      }
      return state.badJoints;
    },
    [analyzer, ex],
  );

  // Results are saved to the active profile once per set (Finish, or leaving with reps done).
  const startedAt = useRef(Date.now());
  const saved = useRef(false);
  const saveResults = () => {
    if (saved.current || demoMode || !reps.length) return;
    saved.current = true;
    saveFormCheck({
      id: uid(),
      exercise: ex.id,
      startedAt: startedAt.current,
      finishedAt: Date.now(),
      count: live?.reps ?? reps.length,
      reps: reps.map((r) => ({
        n: r.n,
        side: r.side,
        view: r.view,
        score: r.score,
        rangeLabel: r.range.label,
        rangeGood: r.range.good,
        romDeg: r.romDeg,
        eccentricSec: r.eccentricSec,
        concentricSec: r.concentricSec,
        eccentric: r.eccentric,
        concentric: r.concentric,
        issues: r.issues,
        detail: r.detail,
      })),
    });
  };
  const finish = () => {
    saveResults();
    setShowSummary(true);
  };
  const close = () => {
    saveResults();
    router.back();
  };

  const reset = () => {
    analyzer.reset();
    setReps([]);
    setLive(null);
    setShowSummary(false);
    saved.current = false;
    startedAt.current = Date.now();
  };

  // Switching exercise mid-way saves what was done so far before starting fresh.
  const switchExercise = (id: FormExercise['id']) => {
    if (id === ex.id) return;
    saveResults();
    saved.current = false;
    startedAt.current = Date.now();
    setExerciseId(id);
  };

  const phase = live?.phase ?? 'get-ready';
  const view = live?.view ?? 'angled';
  // The analyzers only produce a joint reading once they have seen the body.
  const bodyInView = phase !== 'not-visible' && live?.metric !== undefined;
  const lastRep = reps[reps.length - 1];

  // The form check screens are dark: keep the clock and battery readable.
  const statusBar = <StatusBar style="light" />;

  if (showGuide)
    return <>{statusBar}<ExerciseGuide name={ex.name} guide={ex.guide} joint={ex.guideJoint} voice={voiceOn} onClose={() => setShowGuide(false)} /></>;

  if (showSummary)
    return <>{statusBar}<Summary ex={ex} reps={reps} count={live?.reps ?? reps.length} perSide={live?.perSide} onGuide={() => setShowGuide(true)} onAgain={reset} onClose={close} insets={insets} /></>;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {statusBar}
      <PoseCamera
        key={ex.id}
        onFrame={onFrame}
        onStatus={setStatus}
        onStats={setStats}
        facing={facing}
        demo={demoMode ? ex.demoFrame : undefined}
      />

      {/* top bar */}
      <View style={{ position: 'absolute', top: insets.top + 10, left: 12, right: 12, gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Pill label="✕ Close" onPress={close} />
          <View style={{ flex: 1 }} />
          <Pill label="How?" onPress={() => setShowGuide(true)} a11y={`How to do a ${ex.name.toLowerCase()}`} />
          <Pill icon={voiceOn ? 'volume-high' : 'volume-mute'} onPress={() => setVoiceOn((v) => !v)} a11y={voiceOn ? 'Mute voice' : 'Unmute voice'} />
          {(Platform.OS === 'web' || Platform.OS === 'ios') && !demoMode && status.kind === 'running' ? (
            <Pill icon="camera-reverse-outline" onPress={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))} a11y="Switch camera" />
          ) : null}
          <Pill label="Finish" onPress={finish} strong />
        </View>
        <View style={{ flexDirection: 'row', alignSelf: 'center', backgroundColor: PANEL, borderRadius: 999, padding: 3 }} accessibilityRole="tablist">
          {FORM_EXERCISES.map((e) => {
            const on = e.id === ex.id;
            return (
              <Pressable
                key={e.id}
                onPress={() => switchExercise(e.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                aria-selected={on}
                style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: on ? '#fff' : 'transparent' }}
              >
                <Text style={{ color: on ? '#111' : '#fff', fontWeight: '800', fontSize: 13 }}>{e.name}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* rep counter + view */}
      {status.kind === 'running' ? (
        <View style={{ position: 'absolute', top: insets.top + 100, left: 12, gap: 6 }}>
          <View style={{ backgroundColor: PANEL, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 1 }}>REPS</Text>
            <Text style={{ color: '#fff', fontSize: 44, fontWeight: '900', fontVariant: ['tabular-nums'] }}>{live?.reps ?? 0}</Text>
          </View>
          {live?.perSide && bodyInView && view === 'front' ? <Chip text={`L ${live.perSide.left} · R ${live.perSide.right}`} /> : null}
          {bodyInView ? <Chip text={VIEW_LABEL[view]} /> : null}
          {bodyInView && live?.metric ? <Chip text={live.metric} /> : null}
          {stats ? <Chip text={`${stats.fps} fps · ${stats.inferenceMs} ms`} dim /> : null}
          {demoMode ? <Chip text="Demo: simulated reps" dim /> : null}
        </View>
      ) : null}

      {/* range gauge */}
      {status.kind === 'running' && bodyInView ? <Gauge ex={ex} progress={live?.progress ?? 0} top={insets.top + 100} /> : null}

      {/* instant cue banner */}
      {banner ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: '38%', left: 0, right: 0, alignItems: 'center' }}>
          <View style={{ backgroundColor: banner.good ? GREEN : RED, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 18, maxWidth: '86%' }}>
            <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900', textAlign: 'center' }} accessibilityLiveRegion="assertive">
              {banner.text}
            </Text>
          </View>
        </View>
      ) : null}

      {/* status / setup */}
      {status.kind !== 'running' || phase === 'get-ready' || phase === 'not-visible' ? (
        <SetupCard ex={ex} status={status} phase={phase} view={bodyInView ? view : null} onGuide={() => setShowGuide(true)} />
      ) : null}

      {/* last rep + live issues */}
      {status.kind === 'running' && lastRep && phase !== 'get-ready' && phase !== 'not-visible' ? (
        <View style={{ position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 12, alignItems: 'center' }}>
          <View style={{ width: '100%', maxWidth: 560 }}>
            <RepCard ex={ex} rep={lastRep} live={live?.inRep ? live.activeIssues : []} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Pill({
  label,
  icon,
  onPress,
  strong,
  a11y,
}: {
  label?: string;
  /** An icon instead of text (emoji don't render reliably in bold on every platform). */
  icon?: 'volume-high' | 'volume-mute' | 'camera-reverse-outline';
  onPress: () => void;
  strong?: boolean;
  a11y?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      style={{ backgroundColor: strong ? '#fff' : PANEL, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 }}
    >
      {icon ? (
        <Ionicons name={icon} size={18} color={strong ? '#111' : '#fff'} />
      ) : (
        <Text style={{ color: strong ? '#111' : '#fff', fontWeight: '800', fontSize: 14 }}>{label}</Text>
      )}
    </Pressable>
  );
}

function Chip({ text, dim }: { text: string; dim?: boolean }) {
  return (
    <View style={{ backgroundColor: PANEL, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' }}>
      <Text style={{ color: '#fff', opacity: dim ? 0.7 : 1, fontSize: 12, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

/** Vertical bar: fills as the movement goes; green once the target is reached. */
function Gauge({ ex, progress, top }: { ex: FormExercise; progress: number; top: number }) {
  const reached = progress >= 1;
  const h = 200;
  return (
    <View style={{ position: 'absolute', right: 14, top, alignItems: 'center', gap: 6 }} accessibilityLabel={`${ex.gauge.label} ${Math.round(progress * 100)} percent of target`}>
      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1, backgroundColor: PANEL, paddingHorizontal: 6, borderRadius: 6 }}>{ex.gauge.label}</Text>
      <View style={{ width: 26, height: h, borderRadius: 13, backgroundColor: PANEL, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)' }}>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${Math.min(1, progress / 1.2) * 100}%`, backgroundColor: reached ? GREEN : '#fff' }} />
        <View style={{ position: 'absolute', left: 0, right: 0, top: h / 1.2 - 2, height: 3, backgroundColor: GREEN }} />
      </View>
      <Text style={{ color: reached ? GREEN : '#fff', fontSize: 11, fontWeight: '800', backgroundColor: PANEL, paddingHorizontal: 6, borderRadius: 6 }}>
        {ex.gauge.target}
        {reached ? ' ✓' : ''}
      </Text>
    </View>
  );
}

function SetupCard({
  ex,
  status,
  phase,
  view,
  onGuide,
}: {
  ex: FormExercise;
  status: CameraStatus;
  phase: string;
  view: CamView | null;
  onGuide: () => void;
}) {
  const title =
    status.kind === 'error'
      ? 'Camera unavailable'
      : status.kind === 'starting'
        ? status.message
        : phase === 'not-visible'
          ? 'Step back into view'
          : ex.id === 'bicep-curl'
            ? 'Arms straight to begin'
            : 'Stand tall to begin';
  return (
    <View style={{ position: 'absolute', left: 12, right: 12, bottom: 24, alignItems: 'center' }}>
      <View style={{ backgroundColor: 'rgba(0,0,0,0.78)', borderRadius: 18, padding: 18, gap: 8, maxWidth: 560, width: '100%' }}>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900' }}>{title}</Text>
        <Pressable onPress={onGuide} accessibilityRole="button" style={{ alignSelf: 'flex-start', backgroundColor: GREEN, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}>
          <Text style={{ color: '#fff', fontWeight: '900' }}>▶ See how a perfect {ex.name.toLowerCase()} looks</Text>
        </Pressable>
        {status.kind === 'error' ? (
          <>
            <Text style={{ color: '#fff', opacity: 0.9, fontSize: 15, lineHeight: 21 }}>{status.message}</Text>
            {status.action === 'settings' ? (
              <Pressable
                onPress={() => Linking.openSettings()}
                accessibilityRole="button"
                style={{ alignSelf: 'flex-start', backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, marginTop: 4 }}
              >
                <Text style={{ color: '#111', fontWeight: '900' }}>Open Settings</Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <>
            {ex.setupTips.map((tip) => (
              <Tip key={tip} text={tip} />
            ))}
            <Tip text="Good light helps. Video stays on your device; nothing is uploaded." />
            {status.kind === 'running' && view ? (
              <Text style={{ color: GREEN, fontWeight: '700', marginTop: 4 }}>
                {VIEW_LABEL[view]} detected · checking: {ex.checksByView[view].map((i) => ex.issues[i].title.toLowerCase()).join(', ')}
              </Text>
            ) : null}
            <Text style={{ color: '#fff', opacity: 0.6, fontSize: 12, marginTop: 4 }}>
              Form tips are guidance, not medical advice. Stop if anything hurts.
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

function Tip({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Text style={{ color: GREEN, fontWeight: '900' }}>•</Text>
      <Text style={{ color: '#fff', opacity: 0.92, fontSize: 15, lineHeight: 21, flex: 1 }}>{text}</Text>
    </View>
  );
}

function tempoText(arrow: string, lowering: boolean, sec: number, t: Tempo, goodLift: string) {
  const label: Record<Tempo, string> = {
    controlled: 'controlled',
    ok: lowering ? 'a bit fast' : 'could be faster',
    fast: 'too fast',
    explosive: lowering ? 'fast' : goodLift,
    slow: 'too slow',
  };
  const good = t === 'controlled' || t === 'explosive';
  return { text: `${arrow} ${sec.toFixed(1)}s ${label[t]}`, color: good ? GREEN : t === 'ok' ? AMBER : RED };
}

function scoreColor(s: number) {
  return s >= 85 ? GREEN : s >= 65 ? AMBER : RED;
}

const SIDE_LABEL = { left: 'left arm', right: 'right arm', both: 'both arms' } as const;

function RepCard({ ex, rep, live }: { ex: FormExercise; rep: RepBase; live: string[] }) {
  const lower = tempoText(ex.eccentricLabel, true, rep.eccentricSec, rep.eccentric, ex.goodLiftLabel);
  const lift = tempoText(ex.concentricLabel, false, rep.concentricSec, rep.concentric, ex.goodLiftLabel);
  // Show tempo in the order the rep happens: squats go down first, curls go up first.
  const tempos = ex.id === 'bicep-curl' ? [lift, lower] : [lower, lift];
  return (
    <View style={{ backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 18, padding: 14, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 58, height: 58, borderRadius: 29, borderWidth: 4, borderColor: scoreColor(rep.score), alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900' }}>{rep.score}</Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>
            Rep {rep.n}
            {rep.side ? ` (${SIDE_LABEL[rep.side]})` : ''} · <Text style={{ color: rep.range.good ? GREEN : AMBER }}>{rep.range.label}</Text>
          </Text>
          <Text style={{ color: '#fff', opacity: 0.85, fontSize: 13 }}>
            Range {rep.romDeg}° · {rep.detail}
          </Text>
          <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
            {tempos.map((tp) => (
              <Text key={tp.text} style={{ color: tp.color, fontWeight: '800', fontSize: 14 }}>
                {tp.text}
              </Text>
            ))}
          </View>
        </View>
      </View>
      {rep.issues.length ? (
        <View style={{ gap: 4 }}>
          {rep.issues.map((i) => (
            <Text key={i} style={{ color: '#fff', fontSize: 13, lineHeight: 18 }}>
              <Text style={{ color: RED, fontWeight: '900' }}>✕ {ex.issues[i].title}. </Text>
              {ex.issues[i].detail}
            </Text>
          ))}
        </View>
      ) : (
        <Text style={{ color: GREEN, fontWeight: '800' }}>✓ Clean rep</Text>
      )}
      {live.length ? <Text style={{ color: AMBER, fontSize: 12, fontWeight: '700' }}>Now: {live.map((i) => ex.issues[i].cue).join(' · ')}</Text> : null}
    </View>
  );
}

function Summary({
  ex,
  reps,
  count,
  perSide,
  onGuide,
  onAgain,
  onClose,
  insets,
}: {
  ex: FormExercise;
  reps: RepBase[];
  /** The rep counter (left + right counts as one for curls). */
  count: number;
  perSide?: { left: number; right: number };
  onGuide: () => void;
  onAgain: () => void;
  onClose: () => void;
  insets: { top: number; bottom: number };
}) {
  const stats = useMemo(() => {
    if (!reps.length) return null;
    const avg = (f: (r: RepBase) => number) => reps.reduce((n, r) => n + f(r), 0) / reps.length;
    const counts = new Map<string, number>();
    reps.forEach((r) => r.issues.forEach((i) => counts.set(i, (counts.get(i) ?? 0) + 1)));
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      score: Math.round(avg((r) => r.score)),
      ecc: avg((r) => r.eccentricSec),
      con: avg((r) => r.concentricSec),
      rom: Math.round(avg((r) => r.romDeg)),
      clean: reps.filter((r) => !r.issues.length).length,
      top,
    };
  }, [reps]);

  return (
    <View style={{ flex: 1, backgroundColor: '#0E1114' }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, gap: 14, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 1.5, opacity: 0.7 }}>{ex.name.toUpperCase()} FORM CHECK</Text>
        {stats ? (
          <>
            <Text style={{ color: '#fff', fontSize: 30, fontWeight: '900' }}>
              {count} rep{count === 1 ? '' : 's'} · score <Text style={{ color: scoreColor(stats.score) }}>{stats.score}</Text>
            </Text>
            {perSide ? (
              <Text style={{ color: '#fff', opacity: 0.7, fontSize: 14 }}>
                Left arm {perSide.left} · right arm {perSide.right}
              </Text>
            ) : null}
            <Text style={{ color: '#fff', opacity: 0.85, fontSize: 16, lineHeight: 23 }}>
              {stats.clean} clean rep{stats.clean === 1 ? '' : 's'}. Average range {stats.rom}°, {stats.con.toFixed(1)} s lifting and {stats.ecc.toFixed(1)} s lowering
              {' '}(target: {ex.tempoTarget}).
            </Text>
            {stats.top ? (
              <View style={{ backgroundColor: '#1F2937', borderRadius: 14, padding: 14, gap: 4 }}>
                <Text style={{ color: AMBER, fontWeight: '900' }}>Focus next time: {ex.issues[stats.top[0]].title}</Text>
                <Text style={{ color: '#fff', opacity: 0.9, lineHeight: 20 }}>{ex.issues[stats.top[0]].detail}</Text>
                <Pressable onPress={onGuide} accessibilityRole="button" style={{ alignSelf: 'flex-start', marginTop: 6 }}>
                  <Text style={{ color: GREEN, fontWeight: '900' }}>▶ See correct form</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={{ color: GREEN, fontWeight: '900', fontSize: 16 }}>Every rep was clean. Great form!</Text>
            )}
            {reps.map((r, i) => (
              <RepCard key={i} ex={ex} rep={r} live={[]} />
            ))}
          </>
        ) : (
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>No reps recorded yet.</Text>
        )}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
          <Pressable onPress={onAgain} style={{ flex: 1, backgroundColor: '#fff', borderRadius: 14, paddingVertical: 15, alignItems: 'center' }} accessibilityRole="button">
            <Text style={{ fontWeight: '900', fontSize: 16, color: '#111' }}>Go again</Text>
          </Pressable>
          <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: '#1F2937', borderRadius: 14, paddingVertical: 15, alignItems: 'center' }} accessibilityRole="button">
            <Text style={{ fontWeight: '900', fontSize: 16, color: '#fff' }}>Close</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
