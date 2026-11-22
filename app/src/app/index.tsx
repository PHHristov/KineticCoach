import { Link, router } from 'expo-router';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Button, Card, H1, H2, Screen, useTheme } from '../components/ui';
import { formatDuration } from '../lib/id';
import { estimateWorkout } from '../lib/plan';
import { useStore } from '../lib/store';

export default function Home() {
  const { workouts, history, ready } = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Screen>
      <FlatList
        data={workouts}
        keyExtractor={(w) => w.id}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 + insets.bottom, maxWidth: 720, width: '100%', alignSelf: 'center' }}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 4 }}>
            <H1>Your workouts</H1>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Button title="+ New workout" onPress={() => router.push('/edit/new')} />
              <Button title="Import" variant="secondary" onPress={() => router.push('/import')} />
              <Button title="Exercises" variant="secondary" onPress={() => router.push('/exercises')} />
              <Button title="Settings" variant="secondary" onPress={() => router.push('/settings')} />
            </View>
            {history.length > 0 ? (
              <Body muted>
                {history.length} workout{history.length === 1 ? '' : 's'} completed · last: {history[0].workoutName}
              </Body>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          ready ? (
            <Card>
              <H2>No workouts yet</H2>
              <Body muted>Create one from the exercise library, or import a workout someone shared with you.</Body>
            </Card>
          ) : undefined
        }
        renderItem={({ item }) => {
          const est = estimateWorkout(item);
          return (
            <Link href={{ pathname: '/workout/[id]', params: { id: item.id } }} asChild>
              <Pressable accessibilityRole="link">
                <Card>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <H2>{item.name}</H2>
                    <Text style={{ color: t.primary, fontWeight: '700', fontSize: 12 }}>{item.type.toUpperCase()}</Text>
                  </View>
                  <Body muted>
                    {item.items.length} exercises · {est.sets} sets · ~{formatDuration(est.totalSec)}
                    {item.author ? ` · by ${item.author}` : ''}
                  </Body>
                </Card>
              </Pressable>
            </Link>
          );
        }}
      />
    </Screen>
  );
}
