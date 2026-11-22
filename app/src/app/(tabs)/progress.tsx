import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { ProgressBadge } from '../../components/ProgressBadge';
import { Body, Card, H1, H2, Screen, useTheme } from '../../components/ui';
import { exerciseSummaries, metricUnit, metricValue, progression } from '../../lib/stats';
import { useStore } from '../../lib/store';

export default function ProgressScreen() {
  const { history, ready } = useStore();
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
