import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { getKineticPoseView, KineticPose, type PoseEventPayload } from '../../../modules/kinetic-pose';
import type { Point, Point3 } from '../../lib/pose/landmarks';
import { SkeletonOverlay } from './SkeletonOverlay';
import type { PoseCameraProps } from './types';

/** Turns the native flat [x, y, z, visibility] arrays back into landmark objects. */
function unpack(flat: number[]): Point3[] {
  const out: Point3[] = [];
  for (let i = 0; i + 3 < flat.length; i += 4) out.push({ x: flat[i], y: flat[i + 1], z: flat[i + 2], visibility: flat[i + 3] });
  return out;
}

/**
 * Native (iOS) camera + MediaPipe pose tracking. Asks for camera access when it opens.
 * Android still shows a "use the browser" message until it gets its own native module.
 */
export default function PoseCamera(props: PoseCameraProps) {
  if (props.demo) return <DemoCamera {...props} />;
  if (Platform.OS !== 'ios' || !KineticPose) return <Unsupported {...props} />;
  return <IosCamera {...props} />;
}

function IosCamera({ onFrame, onStatus, onStats, facing }: PoseCameraProps) {
  const [permission, setPermission] = useState<'checking' | 'granted' | 'denied'>('checking');
  const [overlay, setOverlay] = useState<{ points: Point[]; bad: number[]; aspect: number }>({ points: [], bad: [], aspect: 9 / 16 });
  const stats = useRef({ frames: 0, inferSum: 0, since: Date.now() });
  const cb = useRef({ onFrame, onStatus, onStats });
  cb.current = { onFrame, onStatus, onStats };

  // Ask for camera access as soon as the form check opens (iOS shows its prompt the first time).
  useEffect(() => {
    let cancelled = false;
    cb.current.onStatus({ kind: 'starting', message: 'Asking for camera access…' });
    KineticPose!.requestCameraPermission().then((p) => {
      if (cancelled) return;
      if (p === 'granted') {
        setPermission('granted');
      } else {
        setPermission('denied');
        cb.current.onStatus({
          kind: 'error',
          message:
            p === 'restricted'
              ? 'Camera access is restricted on this iPhone (for example by Screen Time), so the form check can’t use it.'
              : 'KineticCoach needs the camera to check your form. Allow it in Settings → KineticCoach → Camera, then come back.',
          action: p === 'restricted' ? undefined : 'settings',
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (permission !== 'granted') return <View style={{ flex: 1, backgroundColor: '#000' }} />;

  const NativeView = getKineticPoseView();
  const onPose = (e: { nativeEvent: PoseEventPayload }) => {
    const p = e.nativeEvent;
    const aspect = p.width / Math.max(1, p.height);
    const image = unpack(p.image);
    const bad = cb.current.onFrame({ t: p.t, image, world: unpack(p.world), aspect });
    setOverlay({ points: image, bad, aspect });

    const s = stats.current;
    s.frames++;
    s.inferSum += p.inferenceMs;
    const now = Date.now();
    if (now - s.since > 1000) {
      cb.current.onStats?.({ fps: Math.round((s.frames * 1000) / (now - s.since)), inferenceMs: Math.round(s.inferSum / s.frames) });
      stats.current = { frames: 0, inferSum: 0, since: now };
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <NativeView
        style={{ flex: 1 }}
        facing={facing}
        onPose={onPose}
        onStatus={(e) => cb.current.onStatus(e.nativeEvent.kind === 'running' ? { kind: 'running' } : (e.nativeEvent as never))}
      />
      <SkeletonOverlay points={overlay.points} bad={overlay.bad} aspect={overlay.aspect} />
    </View>
  );
}

/** Simulated reps instead of the camera (demo mode, and testing in the Simulator). */
function DemoCamera({ onFrame, onStatus, demo }: PoseCameraProps) {
  const [overlay, setOverlay] = useState<{ points: Point[]; bad: number[] }>({ points: [], bad: [] });
  const cb = useRef({ onFrame, onStatus });
  cb.current = { onFrame, onStatus };

  useEffect(() => {
    cb.current.onStatus({ kind: 'running' });
    const start = Date.now();
    let raf = 0;
    const loop = () => {
      const now = Date.now();
      const { image, world } = demo!((now - start) / 1000);
      const bad = cb.current.onFrame({ t: now, image, world, aspect: 1 });
      setOverlay({ points: image, bad });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [demo]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <SkeletonOverlay points={overlay.points} bad={overlay.bad} aspect={1} />
    </View>
  );
}

function Unsupported({ onStatus }: PoseCameraProps) {
  useEffect(() => {
    onStatus({
      kind: 'error',
      message: 'Form check on this device runs in the browser for now. Open KineticCoach in Chrome to use it.',
    });
  }, [onStatus]);
  return <View style={{ flex: 1, backgroundColor: '#000' }} />;
}
