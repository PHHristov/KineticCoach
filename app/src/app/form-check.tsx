import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PoseCamera from '../components/pose/PoseCamera';
import type { CameraStatus } from '../components/pose/types';
import type { PoseFrame } from '../lib/pose/landmarks';
import {
  CHECKS_BY_VIEW,
  depthLabel,
  ISSUES,
  repSpeech,
  SquatAnalyzer,
  type IssueId,
  type LiveState,
  type RepResult,
  type Tempo,
  type View as CamView,
} from '../lib/pose/squatAnalyzer';
import { useScreenAwake } from '../lib/keepAwake';
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
  const { settings } = useStore();
  const demo = useLocalSearchParams<{ demo?: string }>().demo === '1';
  const analyzer = useRef(new SquatAnalyzer()).current;
  const [status, setStatus] = useState<CameraStatus>({ kind: 'starting', message: 'Starting…' });
  const [live, setLive] = useState<LiveState | null>(null);
  const [reps, setReps] = useState<RepResult[]>([]);
  const [banner, setBanner] = useState<{ text: string; good: boolean; at: number } | null>(null);
  const [voiceOn, setVoiceOn] = useState(settings.voiceEnabled);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [stats, setStats] = useState<{ fps: number; inferenceMs: number } | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const lastUi = useRef(0);

  useEffect(() => setVoiceEnabled(voiceOn), [voiceOn]);
  useEffect(() => () => stopVoice(), []);

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
          say('Ready. Start squatting.');
          setBanner({ text: 'Ready — start squatting', good: true, at: f.t });
        } else if (e.type === 'cue') {
          // Fastest feedback: show and say the cue the moment the problem is detected.
          say(ISSUES[e.issue].cue);
          setBanner({ text: ISSUES[e.issue].cue, good: false, at: f.t });
        } else if (e.type === 'partial') {
          say('Go lower to count it');
          setBanner({ text: 'Go lower to count the rep', good: false, at: f.t });
        } else if (e.type === 'rep') {
          say(repSpeech(e.rep));
          setReps((r) => [...r, e.rep]);
          if (!e.rep.issues.length) setBanner({ text: `Rep ${e.rep.n} — great!`, good: true, at: f.t });
        }
      }
      // Throttle React updates to ~20 per second; the skeleton itself is drawn every frame.
      if (events.length || f.t - lastUi.current > 50) {
        lastUi.current = f.t;
        setLive(state);
      }
      return state.badJoints;
    },
    [analyzer],
  );

  const reset = () => {
    analyzer.reset();
    setReps([]);
    setLive(null);
    setShowSummary(false);
  };

  const phase = live?.phase ?? 'get-ready';
  const view = live?.view ?? 'angled';
  // The analyzer only produces a knee angle once it has seen the legs.
  const bodyInView = phase !== 'not-visible' && live?.kneeAngle !== undefined;
  const lastRep = reps[reps.length - 1];
  const activeIssues = live?.activeIssues ?? [];

  if (showSummary) return <Summary reps={reps} onAgain={reset} onClose={() => router.back()} insets={insets} />;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <PoseCamera onFrame={onFrame} onStatus={setStatus} onStats={setStats} facing={facing} demo={demo} />
      {demo ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 54, left: 0, right: 0, alignItems: 'center' }}>
          <Text style={{ color: '#fff', opacity: 0.6, fontSize: 12 }}>Demo mode: simulated squats, no camera</Text>
        </View>
      ) : null}

      {/* top bar */}
      <View style={{ position: 'absolute', top: insets.top + 10, left: 12, right: 12, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Pill label="✕ Close" onPress={() => router.back()} />
        <View style={{ flex: 1 }} />
        <Pill label={voiceOn ? '🔊' : '🔇'} onPress={() => setVoiceOn((v) => !v)} a11y={voiceOn ? 'Mute voice' : 'Unmute voice'} />
        {Platform.OS === 'web' ? (
          <Pill label="⟲ Camera" onPress={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))} a11y="Switch camera" />
        ) : null}
        <Pill label="Finish" onPress={() => setShowSummary(true)} strong />
      </View>

      {/* rep counter + view */}
      {status.kind === 'running' ? (
        <View style={{ position: 'absolute', top: insets.top + 60, left: 12, gap: 6 }}>
          <View style={{ backgroundColor: PANEL, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 1 }}>REPS</Text>
            <Text style={{ color: '#fff', fontSize: 44, fontWeight: '900', fontVariant: ['tabular-nums'] }}>{live?.reps ?? 0}</Text>
          </View>
          {bodyInView ? <Chip text={VIEW_LABEL[view]} /> : null}
          {bodyInView && live?.kneeAngle !== undefined ? <Chip text={`Knee ${live.kneeAngle}°`} /> : null}
          {stats ? <Chip text={`${stats.fps} fps · ${stats.inferenceMs} ms`} dim /> : null}
        </View>
      ) : null}

      {/* depth gauge */}
      {status.kind === 'running' && phase !== 'not-visible' ? <DepthGauge progress={live?.depthProgress ?? 0} top={insets.top + 60} /> : null}

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
        <SetupCard status={status} phase={phase} view={bodyInView ? view : null} />
      ) : null}

      {/* bottom: live issues + last rep */}
      {status.kind === 'running' && (lastRep || activeIssues.length) ? (
        <View style={{ position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 12, alignItems: 'center' }}>
          <View style={{ width: '100%', maxWidth: 560 }}>
            {lastRep ? <RepCard rep={lastRep} live={phase === 'down' || phase === 'up' ? activeIssues : []} /> : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Pill({ label, onPress, strong, a11y }: { label: string; onPress: () => void; strong?: boolean; a11y?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      style={{ backgroundColor: strong ? '#fff' : PANEL, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 }}
    >
      <Text style={{ color: strong ? '#111' : '#fff', fontWeight: '800', fontSize: 14 }}>{label}</Text>
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

/** Vertical bar: fills as you go down; green once you reach parallel. */
function DepthGauge({ progress, top }: { progress: number; top: number }) {
  const reached = progress >= 1;
  const h = 220;
  return (
    <View style={{ position: 'absolute', right: 14, top, alignItems: 'center', gap: 6 }} accessibilityLabel={`Depth ${Math.round(progress * 100)} percent of parallel`}>
      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1, backgroundColor: PANEL, paddingHorizontal: 6, borderRadius: 6 }}>DEPTH</Text>
      <View style={{ width: 26, height: h, borderRadius: 13, backgroundColor: PANEL, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)' }}>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${Math.min(1, progress / 1.2) * 100}%`, backgroundColor: reached ? GREEN : '#fff' }} />
        {/* parallel line */}
        <View style={{ position: 'absolute', left: 0, right: 0, top: h / 1.2 - 2, height: 3, backgroundColor: GREEN }} />
      </View>
      <Text style={{ color: reached ? GREEN : '#fff', fontSize: 11, fontWeight: '800', backgroundColor: PANEL, paddingHorizontal: 6, borderRadius: 6 }}>
        {reached ? 'PARALLEL ✓' : 'PARALLEL'}
      </Text>
    </View>
  );
}

function SetupCard({ status, phase, view }: { status: CameraStatus; phase: string; view: CamView | null }) {
  const title =
    status.kind === 'error'
      ? 'Camera unavailable'
      : status.kind === 'starting'
        ? status.message
        : phase === 'not-visible'
          ? 'Step back into view'
          : 'Stand tall to begin';
  return (
    <View style={{ position: 'absolute', left: 12, right: 12, bottom: 24, alignItems: 'center' }}>
      <View style={{ backgroundColor: 'rgba(0,0,0,0.78)', borderRadius: 18, padding: 18, gap: 8, maxWidth: 560, width: '100%' }}>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900' }}>{title}</Text>
        {status.kind === 'error' ? (
          <Text style={{ color: '#fff', opacity: 0.9, fontSize: 15, lineHeight: 21 }}>{status.message}</Text>
        ) : (
          <>
            <Tip text="Put the camera at hip height, 2–3 m away, so your whole body from feet to head is in view." />
            <Tip text="Side-on checks depth, back angle and heels. Facing the camera checks your knees and balance." />
            <Tip text="Good light helps. Video stays on your device; nothing is uploaded." />
            {status.kind === 'running' && view ? (
              <Text style={{ color: GREEN, fontWeight: '700', marginTop: 4 }}>
                {VIEW_LABEL[view]} detected · checking: {CHECKS_BY_VIEW[view].map((i) => ISSUES[i].title.toLowerCase()).join(', ')}
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

function tempoText(kind: 'down' | 'up', sec: number, t: Tempo) {
  const label = { controlled: 'controlled', ok: kind === 'down' ? 'a bit fast' : 'could be faster', fast: 'too fast', explosive: 'explosive', slow: 'too slow' }[t];
  const good = t === 'controlled' || t === 'explosive';
  return { text: `${kind === 'down' ? '↓' : '↑'} ${sec.toFixed(1)}s ${label}`, color: good ? GREEN : t === 'ok' ? AMBER : RED };
}

function scoreColor(s: number) {
  return s >= 85 ? GREEN : s >= 65 ? AMBER : RED;
}

function RepCard({ rep, live }: { rep: RepResult; live: IssueId[] }) {
  const down = tempoText('down', rep.eccentricSec, rep.descent);
  const up = tempoText('up', rep.concentricSec, rep.ascent);
  const depthGood = rep.depth === 'deep' || rep.depth === 'parallel';
  return (
    <View style={{ backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 18, padding: 14, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 58, height: 58, borderRadius: 29, borderWidth: 4, borderColor: scoreColor(rep.score), alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900' }}>{rep.score}</Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>
            Rep {rep.n} · <Text style={{ color: depthGood ? GREEN : AMBER }}>{depthLabel(rep.depth)}</Text>
          </Text>
          <Text style={{ color: '#fff', opacity: 0.85, fontSize: 13 }}>
            Range {rep.romDeg}° · knee {rep.minKneeAngle}° at the bottom
          </Text>
          <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
            <Text style={{ color: down.color, fontWeight: '800', fontSize: 14 }}>{down.text}</Text>
            <Text style={{ color: up.color, fontWeight: '800', fontSize: 14 }}>{up.text}</Text>
          </View>
        </View>
      </View>
      {rep.issues.length ? (
        <View style={{ gap: 4 }}>
          {rep.issues.map((i) => (
            <Text key={i} style={{ color: '#fff', fontSize: 13, lineHeight: 18 }}>
              <Text style={{ color: RED, fontWeight: '900' }}>✕ {ISSUES[i].title}. </Text>
              {ISSUES[i].detail}
            </Text>
          ))}
        </View>
      ) : (
        <Text style={{ color: GREEN, fontWeight: '800' }}>✓ Clean rep</Text>
      )}
      {live.length ? <Text style={{ color: AMBER, fontSize: 12, fontWeight: '700' }}>Now: {live.map((i) => ISSUES[i].cue).join(' · ')}</Text> : null}
    </View>
  );
}

function Summary({ reps, onAgain, onClose, insets }: { reps: RepResult[]; onAgain: () => void; onClose: () => void; insets: { top: number; bottom: number } }) {
  const stats = useMemo(() => {
    if (!reps.length) return null;
    const avg = (f: (r: RepResult) => number) => reps.reduce((n, r) => n + f(r), 0) / reps.length;
    const counts = new Map<IssueId, number>();
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
        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 1.5, opacity: 0.7 }}>SQUAT FORM CHECK</Text>
        {stats ? (
          <>
            <Text style={{ color: '#fff', fontSize: 30, fontWeight: '900' }}>
              {reps.length} rep{reps.length === 1 ? '' : 's'} · score <Text style={{ color: scoreColor(stats.score) }}>{stats.score}</Text>
            </Text>
            <Text style={{ color: '#fff', opacity: 0.85, fontSize: 16, lineHeight: 23 }}>
              {stats.clean} clean rep{stats.clean === 1 ? '' : 's'}. Average range {stats.rom}°, {stats.ecc.toFixed(1)} s down and {stats.con.toFixed(1)} s up
              {' '}(target: 2+ s down, about 1 s up).
            </Text>
            {stats.top ? (
              <View style={{ backgroundColor: '#1F2937', borderRadius: 14, padding: 14, gap: 4 }}>
                <Text style={{ color: AMBER, fontWeight: '900' }}>Focus next time: {ISSUES[stats.top[0]].title}</Text>
                <Text style={{ color: '#fff', opacity: 0.9, lineHeight: 20 }}>{ISSUES[stats.top[0]].detail}</Text>
              </View>
            ) : (
              <Text style={{ color: GREEN, fontWeight: '900', fontSize: 16 }}>Every rep was clean. Great form!</Text>
            )}
            {reps.map((r) => (
              <RepCard key={r.n} rep={r} live={[]} />
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
