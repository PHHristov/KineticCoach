import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Body, Button, Card, H1, H2, Screen, useTheme } from '../../components/ui';
import {
  addDays,
  nextScheduled,
  planForDay,
  relativeDayLabel,
  sameDay,
  startOfDay,
  startOfWeek,
  WEEKDAYS_SHORT,
  type DayPlan,
} from '../../lib/calendar';
import { formatDuration } from '../../lib/id';
import { describeSet, estimateWorkout } from '../../lib/plan';
import { formatKg, volumeSummary } from '../../lib/stats';
import { useStore } from '../../lib/store';

export default function HomeScreen() {
  const { ready, schedule, plans, workouts, history } = useStore();
  const t = useTheme();
  const today = startOfDay(new Date());
  const plan = plans.find((p) => p.id === schedule?.planId);

  const days: DayPlan[] = useMemo(() => {
    const start = startOfWeek(today);
    return Array.from({ length: 14 }, (_, i) => planForDay(addDays(start, i), schedule, plan, workouts, history));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today.getTime(), schedule, plan, workouts, history]);

  const next = useMemo(() => nextScheduled(today, schedule, plan, workouts, history), [today.getTime(), schedule, plan, workouts, history]); // eslint-disable-line react-hooks/exhaustive-deps
  const [selected, setSelected] = useState<Date | null>(null);
  const selectedDate = selected ?? next?.date ?? today;
  const selectedDay = days.find((d) => sameDay(d.date, selectedDate)) ?? planForDay(selectedDate, schedule, plan, workouts, history);

  const volume = useMemo(() => volumeSummary(history), [history]);

  if (!ready) return <Screen />;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        <View>
          <Body muted>{today.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</Body>
          <H1>{next && sameDay(next.date, today) ? 'Training day 💪' : 'Welcome back'}</H1>
        </View>

        {/* weight summary */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Stat label="Lifted this week" value={formatKg(volume.week)} sub={`${volume.weekSessions} workout${volume.weekSessions === 1 ? '' : 's'}`} />
          <Stat label="Lifted overall" value={formatKg(volume.total)} sub={`${volume.totalSessions} workout${volume.totalSessions === 1 ? '' : 's'}`} />
        </View>

        {/* calendar */}
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <H2>Schedule</H2>
            <Pressable onPress={() => router.push(plan ? { pathname: '/plan/[id]', params: { id: plan.id } } : '/plans')} hitSlop={8}>
              <Text style={{ color: t.primary, fontWeight: '700' }} numberOfLines={1}>
                {plan ? plan.name : 'Choose a plan'}
              </Text>
            </Pressable>
          </View>
          {[0, 1].map((week) => (
            <View key={week} style={{ flexDirection: 'row', gap: 4 }}>
              {days.slice(week * 7, week * 7 + 7).map((d) => (
                <DayCell
                  key={d.date.toISOString()}
                  day={d}
                  isToday={sameDay(d.date, today)}
                  isSelected={sameDay(d.date, selectedDate)}
                  isPast={d.date < today}
                  showWeekday={week === 0}
                  onPress={() => setSelected(d.date)}
                />
              ))}
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
            <Legend color={t.primary} label="Workout" />
            <Legend color="#12B76A" label="Done" />
            <Legend color={t.muted} label="Missed" />
          </View>
        </Card>

        {/* selected day */}
        <DayDetail day={selectedDay} hasPlan={!!plan} />

        <Pressable onPress={() => router.push('/form-check')} accessibilityRole="button">
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ fontSize: 28 }}>📷</Text>
            <View style={{ flex: 1 }}>
              <H2>Form check</H2>
              <Body muted style={{ fontSize: 13 }}>Squats and bicep curls: live camera feedback on range, form and tempo.</Body>
            </View>
            <Text style={{ color: t.primary, fontWeight: '800' }}>Start ›</Text>
          </Card>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  const t = useTheme();
  return (
    <Card style={{ flex: 1, gap: 2 }}>
      <Text style={{ color: t.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
      <Text style={{ color: t.text, fontSize: 24, fontWeight: '800' }}>{value}</Text>
      <Body muted style={{ fontSize: 13 }}>{sub}</Body>
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ color: t.muted, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

function DayCell({
  day,
  isToday,
  isSelected,
  isPast,
  showWeekday,
  onPress,
}: {
  day: DayPlan;
  isToday: boolean;
  isSelected: boolean;
  isPast: boolean;
  showWeekday: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const dot = day.done ? '#12B76A' : day.workout ? (isPast ? t.muted : t.primary) : day.sessions.length ? '#12B76A' : null;
  const label = `${day.date.toDateString()}${day.workout ? `, ${day.workout.name}${day.done ? ', done' : ''}` : ', rest day'}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: isSelected }}
      style={{
        flex: 1,
        alignItems: 'center',
        paddingVertical: 8,
        borderRadius: 10,
        gap: 3,
        backgroundColor: isSelected ? t.primary : 'transparent',
        borderWidth: isToday && !isSelected ? 1.5 : 0,
        borderColor: t.primary,
      }}
    >
      {showWeekday ? (
        <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#fff' : t.muted }}>{WEEKDAYS_SHORT[(day.date.getDay() + 6) % 7]}</Text>
      ) : null}
      <Text style={{ fontSize: 16, fontWeight: '700', color: isSelected ? '#fff' : isPast ? t.muted : t.text }}>{day.date.getDate()}</Text>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot ? (isSelected ? '#fff' : dot) : 'transparent' }} />
    </Pressable>
  );
}

function DayDetail({ day, hasPlan }: { day: DayPlan; hasPlan: boolean }) {
  const t = useTheme();
  const title = relativeDayLabel(day.date);

  if (!day.workout) {
    return (
      <Card>
        <Text style={{ color: t.muted, fontWeight: '700', fontSize: 12 }}>{title.toUpperCase()}</Text>
        {day.sessions.length ? (
          <>
            <H2>Extra workout done ✓</H2>
            <Body muted>{day.sessions.map((s) => s.workoutName).join(', ')}</Body>
          </>
        ) : hasPlan ? (
          <>
            <H2>Rest day</H2>
            <Body muted>Recovery is part of the plan. Nothing scheduled.</Body>
          </>
        ) : (
          <>
            <H2>No plan yet</H2>
            <Body muted>Pick a training plan and the days you can train, and your workouts will show up here.</Body>
            <Button title="Browse plans" onPress={() => router.push('/plans')} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
          </>
        )}
      </Card>
    );
  }

  const w = day.workout;
  const est = estimateWorkout(w);
  const isPast = day.date < startOfDay(new Date());
  return (
    <Card>
      <Text style={{ color: day.done ? '#12B76A' : t.primary, fontWeight: '800', fontSize: 12 }}>
        {title.toUpperCase()}
        {day.done ? ' · DONE ✓' : day.partial ? ' · STARTED' : isPast ? ' · MISSED' : ''}
      </Text>
      <H2>{w.name}</H2>
      <Body muted>
        {w.items.length} exercises · {est.sets} sets · ~{formatDuration(est.totalSec)}
      </Body>
      {day.partial ? (
        <Body style={{ fontSize: 14 }}>
          Ended early: {day.partial.completedSets} of {day.partial.totalSets} sets logged.
        </Body>
      ) : null}
      <View style={{ gap: 4, marginTop: 4 }}>
        {w.items.map((it, i) => (
          <View key={it.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Body>
              {i + 1}. {it.exerciseName}
            </Body>
            <Body muted style={{ fontSize: 13 }}>{describeSet(it)}</Body>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
        <Button
          title={day.done ? 'Do it again' : day.partial ? '▶ Start again' : '▶ Start workout'}
          variant={day.done ? 'secondary' : 'primary'}
          onPress={() => router.push({ pathname: '/play/[id]', params: { id: w.id } })}
          style={{ flex: 1 }}
        />
        <Button title="Details" variant="secondary" onPress={() => router.push({ pathname: '/workout/[id]', params: { id: w.id } })} />
      </View>
    </Card>
  );
}
