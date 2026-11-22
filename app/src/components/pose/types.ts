import type { Point, Point3, PoseFrame } from '../../lib/pose/landmarks';

export type CameraStatus =
  | { kind: 'starting'; message: string }
  | { kind: 'running' }
  | { kind: 'error'; message: string };

export type PoseCameraProps = {
  /** Called for every analysed video frame. Returns landmark indices to draw in red. */
  onFrame: (frame: PoseFrame) => number[];
  onStatus: (s: CameraStatus) => void;
  /** Frames per second actually analysed and model time per frame, for the HUD. */
  onStats?: (s: { fps: number; inferenceMs: number }) => void;
  facing: 'user' | 'environment';
  /** Replace the camera with simulated landmarks at time t seconds (web only, for demos and testing). */
  demo?: (t: number) => { image: Point[]; world: Point3[] };
};
