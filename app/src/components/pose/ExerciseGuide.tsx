import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';
import { cycleLength, phaseAt, type Guide, type GuideView } from '../../lib/pose/guide';
import { BODY_CONNECTIONS, L, type Point } from '../../lib/pose/landmarks';
import { say, setVoiceEnabled, stopVoice } from '../../lib/voice';

const GREEN = '#22C55E';
const BG = '#0E1114';
const CARD = '#1A1F26';
const NUMBERS = ['', 'two', 'three', 'four', 'five'];

/**
 * Animated "perfect rep" with the phase, tempo count and live joint angle,
 * plus the targets the form checker looks for.
 */
export function ExerciseGuide({
  name,
  guide,
  joint,
  voice,
  onClose,
}: {
  name: string;
  guide: Guide;
  /** Landmark index of the joint whose angle is shown (elbow / knee). */
  joint: number;
  voice: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [view, setView] = useState<GuideView>('side');
  const [voiceOn, setVoiceOn] = useState(voice);
  const [t, setT] = useState(0);
  const start = useRef(Date.now());
  const spoken = useRef('');

  useEffect(() => setVoiceEnabled(voiceOn), [voiceOn]);
  useEffect(() => () => stopVoice(), []);

  // Animation clock (~30 fps is plenty for a stick figure).
  useEffect(() => {
    start.current = Date.now();
    const h = setInterval(() => setT((Date.now() - start.current) / 1000), 33);
    return () => clearInterval(h);
  }, [view]);

  const phase = phaseAt(guide, t);
  const cycleNo = Math.floor(t / cycleLength(guide));
  const sec = Math.floor(phase.elapsed);
  const current = phase.index >= 0 ? guide.phases[phase.index] : undefined;

  // Speak each phase as it starts, and count the seconds of slow phases.
  useEffect(() => {
    if (!current) return;
    const key = `${cycleNo}-${phase.index}-${current.count ? sec : 0}`;
    if (spoken.current === key) return;
    spoken.current = key;
    if (sec === 0) say(current.say);
    else if (current.count && NUMBERS[sec]) say(NUMBERS[sec]);
  }, [current, cycleNo, phase.index, sec]);

  const { image, world } = guide.frame(t, view);
  const angle = Math.round(guide.angle(world));

  // Fixed framing per view, from the standing pose, so the figure doesn't jump around.
  const frameBox = useMemo(() => {
    const pts = [...guide.frame(0, view).image, ...guide.frame(cycleLength(guide) * 0.55, view).image].filter(
      (_, i) => i % 33 >= 11,
    );
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const pad = 0.12;
    const minX = Math.min(...xs) - pad;
    const maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad - 0.1; // room for the head
    const maxY = Math.max(...ys) + pad / 2;
    const size = Math.max(maxX - minX, maxY - minY);
    return { x: (minX + maxX) / 2 - size / 2, y: minY, size };
  }, [guide, view]);

  const box = Math.min(width - 32, 340);
  const P = (p: Point) => ({ x: ((p.x - frameBox.x) / frameBox.size) * box, y: ((p.y - frameBox.y) / frameBox.size) * box });
  const sh = P({ x: (image[L.leftShoulder].x + image[L.rightShoulder].x) / 2, y: (image[L.leftShoulder].y + image[L.rightShoulder].y) / 2 });
  const headR = box * 0.045;
  const j = P(image[joint]);

  const total = cycleLength(guide);
  const segs = [{ label: 'Rest', sec: guide.rest.sec }, ...guide.phases.map((p) => ({ label: p.label, sec: p.sec }))];

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24, gap: 14, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900', flex: 1 }} accessibilityRole="header">
            How to: {name}
          </Text>
          <Pressable onPress={() => setVoiceOn((v) => !v)} accessibilityRole="button" accessibilityLabel={voiceOn ? 'Mute counting' : 'Count out loud'} style={pill}>
            <Ionicons name={voiceOn ? 'volume-high' : 'volume-mute'} size={18} color="#fff" />
          </Pressable>
          <Pressable onPress={onClose} accessibilityRole="button" style={pill}>
            <Text style={pillText}>✕</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', alignSelf: 'center', backgroundColor: CARD, borderRadius: 999, padding: 3 }} accessibilityRole="tablist">
          {(['side', 'front'] as const).map((v) => (
            <Pressable
              key={v}
              onPress={() => setView(v)}
              accessibilityRole="tab"
              accessibilityState={{ selected: view === v }}
              aria-selected={view === v}
              style={{ paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999, backgroundColor: view === v ? '#fff' : 'transparent' }}
            >
              <Text style={{ color: view === v ? '#111' : '#fff', fontWeight: '800' }}>{v === 'side' ? 'Side view' : 'Front view'}</Text>
            </Pressable>
          ))}
        </View>

        {/* animated figure */}
        <View style={{ alignSelf: 'center', backgroundColor: CARD, borderRadius: 20, overflow: 'hidden' }} accessible accessibilityLabel={`Animation of a correct ${name.toLowerCase()}. ${phase.label}.`}>
          <Svg width={box} height={box}>
            {/* floor */}
            <Line x1={0} x2={box} y1={box * 0.94} y2={box * 0.94} stroke="rgba(255,255,255,0.15)" strokeWidth={2} />
            {BODY_CONNECTIONS.map(([a, b]) => {
              const pa = image[a];
              const pb = image[b];
              const far = Math.min(pa.visibility ?? 1, pb.visibility ?? 1) < 0.8;
              const A = P(pa);
              const B = P(pb);
              return <Line key={`${a}-${b}`} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={far ? 'rgba(255,255,255,0.35)' : '#fff'} strokeWidth={far ? 4 : 6} strokeLinecap="round" />;
            })}
            <Circle cx={sh.x + (view === 'side' ? headR * 0.3 : 0)} cy={sh.y - headR * 1.9} r={headR} fill="#fff" />
            {/* the joint being measured */}
            <Circle cx={j.x} cy={j.y} r={10} fill="none" stroke={GREEN} strokeWidth={3} />
            <SvgText x={j.x + 16} y={j.y + 5} fill={GREEN} fontSize={15} fontWeight="bold">
              {`${angle}°`}
            </SvgText>
          </Svg>
        </View>

        {/* phase + count */}
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Text style={{ color: current ? GREEN : '#fff', fontSize: 28, fontWeight: '900', textAlign: 'center' }} accessibilityLiveRegion="polite">
            {phase.label}
          </Text>
          <Text style={{ color: '#fff', opacity: 0.8, fontSize: 16, fontVariant: ['tabular-nums'] }}>
            {current ? (current.count ? `${Array.from({ length: sec + 1 }, (_, i) => i + 1).join('… ')}…  (${current.sec} s)  ·  ` : `${current.sec} s  ·  `) : ''}
            {guide.angleLabel} {angle}°
          </Text>
        </View>

        {/* timeline */}
        <View style={{ flexDirection: 'row', gap: 3 }}>
          {segs.map((s, i) => {
            const active = i === phase.index + 1;
            return (
              <View key={s.label} style={{ flex: s.sec / total, gap: 4 }}>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: active ? GREEN : 'rgba(255,255,255,0.18)' }} />
                <Text style={{ color: active ? GREEN : '#fff', opacity: active ? 1 : 0.6, fontSize: 11, fontWeight: '700' }} numberOfLines={2}>
                  {s.label}
                </Text>
              </View>
            );
          })}
        </View>

        {/* key points */}
        <View style={{ backgroundColor: CARD, borderRadius: 16, padding: 16, gap: 12 }}>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>What the form check looks for</Text>
          {guide.points.map((p) => (
            <View key={p.title} style={{ flexDirection: 'row', gap: 10 }}>
              <Text style={{ color: GREEN, fontWeight: '900', fontSize: 16 }}>✓</Text>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{p.title}</Text>
                <Text style={{ color: '#fff', opacity: 0.8, fontSize: 14, lineHeight: 20 }}>{p.detail}</Text>
              </View>
            </View>
          ))}
        </View>

        <Pressable onPress={onClose} accessibilityRole="button" style={{ backgroundColor: '#fff', borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}>
          <Text style={{ color: '#111', fontWeight: '900', fontSize: 17 }}>Got it — let me try</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const pill = { backgroundColor: CARD, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 } as const;
const pillText = { color: '#fff', fontWeight: '800', fontSize: 15 } as const;
