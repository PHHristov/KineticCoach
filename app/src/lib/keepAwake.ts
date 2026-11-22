import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';

const TAG = 'kc-player';

/**
 * Keeps the screen on while mounted. Unlike `useKeepAwake`, it tolerates the
 * web wake lock not being granted yet (or at all) when the screen unmounts.
 */
export function useScreenAwake() {
  useEffect(() => {
    activateKeepAwakeAsync(TAG).catch(() => {});
    return () => {
      try {
        Promise.resolve(deactivateKeepAwake(TAG)).catch(() => {});
      } catch {
        // wake lock was never activated
      }
    };
  }, []);
}
