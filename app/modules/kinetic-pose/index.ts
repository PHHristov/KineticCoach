import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ComponentType } from 'react';
import type { NativeSyntheticEvent, ViewProps } from 'react-native';

/** One analysed camera frame. Landmarks are flat arrays of [x, y, z, visibility] × 33. */
export type PoseEventPayload = {
  t: number;
  inferenceMs: number;
  width: number;
  height: number;
  image: number[];
  world: number[];
};

export type PoseStatusPayload = {
  kind: 'starting' | 'running' | 'error';
  message?: string;
  /** "settings" when the fix is to allow the camera in Settings. */
  action?: 'settings';
};

export type CameraPermission = 'granted' | 'denied' | 'restricted' | 'undetermined';

type NativeModule = {
  getCameraPermission(): CameraPermission;
  requestCameraPermission(): Promise<CameraPermission>;
};

export type KineticPoseViewProps = ViewProps & {
  facing: 'user' | 'environment';
  onPose: (e: NativeSyntheticEvent<PoseEventPayload>) => void;
  onStatus: (e: NativeSyntheticEvent<PoseStatusPayload>) => void;
};

/** The native module (iOS only for now); null where it isn't built in. */
export const KineticPose = requireOptionalNativeModule<NativeModule>('KineticPose');

let view: ComponentType<KineticPoseViewProps> | null = null;
/** The native camera view, loaded on first use so other platforms never touch it. */
export function getKineticPoseView(): ComponentType<KineticPoseViewProps> {
  view ??= requireNativeView<KineticPoseViewProps>('KineticPose');
  return view;
}
