import { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatDuration } from '../lib/id';
import { formatKg } from '../lib/stats';
import { useTheme } from './ui';

export type PersonalBest = { exerciseName: string; weightKg: number; previousKg: number };

const CHEERS_FULL = ['You crushed it!', 'Beast mode: complete!', 'That was strong work!', 'Another one in the books!'];
const CHEERS_PARTIAL = ['Nice work today!', 'Every set counts!', 'Good effort, keep it up!'];

/** Celebration screen shown when a workout reaches its end. */
export function FinishScreen({
  workoutName,
  totalSec,
  workSec,
  restSec,
  setsDone,
  totalSets,
  volumeKg,
  personalBests,
  onDone,
}: {
  workoutName: string;
  totalSec: number;
  workSec: number;
  restSec: number;
  setsDone: number;
  totalSets: number;
  volumeKg: number;
  personalBests: PersonalBest[];
  onDone: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const allDone = setsDone >= totalSets;
  const cheer = useMemo(() => {
    const list = allDone ? CHEERS_FULL : CHEERS_PARTIAL;
    return list[Math.floor(Math.random() * list.length)];
  }, [allDone]);

  // Trophy pops in, then the rest fades up.
  const pop = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 350, useNativeDriver: true }),
    ]).start();
  }, [pop, fade]);

  const rise = { opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] };

  return (
    <View style={{ flex: 1, backgroundColor: t.success }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          padding: 24,
          paddingTop: insets.top + 32,
          paddingBottom: insets.bottom + 24,
          gap: 18,
          maxWidth: 520,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Animated.View
            style={{
              width: 120,
              height: 120,
              borderRadius: 60,
              backgroundColor: 'rgba(255,255,255,0.22)',
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ scale: pop }, { rotate: pop.interpolate({ inputRange: [0, 1], outputRange: ['-25deg', '0deg'] }) }],
            }}
          >
            <Text style={{ fontSize: 64 }} accessibilityLabel="Trophy">🏆</Text>
          </Animated.View>
          <Text style={{ color: '#fff', opacity: 0.9, fontWeight: '800', letterSpacing: 2, fontSize: 13, marginTop: 8 }}>
            WORKOUT COMPLETE
          </Text>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 34, textAlign: 'center' }} accessibilityRole="header">
            {cheer}
          </Text>
          <Text style={{ color: '#fff', opacity: 0.9, fontSize: 16, textAlign: 'center' }}>{workoutName}</Text>
        </View>

        <Animated.View style={[{ gap: 10 }, rise]}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Tile icon="⏱" label="Time" value={formatDuration(totalSec)} />
            <Tile icon="✅" label="Sets" value={`${setsDone}/${totalSets}`} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Tile icon="🏋️" label="Weight lifted" value={formatKg(volumeKg)} />
            <Tile icon="🔥" label="Active time" value={formatDuration(workSec)} />
          </View>
          <Text style={{ color: '#fff', opacity: 0.85, textAlign: 'center', fontSize: 13 }}>
            Rested {formatDuration(restSec)} in total
          </Text>

          {personalBests.length ? (
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 8, marginTop: 4 }}>
              <Text style={{ color: t.success, fontWeight: '900', fontSize: 13, letterSpacing: 1 }}>
                ⭐ NEW PERSONAL BEST{personalBests.length > 1 ? 'S' : ''}
              </Text>
              {personalBests.map((pb) => (
                <View key={pb.exerciseName} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Text style={{ color: '#111418', fontWeight: '700', fontSize: 16, flexShrink: 1 }}>{pb.exerciseName}</Text>
                  <Text style={{ color: '#111418', fontSize: 16 }}>
                    <Text style={{ fontWeight: '800' }}>{pb.weightKg} kg</Text>
                    <Text style={{ color: '#5F6B7A', fontSize: 13 }}>  was {pb.previousKg} kg</Text>
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </Animated.View>

        <Animated.View style={rise}>
          <Pressable
            onPress={onDone}
            accessibilityRole="button"
            style={({ pressed }) => ({
              backgroundColor: '#fff',
              paddingVertical: 18,
              borderRadius: 16,
              alignItems: 'center',
              opacity: pressed ? 0.85 : 1,
              marginTop: 6,
            })}
          >
            <Text style={{ color: t.success, fontSize: 18, fontWeight: '900' }}>Done 🎉</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
      <Confetti />
    </View>
  );
}

const CONFETTI_COLORS = ['#FDE047', '#FFFFFF', '#F9A8D4', '#7DD3FC', '#FDBA74', '#BBF7D0'];

/** One-off confetti burst falling from the top of the screen. Purely decorative. */
function Confetti({ count = 36 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 500,
        duration: 1800 + Math.random() * 1400,
        drift: (Math.random() - 0.5) * 120,
        spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540),
        size: 6 + Math.random() * 6,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        round: Math.random() > 0.6,
      })),
    [count],
  );
  const anims = useRef(pieces.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    Animated.parallel(
      anims.map((a, i) =>
        Animated.timing(a, { toValue: 1, duration: pieces[i].duration, delay: pieces[i].delay, useNativeDriver: true }),
      ),
    ).start();
  }, [anims, pieces]);

  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }} importantForAccessibility="no-hide-descendants">
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            top: -20,
            left: `${p.left}%`,
            width: p.size,
            height: p.round ? p.size : p.size * 1.6,
            borderRadius: p.round ? p.size / 2 : 2,
            backgroundColor: p.color,
            opacity: anims[i].interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateY: anims[i].interpolate({ inputRange: [0, 1], outputRange: [0, 900] }) },
              { translateX: anims[i].interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }) },
              { rotate: anims[i].interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

function Tile({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 16, padding: 14, gap: 4 }}>
      <Text style={{ color: '#fff', opacity: 0.9, fontSize: 12, fontWeight: '800', letterSpacing: 0.5 }}>
        {icon}  {label.toUpperCase()}
      </Text>
      <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900', fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}
