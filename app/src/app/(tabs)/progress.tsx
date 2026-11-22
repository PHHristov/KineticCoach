import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { ProgressBadge } from '../../components/ProgressBadge';
import { Body, Card, H1, H2, Screen, useTheme } from '../../components/ui';
import { exerciseSummaries, metricUnit, metricValue, progression } from '../../lib/stats';
import { formExercise } from '../../lib/pose/exercises';
import { useStore } from '../../lib/store';

export default function ProgressScreen() {
  const { history, ready, formChecks } = useStore();
  const t = useTheme();
  const summaries = useMemo(() => exerciseSummaries(history), [history]);

  return (
    <Screen>
      <FlatList
        data={summaries}
        keyExtractor={(s) => s.exerciseId}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32, maxWidth: 720, width: '100%', alignSelf: 'center' }}
        ListHeaderComponent={
          <View style={{ gap: 6, marginBottom: 6 }}>
            <H1>Exercises done</H1>
            <Body muted>Tap an exercise to see how you have progressed. Compared with about three weeks ago.</Body>
          </View>
        }
        ListFooterComponent={
          formChecks.length ? (
            <View style={{ gap: 8, marginTop: 16 }}>
              <H2>Form checks</H2>
              {formChecks.slice(0, 20).map((fc) => {
                const score = fc.avgScore === null ? null : Math.round(fc.avgScore);
                const color = score === null ? t.muted : score >= 85 ? '#12B76A' : score >= 65 ? '#F79009' : t.danger;
                return (
                  <Card key={fc.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>{formExercise(fc.exercise).name}</Text>
                      <Body muted style={{ fontSize: 13 }}>
                        {new Date(fc.finishedAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · {fc.reps} rep
                        {fc.reps === 1 ? '' : 's'}
                      </Body>
                    </View>
                    {score !== null ? (
                      <Text style={{ color, fontSize: 20, fontWeight: '800' }} accessibilityLabel={`Average score ${score}`}>
                        {score}
                      </Text>
                    ) : null}
                  </Card>
                );
              })}
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          ready ? (
            <Card>
              <H2>Nothing logged yet</H2>
              <Body muted>Finish a workout and log your weight and reps for each set. Your exercises will show up here.</Body>
            </Card>
          ) : undefined
        }
        renderItem={({ item }) => {
          const p = progression(item);
          const latest = item.entries[item.entries.length - 1];
          return (
            <Pressable onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: item.exerciseId } })} accessibilityRole="link">
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>{item.exerciseName}</Text>
                  <Body muted style={{ fontSize: 13 }}>
                    {item.entries.length} session{item.entries.length === 1 ? '' : 's'} · last {new Date(latest.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  </Body>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={{ color: t.text, fontSize: 18, fontWeight: '800' }}>
                    {metricValue(item, latest)} <Text style={{ fontSize: 13, color: t.muted }}>{metricUnit(item)}</Text>
                  </Text>
                  <ProgressBadge verdict={p.verdict} />
                </View>
              </Card>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}
