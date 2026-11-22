import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/tabs';
import { Text, View } from 'react-native';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { useStore } from '../../lib/store';
import { useTheme } from '../../components/ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

function icon(name: IconName, active: IconName) {
  return ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => (
    <Ionicons name={focused ? active : name} color={color as string} size={size} />
  );
}

export default function TabsLayout() {
  const t = useTheme();
  const { ready, error, user, needsProfilePick } = useStore();

  if (!ready) return <View style={{ flex: 1, backgroundColor: t.bg }} />;
  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, padding: 24, justifyContent: 'center', gap: 8 }}>
        <Text style={{ color: t.text, fontSize: 20, fontWeight: '800' }}>Couldn't open your data</Text>
        <Text style={{ color: t.muted, fontSize: 15 }}>{error}</Text>
      </View>
    );
  }
  if (!user) return <Redirect href={{ pathname: '/profile-edit', params: { id: 'new', first: '1' } }} />;
  if (needsProfilePick) return <Redirect href="/profiles" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: t.card },
        headerTintColor: t.text,
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.muted,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border },
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', headerTitle: 'KineticCoach', tabBarIcon: icon('home-outline', 'home') }} />
      <Tabs.Screen name="workouts" options={{ title: 'Workouts', tabBarIcon: icon('barbell-outline', 'barbell') }} />
      <Tabs.Screen name="plans" options={{ title: 'Plans', tabBarIcon: icon('calendar-outline', 'calendar') }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress', tabBarIcon: icon('trending-up-outline', 'trending-up') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('settings-outline', 'settings') }} />
    </Tabs>
  );
}
