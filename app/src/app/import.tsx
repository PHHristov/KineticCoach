import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Body, Button, Card, Field, H2, Screen, useTheme } from '../components/ui';
import { formatDuration } from '../lib/id';
import { describeSet, estimateWorkout } from '../lib/plan';
import { decodeShared, type Decoded } from '../lib/share';
import { useStore } from '../lib/store';

export default function ImportScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const { saveWorkout, saveWorkouts, savePlan } = useStore();
  const t = useTheme();
  const [input, setInput] = useState(params.code ?? '');

  useEffect(() => {
    if (params.code) setInput(params.code);
  }, [params.code]);

  const parsed = useMemo<{ data?: Decoded; error?: string }>(() => {
    if (!input.trim()) return {};
    try {
      return { data: decodeShared(input) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [input]);

  const data = parsed.data;

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        <Field
          label="Share link or code"
          value={input}
          onChangeText={setInput}
          placeholder="Paste the workout or plan link someone sent you"
          autoCapitalize="none"
          autoCorrect={false}
          multiline
        />
        {parsed.error ? <Text style={{ color: t.danger }}>{parsed.error}</Text> : null}

        {data?.kind === 'workout' ? (
          <Card>
            <Text style={{ color: t.primary, fontWeight: '800', fontSize: 12 }}>WORKOUT</Text>
            <H2>{data.workout.name}</H2>
            {data.workout.author ? <Body muted>by {data.workout.author}</Body> : null}
            {data.workout.description ? <Body>{data.workout.description}</Body> : null}
            <Body muted>
              {data.workout.type} · {data.workout.items.length} exercises · ~{formatDuration(estimateWorkout(data.workout).totalSec)}
            </Body>
            <View style={{ gap: 2, marginTop: 4 }}>
              {data.workout.items.map((it, i) => (
                <Body key={it.id}>
                  {i + 1}. {it.exerciseName} — {describeSet(it)}
                </Body>
              ))}
            </View>
            <Button
              title="Save to my workouts"
              style={{ marginTop: 8 }}
              onPress={() => {
                saveWorkout(data.workout);
                router.replace({ pathname: '/workout/[id]', params: { id: data.workout.id } });
              }}
            />
          </Card>
        ) : null}

        {data?.kind === 'plan' ? (
          <Card>
            <Text style={{ color: t.primary, fontWeight: '800', fontSize: 12 }}>{data.workouts.length}-DAY PLAN</Text>
            <H2>{data.plan.name}</H2>
            {data.plan.author ? <Body muted>by {data.plan.author}</Body> : null}
            {data.plan.description ? <Body>{data.plan.description}</Body> : null}
            <View style={{ gap: 6, marginTop: 4 }}>
              {data.workouts.map((w, i) => (
                <View key={w.id}>
                  <Body style={{ fontWeight: '700' }}>
                    Day {i + 1}: {w.name}
                  </Body>
                  <Body muted style={{ fontSize: 13 }}>{w.items.map((it) => it.exerciseName).join(' · ')}</Body>
                </View>
              ))}
            </View>
            <Button
              title="Save plan and pick training days"
              style={{ marginTop: 8 }}
              onPress={() => {
                saveWorkouts(data.workouts);
                savePlan(data.plan);
                router.replace({ pathname: '/plan/[id]', params: { id: data.plan.id } });
              }}
            />
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
