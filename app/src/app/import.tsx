import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Body, Button, Card, Field, H2, Screen, useTheme } from '../components/ui';
import { formatDuration } from '../lib/id';
import { describeSet, estimateWorkout } from '../lib/plan';
import { decodeWorkout } from '../lib/share';
import { useStore } from '../lib/store';
import type { Workout } from '../lib/types';

export default function ImportScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const { saveWorkout } = useStore();
  const t = useTheme();
  const [input, setInput] = useState(params.code ?? '');

  useEffect(() => {
    if (params.code) setInput(params.code);
  }, [params.code]);

  const parsed = useMemo<{ workout?: Workout; error?: string }>(() => {
    if (!input.trim()) return {};
    try {
      return { workout: decodeWorkout(input) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [input]);

  const w = parsed.workout;

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        <Field
          label="Share link or code"
          value={input}
          onChangeText={setInput}
          placeholder="Paste the link someone sent you"
          autoCapitalize="none"
          autoCorrect={false}
          multiline
        />
        {parsed.error ? <Text style={{ color: t.danger }}>{parsed.error}</Text> : null}
        {w ? (
          <Card>
            <H2>{w.name}</H2>
            {w.author ? <Body muted>by {w.author}</Body> : null}
            {w.description ? <Body>{w.description}</Body> : null}
            <Body muted>
              {w.type} · {w.items.length} exercises · ~{formatDuration(estimateWorkout(w).totalSec)}
            </Body>
            <View style={{ gap: 2, marginTop: 4 }}>
              {w.items.map((it, i) => (
                <Body key={it.id}>
                  {i + 1}. {it.exerciseName} — {describeSet(it)}
                </Body>
              ))}
            </View>
            <Button
              title="Save to my workouts"
              style={{ marginTop: 8 }}
              onPress={() => {
                saveWorkout(w);
                router.replace({ pathname: '/workout/[id]', params: { id: w.id } });
              }}
            />
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
