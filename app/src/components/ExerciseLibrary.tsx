import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { confirm } from '../lib/confirm';
import { useStore } from '../lib/store';
import { CATEGORIES, type Exercise, type ExerciseCategory, type ExerciseMode } from '../lib/types';
import { Body, Button, Card, Chip, Field, H2, useTheme } from './ui';

/**
 * Searchable exercise list with a "create your own" form.
 * With `onPick` it acts as a picker; without it, it is the library browser.
 */
export function ExerciseLibrary({ onPick }: { onPick?: (e: Exercise) => void }) {
  const { exercises, addCustomExercise, deleteCustomExercise } = useStore();
  const t = useTheme();
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<ExerciseCategory | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exercises.filter(
      (e) => (!cat || e.category === cat) && (!q || e.name.toLowerCase().includes(q)),
    );
  }, [exercises, query, cat]);

  return (
    <FlatList
      data={filtered}
      keyExtractor={(e) => e.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 40, maxWidth: 720, width: '100%', alignSelf: 'center' }}
      ListHeaderComponent={
        <View style={{ gap: 10, marginBottom: 6 }}>
          <Field placeholder="Search exercises" value={query} onChangeText={setQuery} accessibilityLabel="Search exercises" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            <Chip label="All" active={!cat} onPress={() => setCat(null)} />
            {CATEGORIES.map((c) => (
              <Chip key={c} label={c} active={cat === c} onPress={() => setCat(cat === c ? null : c)} />
            ))}
          </ScrollView>
          {creating ? (
            <CreateExerciseForm
              initialName={query}
              onCancel={() => setCreating(false)}
              onSave={(data) => {
                const ex = addCustomExercise(data);
                setCreating(false);
                setQuery('');
                onPick?.(ex);
              }}
            />
          ) : (
            <Button title="+ Create your own exercise" variant="ghost" onPress={() => setCreating(true)} />
          )}
        </View>
      }
      ListEmptyComponent={<Body muted>No exercises match. Create your own above.</Body>}
      renderItem={({ item }) => (
        <Pressable
          onPress={onPick ? () => onPick(item) : undefined}
          disabled={!onPick}
          accessibilityRole={onPick ? 'button' : undefined}
          accessibilityLabel={onPick ? `Add ${item.name}` : item.name}
        >
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>
                {item.name}
                {item.custom ? <Text style={{ color: t.primary, fontSize: 12 }}>  CUSTOM</Text> : null}
              </Text>
              <Body muted style={{ fontSize: 13 }}>
                {item.category} · {item.defaultMode === 'reps' ? 'Reps' : 'Timed'}
                {item.description ? ` · ${item.description}` : ''}
              </Body>
            </View>
            {onPick ? (
              <Text style={{ color: t.primary, fontSize: 24, fontWeight: '700' }}>+</Text>
            ) : item.custom ? (
              <Button
                title="Delete"
                variant="ghost"
                onPress={async () => {
                  if (await confirm('Delete exercise', `Delete "${item.name}"? Workouts that use it keep working.`, 'Delete')) {
                    deleteCustomExercise(item.id);
                  }
                }}
              />
            ) : null}
          </Card>
        </Pressable>
      )}
    />
  );
}

function CreateExerciseForm({
  initialName,
  onSave,
  onCancel,
}: {
  initialName: string;
  onSave: (e: Omit<Exercise, 'id' | 'custom'>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState<ExerciseCategory>('Full body');
  const [mode, setMode] = useState<ExerciseMode>('reps');
  const [description, setDescription] = useState('');

  return (
    <Card>
      <H2>New exercise</H2>
      <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Archer push-up" autoFocus />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {CATEGORIES.map((c) => (
          <Chip key={c} label={c} active={category === c} onPress={() => setCategory(c)} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Chip label="Counted in reps" active={mode === 'reps'} onPress={() => setMode('reps')} />
        <Chip label="Timed" active={mode === 'time'} onPress={() => setMode('time')} />
      </View>
      <Field label="How to do it (optional)" value={description} onChangeText={setDescription} multiline />
      <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
        <Button title="Cancel" variant="secondary" onPress={onCancel} />
        <Button
          title="Save exercise"
          disabled={!name.trim()}
          onPress={() => onSave({ name: name.trim(), category, defaultMode: mode, description: description.trim() || undefined })}
        />
      </View>
    </Card>
  );
}
