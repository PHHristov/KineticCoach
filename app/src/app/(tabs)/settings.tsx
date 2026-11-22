import { router } from 'expo-router';
import { ScrollView, Switch, Text, View } from 'react-native';
import { Avatar } from '../../components/Avatar';
import { Body, Button, Card, H2, Screen, Stepper, useTheme } from '../../components/ui';
import { say, setVoiceEnabled } from '../../lib/voice';
import { useStore } from '../../lib/store';

export default function SettingsScreen() {
  const { settings, updateSettings, user, users } = useStore();
  const t = useTheme();

  const Toggle = ({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>{label}</Text>
        <Body muted style={{ fontSize: 13 }}>{hint}</Body>
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        {user ? (
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Avatar name={user.name} size={52} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontSize: 20, fontWeight: '800' }}>{user.name}</Text>
                <Body muted style={{ fontSize: 13 }}>
                  {[user.weightKg && `${user.weightKg} kg`, user.heightCm && `${user.heightCm} cm`].filter(Boolean).join(' · ') ||
                    'Shown as the author of workouts you share'}
                </Body>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Button title="Edit profile" variant="secondary" onPress={() => router.push({ pathname: '/profile-edit', params: { id: user.id } })} />
              <Button title={users.length > 1 ? 'Switch profile' : 'Add a profile'} variant="secondary" onPress={() => router.push(users.length > 1 ? '/profiles' : { pathname: '/profile-edit', params: { id: 'new' } })} />
            </View>
          </Card>
        ) : null}
        <Card style={{ gap: 14 }}>
          <H2>Voice coach</H2>
          <Toggle
            label="Voice commands"
            hint="Announces each exercise, rests and what comes next."
            value={settings.voiceEnabled}
            onChange={(voiceEnabled) => updateSettings({ voiceEnabled })}
          />
          <Toggle
            label="3-2-1 countdown"
            hint="Counts down the last seconds of every timed set and rest."
            value={settings.countdownBeeps}
            onChange={(countdownBeeps) => updateSettings({ countdownBeeps })}
          />
          <Stepper label="Get ready time" suffix="s" step={5} min={0} max={60} value={settings.prepSec} onChange={(prepSec) => updateSettings({ prepSec })} />
          <Button
            title="Test voice"
            variant="secondary"
            onPress={() => {
              setVoiceEnabled(true);
              say('Ready? Three sets of ten push-ups. Go!');
            }}
          />
        </Card>
      </ScrollView>
    </Screen>
  );
}
