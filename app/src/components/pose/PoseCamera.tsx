import { useEffect } from 'react';
import { Text, View } from 'react-native';
import type { PoseCameraProps } from './types';

/**
 * Native (iOS/Android) placeholder. Live pose tracking on phones needs a native
 * camera + MediaPipe module in a development build; until then, the form check
 * runs in the browser (including the phone's browser).
 */
export default function PoseCamera({ onStatus }: PoseCameraProps) {
  useEffect(() => {
    onStatus({
      kind: 'error',
      message:
        'Form check runs in the browser for now. Open KineticCoach in Chrome or Safari on this phone to use it; the native camera version is coming.',
    });
  }, [onStatus]);
  return <View style={{ flex: 1, backgroundColor: '#000' }}><Text style={{ color: '#000' }}> </Text></View>;
}
