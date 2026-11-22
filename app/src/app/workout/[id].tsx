import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShare } from '../../components/ShareButton';
import { Body, Button, Card, Chip, H1, H2, Screen, useTheme } from '../../components/ui';
import { confirm } from '../../lib/confirm';
import { clone, formatDuration, uid } from '../../lib/id';
import { describeSet, estimateWorkout } from '../../lib/plan';
import { shareLink } from '../../lib/share';
import { useStore } from '../../lib/store';

export default function WorkoutDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { workouts, plans, deleteWorkout, saveWorkout, ready } = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { share, panel } = useShare();
  const workout = workouts.find((w) => w.id === id);

  if (!ready) return <Screen />;
  if (!workout) {
    return (
      <Screen style={{ padding: 16, gap: 12 }}>
        <H2>Workout not found</H2>
        <Button title="Back to workouts" onPress={() => router.replace('/workouts')} />
      </Screen>
    );
  }

  const est = estimateWorkout(workout);
  const inPlans = plans.filter((p) => p.workoutIds.includes(workout.id));

  const onDuplicate = () => {
    const copy = { ...clone(workout), id: uid(), name: `${workout.name} (copy)`, createdAt: Date.now() };
    saveWorkout(copy);
    router.replace({ pathname: '/workout/[id]', params: { id: copy.id } });
  };

  const onDelete = async () => {
    const note = inPlans.length ? ` It will also be removed from ${inPlans.map((p) => `"${p.name}"`).join(', ')}.` : '';
    if (await confirm('Delete workout', `Delete "${workout.name}"? This cannot be undone.${note}`, 'Delete')) {
      deleteWorkout(workout.id);
      router.replace('/workouts');
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: workout.name }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 + insets.bottom, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        <View style={{ gap: 4 }}>
          <Text style={{ color: t.primary, fontWeight: '800', fontSize: 12 }}>{workout.type.toUpperCase()}</Text>
          <H1>{workout.name}</H1>
          {workout.description ? <Body muted>{workout.description}</Body> : null}
          <Body muted>
            ~{formatDuration(est.totalSec)} total · {est.sets} sets · {formatDuration(est.restSec)} rest
            {workout.author ? ` · by ${workout.author}` : ''}
          </Body>
        </View>

        {inPlans.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <Body muted>Part of:</Body>
            {inPlans.map((p) => (
              <Chip key={p.id} label={p.name} onPress={() => router.push({ pathname: '/plan/[id]', params: { id: p.id } })} />
            ))}
          </View>
        ) : null}

        <Button big title="▶  Start workout" onPress={() => router.push({ pathname: '/play/[id]', params: { id: workout.id } })} />

        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button title="Share" variant="secondary" onPress={() => share(workout.name, shareLink(workout))} />
          <Button title="Edit" variant="secondary" onPress={() => router.push({ pathname: '/edit/[id]', params: { id: workout.id } })} />
          <Button title="Duplicate" variant="secondary" onPress={onDuplicate} />
          <Button title="Delete" variant="ghost" onPress={onDelete} />
        </View>
        {panel}

        {workout.items.map((item, i) => {
          const last = i === workout.items.length - 1;
          return (
            <View key={item.id} style={{ gap: 8 }}>
              <Card>
                <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>
                  {i + 1}. {item.exerciseName}
                </Text>
                <Body muted>
                  {describeSet(item)}
                  {item.sets > 1 ? ` · ${item.restBetweenSetsSec}s rest between sets` : ''}
                </Body>
              </Card>
              {!last && item.restAfterSec > 0 ? (
                <Text style={{ color: t.rest, fontWeight: '700', textAlign: 'center', fontSize: 13 }}>
                  Rest {item.restAfterSec}s
                </Text>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
