import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { BODY_CONNECTIONS, type PoseFrame } from '../../lib/pose/landmarks';
import { demoFrame } from '../../lib/pose/simulate';
import type { PoseCameraProps } from './types';

type Vision = typeof import('@mediapipe/tasks-vision');

// Pinned to the version in package.json (used there for types only) so JS, WASM and types match.
const MEDIAPIPE_VERSION = '1.2.3';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;
const WASM_URL = `${CDN}/wasm`;
const LOAD_TIMEOUT_MS = 45000;

/**
 * Loads MediaPipe straight from the CDN as a native ES module. Metro cannot bundle it
 * (its loader uses a dynamic `import()` Metro rejects), so the import is hidden from Metro.
 */
let visionPromise: Promise<Vision> | null = null;
function loadVision(): Promise<Vision> {
  if (!visionPromise) {
    const nativeImport = new Function('url', 'return import(url)') as (url: string) => Promise<Vision>;
    visionPromise = nativeImport(`${CDN}/vision_bundle.mjs`).catch((e) => {
      visionPromise = null; // allow a retry
      throw e;
    });
  }
  return visionPromise;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}
// "Lite" is the fastest pose model: lowest latency for live feedback.
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

const BODY_POINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];

/**
 * Browser camera + MediaPipe Pose Landmarker. Runs entirely on the device:
 * video frames never leave the browser.
 */
export default function PoseCamera({ onFrame, onStatus, onStats, facing, demo }: PoseCameraProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Keep the latest callbacks without restarting the camera when they change.
  const cb = useRef({ onFrame, onStatus, onStats });
  cb.current = { onFrame, onStatus, onStats };

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let landmarker: { detectForVideo: Function; close: () => void } | null = null;
    let raf = 0;
    let lastVideoTime = -1;
    let frames = 0;
    let statsStart = performance.now();
    let inferSum = 0;

    const status = (s: Parameters<PoseCameraProps['onStatus']>[0]) => !cancelled && cb.current.onStatus(s);

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        status({ kind: 'error', message: 'This browser cannot use the camera. Try Chrome, Safari or Edge, on https or localhost.' });
        return;
      }
      status({ kind: 'starting', message: 'Asking for camera access…' });
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 } },
        });
      } catch (e) {
        const name = (e as DOMException)?.name;
        status({
          kind: 'error',
          message:
            name === 'NotAllowedError'
              ? 'Camera access was blocked. Allow the camera for this site in your browser settings, then try again.'
              : 'Could not start the camera. Check that no other app is using it.',
        });
        return;
      }
      if (cancelled) return;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play().catch(() => {});

      status({ kind: 'starting', message: 'Loading the pose model…' });
      try {
        const { FilesetResolver, PoseLandmarker } = await withTimeout(loadVision(), LOAD_TIMEOUT_MS);
        const fileset = await withTimeout(FilesetResolver.forVisionTasks(WASM_URL), LOAD_TIMEOUT_MS);
        const make = (delegate: 'GPU' | 'CPU') =>
          PoseLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate },
            runningMode: 'VIDEO',
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
        try {
          landmarker = await withTimeout(make('GPU'), LOAD_TIMEOUT_MS);
        } catch {
          landmarker = await withTimeout(make('CPU'), LOAD_TIMEOUT_MS); // no WebGL: slower, but still works
        }
      } catch {
        status({ kind: 'error', message: 'Could not load the pose model. Check your internet connection and reload.' });
        return;
      }
      if (cancelled) {
        landmarker?.close();
        return;
      }
      status({ kind: 'running' });
      loop();
    }

    function loop() {
      if (cancelled) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && landmarker && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const now = performance.now();
        const result = landmarker.detectForVideo(video, now);
        const inferMs = performance.now() - now;
        const image = result.landmarks?.[0] ?? [];
        const world = result.worldLandmarks?.[0] ?? [];
        const frame: PoseFrame = { t: now, image, world, aspect: video.videoWidth / Math.max(1, video.videoHeight) };
        const bad = cb.current.onFrame(frame);
        draw(canvas, video.videoWidth / Math.max(1, video.videoHeight), image, bad);

        frames++;
        inferSum += inferMs;
        if (now - statsStart > 1000) {
          cb.current.onStats?.({ fps: Math.round((frames * 1000) / (now - statsStart)), inferenceMs: Math.round(inferSum / frames) });
          frames = 0;
          inferSum = 0;
          statsStart = now;
        }
      }
      // Run on every new video frame where supported (lowest latency), else every screen refresh.
      if (video && 'requestVideoFrameCallback' in video) {
        (video as HTMLVideoElement & { requestVideoFrameCallback: (cb: () => void) => number }).requestVideoFrameCallback(loop);
      } else {
        raf = requestAnimationFrame(loop);
      }
    }

    function demoLoop() {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (canvas) {
        const now = performance.now();
        const { image, world } = demoFrame((now - demoStart) / 1000);
        const bad = cb.current.onFrame({ t: now, image, world, aspect: 1 });
        draw(canvas, 1, image, bad);
      }
      raf = requestAnimationFrame(demoLoop);
    }
    const demoStart = performance.now();

    if (demo) {
      status({ kind: 'running' });
      demoLoop();
    } else {
      start();
    }
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      try {
        landmarker?.close();
      } catch {
        // already closed
      }
    };
  }, [facing, demo]);

  const mirror = facing === 'user' && !demo ? 'scaleX(-1)' : 'none';
  const fill = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', transform: mirror } as const;

  return (
    <View style={{ flex: 1, backgroundColor: '#000', overflow: 'hidden' }}>
      <video ref={videoRef} playsInline muted style={fill} />
      <canvas ref={canvasRef} style={{ ...fill, pointerEvents: 'none' }} />
    </View>
  );
}

function draw(
  canvas: HTMLCanvasElement,
  /** Width / height of the source frame. */
  vr: number,
  pts: { x: number; y: number; visibility?: number }[],
  bad: number[],
) {
  // Match the canvas to the video's displayed size (object-fit: contain).
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  if (!pts.length) return;

  const cr = cw / Math.max(1, ch);
  const w = vr > cr ? cw : ch * vr;
  const h = vr > cr ? cw / vr : ch;
  const ox = (cw - w) / 2;
  const oy = (ch - h) / 2;
  const P = (i: number) => ({ x: ox + pts[i].x * w, y: oy + pts[i].y * h, v: pts[i].visibility ?? 1 });
  const badSet = new Set(bad);
  const GOOD = '#22C55E';
  const BAD = '#EF4444';

  ctx.lineCap = 'round';
  for (const [a, b] of BODY_CONNECTIONS) {
    const pa = P(a);
    const pb = P(b);
    if (pa.v < 0.4 || pb.v < 0.4) continue;
    ctx.strokeStyle = badSet.has(a) && badSet.has(b) ? BAD : 'rgba(255,255,255,0.85)';
    ctx.lineWidth = badSet.has(a) && badSet.has(b) ? 6 : 4;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }
  for (const i of BODY_POINTS) {
    const p = P(i);
    if (p.v < 0.4) continue;
    const isBad = badSet.has(i);
    ctx.fillStyle = isBad ? BAD : GOOD;
    ctx.beginPath();
    ctx.arc(p.x, p.y, isBad ? 9 : 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}
