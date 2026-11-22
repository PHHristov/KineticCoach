import { ScrollView, Switch, Text, View } from 'react-native';
import { Body, Button, Card, Field, H2, Screen, Stepper, useTheme } from '../components/ui';
import { say, setVoiceEnabled } from '../lib/voice';
import { useStore } from '../lib/store';

export default function SettingsScreen() {
  const { settings, updateSettings } = useStore();
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
        <Card>
          <H2>Profile</H2>
          <Field
            label="Display name"
            value={settings.displayName}
            onChangeText={(displayName) => updateSettings({ displayName })}
            placeholder="Shown as the author of workouts you share"
          />
        </Card>
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
