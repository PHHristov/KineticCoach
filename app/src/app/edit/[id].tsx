import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ExerciseLibrary } from '../../components/ExerciseLibrary';
import { Body, Button, Card, Chip, Field, H2, Screen, Stepper, useTheme } from '../../components/ui';
import { clone, formatDuration, uid } from '../../lib/id';
import { describeSet, estimateWorkout } from '../../lib/plan';
import { useStore } from '../../lib/store';
import { WORKOUT_TYPES, type Exercise, type Workout, type WorkoutItem } from '../../lib/types';

function blankWorkout(author: string): Workout {
  const now = Date.now();
  return { id: uid(), name: '', description: '', type: 'Bodyweight', author, items: [], createdAt: now, updatedAt: now };
}

function itemFromExercise(e: Exercise): WorkoutItem {
  return {
    id: uid(),
    exerciseId: e.id,
    exerciseName: e.name,
    mode: e.defaultMode,
    sets: 3,
    reps: 10,
    durationSec: 30,
    weightKg: 0,
    restBetweenSetsSec: 30,
    restAfterSec: 60,
  };
}

export default function EditWorkout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { workouts, saveWorkout, settings, ready } = useStore();
  const insets = useSafeAreaInsets();
  const isNew = id === 'new';
  const [draft, setDraft] = useState<Workout | null>(null);
  const [picking, setPicking] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || draft) return;
    const existing = workouts.find((w) => w.id === id);
    setDraft(existing ? clone(existing) : blankWorkout(settings.displayName));
  }, [ready, id, workouts, draft, settings.displayName]);

  if (!draft) return <Screen />;

  const update = (patch: Partial<Workout>) => setDraft({ ...draft, ...patch });
  const updateItem = (itemId: string, patch: Partial<WorkoutItem>) =>
    update({ items: draft.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) });
  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= draft.items.length) return;
    const items = draft.items.slice();
    [items[index], items[j]] = [items[j], items[index]];
    update({ items });
  };

  const est = estimateWorkout(draft);
  const canSave = draft.name.trim().length > 0 && draft.items.length > 0;

  const save = () => {
    saveWorkout({ ...draft, name: draft.name.trim() });
    if (isNew) router.replace({ pathname: '/workout/[id]', params: { id: draft.id } });
    else router.back();
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: isNew ? 'New workout' : 'Edit workout' }} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 + insets.bottom, maxWidth: 720, width: '100%', alignSelf: 'center' }}
      >
        <Field label="Name" value={draft.name} onChangeText={(name) => update({ name })} placeholder="e.g. Monday upper body" />
        <Field
          label="Description"
          value={draft.description}
          onChangeText={(description) => update({ description })}
          placeholder="What is this workout for?"
          multiline
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {WORKOUT_TYPES.map((wt) => (
            <Chip key={wt} label={wt} active={draft.type === wt} onPress={() => update({ type: wt })} />
          ))}
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
          <H2>Exercises</H2>
          <Body muted>
            {est.sets} sets · ~{formatDuration(est.totalSec)} ({formatDuration(est.restSec)} rest)
          </Body>
        </View>

        {draft.items.map((item, index) => (
          <ItemEditor
            key={item.id}
            item={item}
            index={index}
            count={draft.items.length}
            isLast={index === draft.items.length - 1}
            expanded={expanded === item.id}
            onToggle={() => setExpanded(expanded === item.id ? null : item.id)}
            onChange={(patch) => updateItem(item.id, patch)}
            onMove={(dir) => move(index, dir)}
            onRemove={() => update({ items: draft.items.filter((i) => i.id !== item.id) })}
          />
        ))}

        <Button title="+ Add exercise" variant="secondary" onPress={() => setPicking(true)} />
      </ScrollView>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 16 + insets.bottom }}>
        <Button big title="Save workout" disabled={!canSave} onPress={save} style={{ maxWidth: 688, width: '100%', alignSelf: 'center' }} />
      </View>

      <Modal visible={picking} animationType="slide" onRequestClose={() => setPicking(false)}>
        <Screen style={{ paddingTop: insets.top }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 0 }}>
            <H2>Add exercise</H2>
            <Button title="Done" variant="ghost" onPress={() => setPicking(false)} />
          </View>
          <ExerciseLibrary
            onPick={(e) => {
              const it = itemFromExercise(e);
              update({ items: [...draft.items, it] });
              setExpanded(it.id);
              setPicking(false);
            }}
          />
        </Screen>
      </Modal>
    </Screen>
  );
}

function ItemEditor({
  item,
  index,
  count,
  isLast,
  expanded,
  onToggle,
  onChange,
  onMove,
  onRemove,
}: {
  item: WorkoutItem;
  index: number;
  count: number;
  isLast: boolean;
  expanded: boolean;
  onToggle: () => void;
  onChange: (p: Partial<WorkoutItem>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const t = useTheme();
  return (
    <Card>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityLabel={`Edit ${item.exerciseName}`}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ color: t.muted, fontWeight: '700', width: 22 }}>{index + 1}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>{item.exerciseName}</Text>
            <Body muted style={{ fontSize: 13 }}>
              {describeSet(item)} · rest {item.restBetweenSetsSec}s
              {!isLast && item.restAfterSec > 0 ? ` · then ${item.restAfterSec}s` : ''}
            </Body>
          </View>
          <Text style={{ color: t.primary, fontWeight: '700' }}>{expanded ? 'Close' : 'Edit'}</Text>
        </View>
      </Pressable>

      {expanded ? (
        <View style={{ gap: 12, marginTop: 8 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Chip label="Reps" active={item.mode === 'reps'} onPress={() => onChange({ mode: 'reps' })} />
            <Chip label="Timed" active={item.mode === 'time'} onPress={() => onChange({ mode: 'time' })} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Stepper label="Sets" value={item.sets} min={1} max={50} onChange={(sets) => onChange({ sets })} />
            {item.mode === 'reps' ? (
              <Stepper label="Reps" value={item.reps} min={1} max={1000} onChange={(reps) => onChange({ reps })} />
            ) : (
              <Stepper label="Duration" suffix="s" step={5} value={item.durationSec} min={5} max={3600} onChange={(durationSec) => onChange({ durationSec })} />
            )}
            <Stepper label="Weight" suffix="kg" step={2.5} value={item.weightKg} min={0} max={1000} onChange={(weightKg) => onChange({ weightKg })} />
            <Stepper label="Rest between sets" suffix="s" step={5} value={item.restBetweenSetsSec} min={0} max={3600} onChange={(restBetweenSetsSec) => onChange({ restBetweenSetsSec })} />
            {!isLast ? (
              <Stepper label="Rest after exercise" suffix="s" step={5} value={item.restAfterSec} min={0} max={3600} onChange={(restAfterSec) => onChange({ restAfterSec })} />
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button title="↑ Up" variant="secondary" disabled={index === 0} onPress={() => onMove(-1)} />
            <Button title="↓ Down" variant="secondary" disabled={index === count - 1} onPress={() => onMove(1)} />
            <View style={{ flex: 1 }} />
            <Button title="Remove" variant="ghost" onPress={onRemove} />
          </View>
        </View>
      ) : null}
    </Card>
  );
}
