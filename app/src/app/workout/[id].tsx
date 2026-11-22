import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Button, Card, Field, H1, H2, Screen, useTheme } from '../../components/ui';
import { confirm } from '../../lib/confirm';
import { clone, formatDuration, uid } from '../../lib/id';
import { describeSet, estimateWorkout } from '../../lib/plan';
import { shareLink } from '../../lib/share';
import { useStore } from '../../lib/store';

export default function WorkoutDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { workouts, deleteWorkout, saveWorkout, ready } = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const workout = workouts.find((w) => w.id === id);

  if (!ready) return <Screen />;
  if (!workout) {
    return (
      <Screen style={{ padding: 16, gap: 12 }}>
        <H2>Workout not found</H2>
        <Button title="Back to workouts" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  const est = estimateWorkout(workout);

  const onShare = async () => {
    const link = shareLink(workout);
    const message = `Try my workout "${workout.name}" on KineticCoach: ${link}`;
    setShareUrl(link);
    if (Platform.OS !== 'web') {
      try {
        await Share.share({ message, url: link });
      } catch {
        // user dismissed the share sheet
      }
      return;
    }
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { share?: Navigator['share'] }) : undefined;
    if (nav?.share) {
      try {
        await nav.share({ title: workout.name, text: `Try my workout "${workout.name}" on KineticCoach`, url: link });
        return;
      } catch {
        // dismissed or unsupported: fall through to copying
      }
    }
    try {
      await Clipboard.setStringAsync(link);
      setShareStatus('Link copied to clipboard. Anyone with it can import this workout.');
    } catch {
      setShareStatus('Copy this link and send it to anyone you want to share the workout with:');
    }
  };

  const onDuplicate = () => {
    const copy = { ...clone(workout), id: uid(), name: `${workout.name} (copy)`, createdAt: Date.now() };
    saveWorkout(copy);
    router.replace({ pathname: '/workout/[id]', params: { id: copy.id } });
  };

  const onDelete = async () => {
    if (await confirm('Delete workout', `Delete "${workout.name}"? This cannot be undone.`, 'Delete')) {
      deleteWorkout(workout.id);
      router.replace('/');
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

        <Button big title="▶  Start workout" onPress={() => router.push({ pathname: '/play/[id]', params: { id: workout.id } })} />

        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button title="Share" variant="secondary" onPress={onShare} />
          <Button title="Edit" variant="secondary" onPress={() => router.push({ pathname: '/edit/[id]', params: { id: workout.id } })} />
          <Button title="Duplicate" variant="secondary" onPress={onDuplicate} />
          <Button title="Delete" variant="ghost" onPress={onDelete} />
        </View>
        {shareUrl ? (
          <Card>
            <Body muted>{shareStatus ?? 'Share link:'}</Body>
            <Field value={shareUrl} editable={false} selectTextOnFocus accessibilityLabel="Share link" />
          </Card>
        ) : null}

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
