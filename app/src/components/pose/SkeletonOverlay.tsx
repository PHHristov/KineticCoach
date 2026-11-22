import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { BODY_CONNECTIONS, type Point } from '../../lib/pose/landmarks';

const BODY_POINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
const GOOD = '#22C55E';
const BAD = '#EF4444';

/**
 * Draws the tracked skeleton over the camera picture (native). The picture is letterboxed
 * ("contain"), so landmarks are mapped into the same centred rectangle.
 */
export function SkeletonOverlay({ points, bad, aspect }: { points: Point[]; bad: number[]; aspect: number }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  const { w: cw, h: ch } = size;
  const cr = cw / Math.max(1, ch);
  const w = aspect > cr ? cw : ch * aspect;
  const h = aspect > cr ? cw / aspect : ch;
  const ox = (cw - w) / 2;
  const oy = (ch - h) / 2;
  const P = (i: number) => ({ x: ox + points[i].x * w, y: oy + points[i].y * h, v: points[i].visibility ?? 1 });
  const badSet = new Set(bad);

  return (
    <View pointerEvents="none" onLayout={onLayout} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      {cw > 0 && points.length >= 33 ? (
        <Svg width={cw} height={ch}>
          {BODY_CONNECTIONS.map(([a, b]) => {
            const pa = P(a);
            const pb = P(b);
            if (pa.v < 0.4 || pb.v < 0.4) return null;
            const isBad = badSet.has(a) && badSet.has(b);
            return (
              <Line
                key={`${a}-${b}`}
                x1={pa.x}
                y1={pa.y}
                x2={pb.x}
                y2={pb.y}
                stroke={isBad ? BAD : 'rgba(255,255,255,0.85)'}
                strokeWidth={isBad ? 6 : 4}
                strokeLinecap="round"
              />
            );
          })}
          {BODY_POINTS.map((i) => {
            const p = P(i);
            if (p.v < 0.4) return null;
            const isBad = badSet.has(i);
            return <Circle key={i} cx={p.x} cy={p.y} r={isBad ? 9 : 6} fill={isBad ? BAD : GOOD} stroke="#000" strokeWidth={1.5} />;
          })}
        </Svg>
      ) : null}
    </View>
  );
}
