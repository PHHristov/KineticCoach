import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { Body, Button, Card, Chip, Field, H1, H2, Screen, useTheme } from '../components/ui';
import { confirm } from '../lib/confirm';
import { useStore } from '../lib/store';
import type { Experience, Goal } from '../lib/types';

const GOALS: { id: Goal; label: string }[] = [
  { id: 'strength', label: 'Get stronger' },
  { id: 'muscle', label: 'Build muscle' },
  { id: 'fitness', label: 'General fitness' },
  { id: 'weight-loss', label: 'Lose weight' },
  { id: 'mobility', label: 'Mobility' },
];
const LEVELS: { id: Experience; label: string }[] = [
  { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
];

/** Parses an optional number field; empty → undefined, out of range → error text. */
function parseOptional(text: string, min: number, max: number): { value?: number; error?: string } {
  const t = text.trim().replace(',', '.');
  if (!t) return {};
  const v = Number(t);
  if (!Number.isFinite(v) || v < min || v > max) return { error: `Enter a number between ${min} and ${max}` };
  return { value: v };
}

/** Create a profile (id = "new") or edit an existing one. */
export default function ProfileEditScreen() {
  const { id, first } = useLocalSearchParams<{ id: string; first?: string }>();
  const { users, user, createUser, updateUser, deleteUser } = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const isNew = id === 'new';
  const existing = users.find((u) => u.id === id);
  const isFirst = first === '1' || users.length === 0;

  const [name, setName] = useState(existing?.name ?? '');
  const [weight, setWeight] = useState(existing?.weightKg?.toString() ?? '');
  const [height, setHeight] = useState(existing?.heightCm?.toString() ?? '');
  const [birthYear, setBirthYear] = useState(existing?.birthYear?.toString() ?? '');
  const [goal, setGoal] = useState<Goal | undefined>(existing?.goal);
  const [experience, setExperience] = useState<Experience | undefined>(existing?.experience);
  const [saving, setSaving] = useState(false);

  // If the profile list loads after this screen opened, fill the form in.
  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setWeight(existing.weightKg?.toString() ?? '');
    setHeight(existing.heightCm?.toString() ?? '');
    setBirthYear(existing.birthYear?.toString() ?? '');
    setGoal(existing.goal);
    setExperience(existing.experience);
  }, [existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const thisYear = new Date().getFullYear();
  const w = parseOptional(weight, 25, 400);
  const h = parseOptional(height, 100, 250);
  const b = parseOptional(birthYear, thisYear - 110, thisYear - 5);
  const nameTaken = users.some((u) => u.id !== id && u.name.trim().toLowerCase() === name.trim().toLowerCase());
  const valid = name.trim().length > 0 && !w.error && !h.error && !b.error && !nameTaken;

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    const fields = { name: name.trim(), weightKg: w.value, heightCm: h.value, birthYear: b.value ? Math.round(b.value) : undefined, goal, experience };
    try {
      if (isNew) {
        await createUser(fields);
        router.dismissTo('/');
      } else if (existing) {
        await updateUser({ ...existing, ...fields });
        router.back();
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    const ok = await confirm(
      `Delete ${existing.name}?`,
      `This permanently deletes ${existing.name}'s workouts, plans, schedule, workout history and form checks from this device. It can't be undone.`,
      'Delete',
    );
    if (!ok) return;
    await deleteUser(existing.id);
    router.dismissTo('/');
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: isNew ? 'New profile' : 'Edit profile', headerBackVisible: !isFirst }} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 + insets.bottom, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
        {isFirst ? (
          <View style={{ gap: 6 }}>
            <H1>Welcome to KineticCoach</H1>
            <Body muted>Create your profile to start. Your data stays on this device.</Body>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar name={name || '?'} size={56} />
          <View style={{ flex: 1 }}>
            <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Alex" autoFocus={isNew} autoCapitalize="words" />
          </View>
        </View>
        {nameTaken ? <Text style={{ color: t.danger }}>There's already a profile with that name.</Text> : null}

        <Card style={{ gap: 12 }}>
          <H2>About you (optional)</H2>
          <Body muted style={{ fontSize: 13 }}>Used to tailor plans and track progress later. You can fill this in any time.</Body>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <View style={{ flexGrow: 1, flexBasis: 120 }}>
              <Field label="Body weight (kg)" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="e.g. 78" />
            </View>
            <View style={{ flexGrow: 1, flexBasis: 120 }}>
              <Field label="Height (cm)" value={height} onChangeText={setHeight} keyboardType="number-pad" placeholder="e.g. 180" />
            </View>
            <View style={{ flexGrow: 1, flexBasis: 120 }}>
              <Field label="Birth year" value={birthYear} onChangeText={setBirthYear} keyboardType="number-pad" placeholder="e.g. 1990" />
            </View>
          </View>
          {[w.error && `Body weight: ${w.error}`, h.error && `Height: ${h.error}`, b.error && `Birth year: ${b.error}`]
            .filter(Boolean)
            .map((e) => (
              <Text key={e as string} style={{ color: t.danger, fontSize: 13 }}>
                {e}
              </Text>
            ))}
          <Text style={{ color: t.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>Goal</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {GOALS.map((g) => (
              <Chip key={g.id} label={g.label} active={goal === g.id} onPress={() => setGoal(goal === g.id ? undefined : g.id)} />
            ))}
          </View>
          <Text style={{ color: t.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>Experience</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {LEVELS.map((l) => (
              <Chip key={l.id} label={l.label} active={experience === l.id} onPress={() => setExperience(experience === l.id ? undefined : l.id)} />
            ))}
          </View>
        </Card>

        <Button big title={isNew ? (isFirst ? 'Create profile and start' : 'Create profile') : 'Save'} disabled={!valid || saving} onPress={save} />

        {!isNew && existing ? (
          <View style={{ gap: 8, marginTop: 8 }}>
            {existing.id === user?.id && users.length === 1 ? (
              <Body muted style={{ fontSize: 13 }}>This is the only profile. Deleting it removes all data and starts fresh.</Body>
            ) : null}
            <Button title={`Delete ${existing.name}`} variant="danger" onPress={remove} />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
