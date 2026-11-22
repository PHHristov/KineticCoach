/**
 * MediaPipe BlazePose landmark indices and small geometry helpers.
 * https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
 */

export const L = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFoot: 31,
  rightFoot: 32,
} as const;

/** A landmark in image space: x, y normalised to 0–1 (y points down). */
export type Point = { x: number; y: number; z?: number; visibility?: number };
/** A landmark in metres, origin between the hips. */
export type Point3 = { x: number; y: number; z: number; visibility?: number };

export type PoseFrame = {
  /** Milliseconds, monotonically increasing. */
  t: number;
  image: Point[];
  world: Point3[];
  /** Video width / height, to make x and y distances comparable. */
  aspect: number;
};

/** Connections drawn for the skeleton overlay (body only, no face/hands). */
export const BODY_CONNECTIONS: [number, number][] = [
  [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 29], [29, 31], [27, 31], [28, 30], [30, 32], [28, 32],
];

export function vis(p: Point | undefined): number {
  return p?.visibility ?? 0;
}

/** Angle ABC in degrees (at B), using 3D points. */
export function angle3(a: Point3, b: Point3, c: Point3): number {
  const ab = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const cb = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const dot = ab.x * cb.x + ab.y * cb.y + ab.z * cb.z;
  const m = Math.hypot(ab.x, ab.y, ab.z) * Math.hypot(cb.x, cb.y, cb.z);
  if (m === 0) return 180;
  return (Math.acos(Math.max(-1, Math.min(1, dot / m))) * 180) / Math.PI;
}

export function mid<T extends Point>(a: T, b: T): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, visibility: Math.min(vis(a), vis(b)) };
}

/** Distance in image space with x scaled by the aspect ratio (so units are "image heights"). */
export function dist2(a: Point, b: Point, aspect: number): number {
  return Math.hypot((a.x - b.x) * aspect, a.y - b.y);
}

/** Angle of the segment from `from` to `to` away from straight up, in degrees (0 = vertical). */
export function leanFromVertical(from: Point, to: Point, aspect: number): number {
  const dx = (to.x - from.x) * aspect;
  const dy = to.y - from.y; // negative when `to` is above `from`
  return (Math.atan2(Math.abs(dx), -dy) * 180) / Math.PI;
}
