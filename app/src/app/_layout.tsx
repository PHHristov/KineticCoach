import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTheme } from '../components/ui';
import { StoreProvider } from '../lib/store';

/** Header button on every inner screen that jumps straight back to Home. */
function HomeButton() {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => router.dismissTo('/')}
      accessibilityRole="button"
      accessibilityLabel="Home"
      hitSlop={10}
      style={{ paddingHorizontal: 8 }}
    >
      <Ionicons name="home-outline" size={22} color={t.primary} />
    </Pressable>
  );
}

export default function RootLayout() {
  const t = useTheme();
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: t.card },
            headerTintColor: t.text,
            headerTitleStyle: { fontWeight: '700' },
            contentStyle: { backgroundColor: t.bg },
            headerRight: () => <HomeButton />,
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="exercises" options={{ title: 'Exercise library' }} />
          <Stack.Screen name="import" options={{ title: 'Import' }} />
          <Stack.Screen name="profiles" options={{ title: 'Profiles', headerBackVisible: false, gestureEnabled: false, headerRight: () => null }} />
          <Stack.Screen name="profile-edit" options={{ title: 'Profile', headerRight: () => null }} />
          <Stack.Screen name="workout/[id]" options={{ title: 'Workout' }} />
          <Stack.Screen name="edit/[id]" options={{ title: 'Edit workout' }} />
          <Stack.Screen name="plan/[id]" options={{ title: 'Plan' }} />
          <Stack.Screen name="plan-edit/[id]" options={{ title: 'Edit plan' }} />
          <Stack.Screen name="exercise/[id]" options={{ title: 'Exercise progress' }} />
          <Stack.Screen name="play/[id]" options={{ headerShown: false, gestureEnabled: false, statusBarStyle: 'light' }} />
          <Stack.Screen name="form-check" options={{ headerShown: false, gestureEnabled: false, statusBarStyle: 'light' }} />
        </Stack>
      </StoreProvider>
    </SafeAreaProvider>
  );
}
