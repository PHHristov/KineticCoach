import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { Body, Button, Card, H1, Screen, useTheme } from '../components/ui';
import { relativeDayLabel } from '../lib/calendar';
import { useStore } from '../lib/store';

/** "Who's training?" — pick a profile, or add one. */
export default function ProfilesScreen() {
  const { users, user, switchUser } = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  const pick = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await switchUser(id);
      router.replace('/');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 + insets.bottom, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
        <H1>Who's training?</H1>
        <Body muted>Each profile has its own workouts, plans, history and form checks on this device.</Body>
        {users.map((u) => (
          <Pressable key={u.id} onPress={() => pick(u.id)} accessibilityRole="button" accessibilityLabel={`Train as ${u.name}`} disabled={busy}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Avatar name={u.name} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>{u.name}</Text>
                <Body muted style={{ fontSize: 13 }}>Last active {relativeDayLabel(new Date(u.lastActiveAt)).toLowerCase()}</Body>
              </View>
              {u.id === user?.id ? <Text style={{ color: t.primary, fontWeight: '800', fontSize: 12 }}>CURRENT</Text> : null}
            </Card>
          </Pressable>
        ))}
        <Button title="+ Add profile" variant="secondary" onPress={() => router.push({ pathname: '/profile-edit', params: { id: 'new' } })} />
      </ScrollView>
    </Screen>
  );
}
