import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Button, Card, Field, H2, Screen, useTheme } from '../../components/ui';
import { clone, formatDuration, uid } from '../../lib/id';
import { estimateWorkout } from '../../lib/plan';
import { useStore } from '../../lib/store';
import type { Plan } from '../../lib/types';

const MAX_DAYS = 7;

export default function EditPlan() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { plans, workouts, savePlan, settings, schedule, setSchedule, ready } = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const isNew = id === 'new';
  const [draft, setDraft] = useState<Plan | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!ready || draft) return;
    const existing = plans.find((p) => p.id === id);
    const now = Date.now();
    setDraft(
      existing
        ? clone(existing)
        : { id: uid(), name: '', description: '', author: settings.displayName, workoutIds: [], createdAt: now, updatedAt: now },
    );
  }, [ready, id, plans, draft, settings.displayName]);

  if (!draft) return <Screen />;

  const update = (patch: Partial<Plan>) => setDraft({ ...draft, ...patch });
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= draft.workoutIds.length) return;
    const ids = draft.workoutIds.slice();
    [ids[i], ids[j]] = [ids[j], ids[i]];
    update({ workoutIds: ids });
  };
  const canSave = draft.name.trim().length > 0 && draft.workoutIds.length > 0;

  const save = () => {
    savePlan({ ...draft, name: draft.name.trim() });
    // If the number of days changed on the active plan, the old weekday choice no longer fits.
    if (schedule?.planId === draft.id && schedule.days.length !== draft.workoutIds.length) setSchedule(null);
    if (isNew) router.replace({ pathname: '/plan/[id]', params: { id: draft.id } });
    else router.back();
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: isNew ? 'New plan' : 'Edit plan' }} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 + insets.bottom, maxWidth: 720, width: '100%', alignSelf: 'center' }}
      >
        <Field label="Name" value={draft.name} onChangeText={(name) => update({ name })} placeholder="e.g. 3-day full body" />
        <Field label="Description" value={draft.description} onChangeText={(description) => update({ description })} placeholder="Who is it for? What is the goal?" multiline />

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <H2>Training days</H2>
          <Body muted>{draft.workoutIds.length} day{draft.workoutIds.length === 1 ? '' : 's'} a week</Body>
        </View>
        <Body muted style={{ fontSize: 13 }}>Each workout is one training day. The same workout can be used on more than one day.</Body>

        {draft.workoutIds.map((wid, i) => {
          const w = workouts.find((x) => x.id === wid);
          return (
            <Card key={`${wid}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ color: t.muted, fontWeight: '800', width: 46 }}>Day {i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontWeight: '700' }}>{w?.name ?? 'Deleted workout'}</Text>
                {w ? <Body muted style={{ fontSize: 13 }}>~{formatDuration(estimateWorkout(w).totalSec)}</Body> : null}
              </View>
              <Button title="↑" variant="secondary" disabled={i === 0} onPress={() => move(i, -1)} />
              <Button title="↓" variant="secondary" disabled={i === draft.workoutIds.length - 1} onPress={() => move(i, 1)} />
              <Button title="✕" variant="ghost" onPress={() => update({ workoutIds: draft.workoutIds.filter((_, j) => j !== i) })} />
            </Card>
          );
        })}

        <Button
          title={draft.workoutIds.length >= MAX_DAYS ? 'A week has 7 days' : '+ Add training day'}
          variant="secondary"
          disabled={draft.workoutIds.length >= MAX_DAYS}
          onPress={() => setPicking(true)}
        />
      </ScrollView>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 16 + insets.bottom }}>
        <Button big title="Save plan" disabled={!canSave} onPress={save} style={{ maxWidth: 688, width: '100%', alignSelf: 'center' }} />
      </View>

      <Modal visible={picking} animationType="slide" onRequestClose={() => setPicking(false)}>
        <Screen style={{ paddingTop: insets.top }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 0 }}>
            <H2>Choose a workout</H2>
            <Button title="Cancel" variant="ghost" onPress={() => setPicking(false)} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 8, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
            {workouts.length === 0 ? <Body muted>You have no workouts yet. Create one in the Workouts tab first.</Body> : null}
            {workouts.map((w) => (
              <Pressable
                key={w.id}
                accessibilityRole="button"
                accessibilityLabel={`Add ${w.name}`}
                onPress={() => {
                  update({ workoutIds: [...draft.workoutIds, w.id] });
                  setPicking(false);
                }}
              >
                <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>{w.name}</Text>
                    <Body muted style={{ fontSize: 13 }}>
                      {w.type} · {w.items.length} exercises · ~{formatDuration(estimateWorkout(w).totalSec)}
                    </Body>
                  </View>
                  <Text style={{ color: t.primary, fontSize: 24, fontWeight: '700' }}>+</Text>
                </Card>
              </Pressable>
            ))}
          </ScrollView>
        </Screen>
      </Modal>
    </Screen>
  );
}
