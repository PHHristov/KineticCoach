import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { ProgressBadge } from '../../components/ProgressBadge';
import { ProgressChart } from '../../components/ProgressChart';
import { Body, Button, Card, H1, H2, Screen, useTheme } from '../../components/ui';
import {
  describeProgression,
  exerciseSummaries,
  formatKg,
  metricUnit,
  metricValue,
  progression,
} from '../../lib/stats';
import { useStore } from '../../lib/store';
import type { LoggedSet } from '../../lib/types';

function setText(s: LoggedSet): string {
  if (s.mode === 'time') return s.weightKg > 0 ? `${s.durationSec}s @ ${s.weightKg} kg` : `${s.durationSec}s`;
  return s.weightKg > 0 ? `${s.weightKg} × ${s.reps}` : `${s.reps} reps`;
}

export default function ExerciseProgress() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { history, ready } = useStore();
  const t = useTheme();
  const summary = useMemo(() => exerciseSummaries(history).find((s) => s.exerciseId === id), [history, id]);

  if (!ready) return <Screen />;
  if (!summary) {
    return (
      <Screen style={{ padding: 16, gap: 12 }}>
        <H2>No sessions logged for this exercise yet.</H2>
        <Button title="Back to progress" onPress={() => router.replace('/progress')} />
      </Screen>
    );
  }

  const p = progression(summary);
  const unit = metricUnit(summary);
  const best = Math.max(...summary.entries.map((e) => metricValue(summary, e)));
  const best1RM = Math.max(...summary.entries.map((e) => e.best1RM));
  const totalVolume = summary.entries.reduce((n, e) => n + e.volume, 0);
  const metricName = summary.metric === 'weight' ? 'Heaviest weight per session' : summary.metric === 'time' ? 'Longest hold per session' : 'Most reps per session';

  return (
    <Screen>
      <Stack.Screen options={{ title: summary.exerciseName }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        <View style={{ gap: 6 }}>
          <H1>{summary.exerciseName}</H1>
          <ProgressBadge verdict={p.verdict} />
        </View>

        <Card>
          <Text style={{ color: t.text, fontSize: 17, fontWeight: '700', lineHeight: 24 }}>{describeProgression(summary, p)}</Text>
        </Card>

        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          <Tile label={summary.metric === 'weight' ? 'Best weight' : summary.metric === 'time' ? 'Longest hold' : 'Best reps'} value={`${best} ${unit}`} />
          {summary.metric === 'weight' ? <Tile label="Est. 1-rep max" value={`${Math.round(best1RM)} kg`} /> : null}
          {summary.metric === 'weight' ? <Tile label="Total lifted" value={formatKg(totalVolume)} /> : null}
          <Tile label="Sessions" value={String(summary.entries.length)} />
        </View>

        <Card>
          <H2>{metricName}</H2>
          <ProgressChart points={summary.entries.map((e) => ({ date: e.date, value: metricValue(summary, e) }))} unit={unit} />
        </Card>

        <H2>Sessions</H2>
        {summary.entries
          .slice()
          .reverse()
          .map((e) => (
            <Card key={e.sessionId}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ color: t.text, fontWeight: '700' }}>
                  {new Date(e.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                </Text>
                <Body muted style={{ fontSize: 13 }} numberOfLines={1}>{e.workoutName}</Body>
              </View>
              <Body>{e.sets.map(setText).join('  ·  ')}</Body>
              {e.volume > 0 ? <Body muted style={{ fontSize: 13 }}>{formatKg(e.volume)} lifted</Body> : null}
            </Card>
          ))}
      </ScrollView>
    </Screen>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <Card style={{ flexGrow: 1, flexBasis: 140, gap: 2 }}>
      <Text style={{ color: t.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
      <Text style={{ color: t.text, fontSize: 22, fontWeight: '800' }}>{value}</Text>
    </Card>
  );
}
