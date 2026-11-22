import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShare } from '../../components/ShareButton';
import { Body, Button, Card, H1, H2, Screen, useTheme } from '../../components/ui';
import { WEEKDAYS_LONG, WEEKDAYS_SHORT } from '../../lib/calendar';
import { confirm } from '../../lib/confirm';
import { formatDuration } from '../../lib/id';
import { estimateWorkout } from '../../lib/plan';
import { planShareLink } from '../../lib/share';
import { useStore } from '../../lib/store';

export default function PlanDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { plans, workouts, schedule, setSchedule, deletePlan, ready } = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { share, panel } = useShare();
  const plan = plans.find((p) => p.id === id);
  const isActive = !!plan && schedule?.planId === plan.id;
  const [days, setDays] = useState<number[]>([]);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (isActive && schedule) setDays(schedule.days);
  }, [isActive, schedule]);

  if (!ready) return <Screen />;
  if (!plan) {
    return (
      <Screen style={{ padding: 16, gap: 12 }}>
        <H2>Plan not found</H2>
        <Button title="Back to plans" onPress={() => router.replace('/plans')} />
      </Screen>
    );
  }

  const planWorkouts = plan.workoutIds.map((wid) => workouts.find((w) => w.id === wid));
  const needed = plan.workoutIds.length;
  const sortedDays = days.slice().sort((a, b) => a - b);
  const unchanged = isActive && schedule && schedule.days.join() === sortedDays.join();

  const toggleDay = (d: number) => {
    setHint(null);
    if (days.includes(d)) {
      setDays(days.filter((x) => x !== d));
    } else if (days.length >= needed) {
      setHint(`This is a ${needed}-day plan. Unselect a day first.`);
    } else {
      setDays([...days, d]);
    }
  };

  const start = () => {
    setSchedule({ planId: plan.id, days: sortedDays, startedAt: isActive && schedule ? schedule.startedAt : Date.now() });
    router.dismissTo('/');
  };

  const stop = async () => {
    if (await confirm('Stop plan', `Stop following "${plan.name}"? Your history is kept.`, 'Stop')) {
      setSchedule(null);
      setDays([]);
    }
  };

  const onDelete = async () => {
    if (await confirm('Delete plan', `Delete "${plan.name}"? The workouts in it are kept.`, 'Delete')) {
      deletePlan(plan.id);
      router.replace('/plans');
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: plan.name }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 + insets.bottom, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        <View style={{ gap: 4 }}>
          <Text style={{ color: t.primary, fontWeight: '800', fontSize: 12 }}>
            {needed}-DAY PLAN{isActive ? ' · ACTIVE' : ''}
          </Text>
          <H1>{plan.name}</H1>
          {plan.description ? <Body muted>{plan.description}</Body> : null}
          {plan.author ? <Body muted>by {plan.author}</Body> : null}
        </View>

        {/* training days */}
        {needed > 0 ? (
          <Card style={{ gap: 12 }}>
            <H2>{isActive ? 'Your training days' : `Pick ${needed} training day${needed === 1 ? '' : 's'}`}</H2>
            <Body muted>
              {days.length} of {needed} selected. Workouts are assigned in order to the days you pick.
            </Body>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {WEEKDAYS_SHORT.map((label, d) => {
                const on = days.includes(d);
                return (
                  <Pressable
                    key={label}
                    onPress={() => toggleDay(d)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={WEEKDAYS_LONG[d]}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 10,
                      alignItems: 'center',
                      backgroundColor: on ? t.primary : t.chip,
                    }}
                  >
                    <Text style={{ color: on ? '#fff' : t.text, fontWeight: '700', fontSize: 13 }}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {hint ? <Text style={{ color: t.danger }}>{hint}</Text> : null}
            {sortedDays.length ? (
              <View style={{ gap: 4 }}>
                {sortedDays.map((d, i) => (
                  <Body key={d} style={{ fontSize: 14 }}>
                    <Text style={{ fontWeight: '700' }}>{WEEKDAYS_LONG[d]}</Text> → {planWorkouts[i]?.name ?? 'Missing workout'}
                  </Body>
                ))}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Button
                title={isActive ? 'Save training days' : 'Start this plan'}
                disabled={days.length !== needed || !!unchanged}
                onPress={start}
              />
              {isActive ? <Button title="Stop plan" variant="ghost" onPress={stop} /> : null}
            </View>
            {!isActive && schedule ? (
              <Body muted style={{ fontSize: 13 }}>Starting this plan replaces the one you follow now.</Body>
            ) : null}
          </Card>
        ) : (
          <Card>
            <Body muted>This plan has no workouts yet. Edit it to add some.</Body>
          </Card>
        )}

        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button title="Share" variant="secondary" onPress={() => share(plan.name, planShareLink(plan, workouts))} />
          <Button title="Edit" variant="secondary" onPress={() => router.push({ pathname: '/plan-edit/[id]', params: { id: plan.id } })} />
          <Button title="Delete" variant="ghost" onPress={onDelete} />
        </View>
        {panel}

        <H2>Workouts</H2>
        {planWorkouts.map((w, i) => (
          <Pressable
            key={plan.workoutIds[i]}
            disabled={!w}
            onPress={() => w && router.push({ pathname: '/workout/[id]', params: { id: w.id } })}
            accessibilityRole="link"
          >
            <Card>
              <Text style={{ color: t.muted, fontWeight: '700', fontSize: 12 }}>
                DAY {i + 1}
                {sortedDays[i] !== undefined && days.length === needed ? ` · ${WEEKDAYS_LONG[sortedDays[i]].toUpperCase()}` : ''}
              </Text>
              <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>{w?.name ?? 'Workout was deleted'}</Text>
              {w ? (
                <Body muted style={{ fontSize: 13 }}>
                  {w.items.map((it) => it.exerciseName).join(' · ')} · ~{formatDuration(estimateWorkout(w).totalSec)}
                </Body>
              ) : null}
            </Card>
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}
