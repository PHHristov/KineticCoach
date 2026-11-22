import { useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { useTheme } from './ui';

export type ChartPoint = { date: number; value: number };

const HEIGHT = 180;
const PAD = { top: 16, right: 12, bottom: 24, left: 40 };

/**
 * Single-series line chart of a value per session over time.
 * The y-axis is fitted to the data (not zero-based) so that small strength gains are visible.
 * Tap a point to see its value; the chosen point is drawn larger.
 */
export function ProgressChart({ points, unit }: { points: ChartPoint[]; unit: string }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  if (points.length === 0) return null;

  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= Math.max(1, min * 0.1);
    max += Math.max(1, max * 0.1);
  } else {
    const pad = (max - min) * 0.15;
    min = Math.max(0, min - pad);
    max += pad;
  }
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - ((v - min) / (max - min)) * plotH;
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  // Whole numbers on the axis unless the range is tiny; point values keep one decimal (e.g. 102.5 kg).
  const axisFmt = (v: number) => (max - min >= 5 ? `${Math.round(v)}` : `${Math.round(v * 10) / 10}`);
  const fmt = (v: number) => `${Math.round(v * 10) / 10}`;
  const dateLabel = (d: number) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const sel = selected !== null ? points[selected] : null;
  const ticks = [max, (max + min) / 2, min];

  return (
    <View
      onLayout={onLayout}
      style={{ height: HEIGHT, width: '100%' }}
      accessible
      accessibilityLabel={`Chart of ${points.length} sessions, from ${fmt(points[0].value)} to ${fmt(points[points.length - 1].value)} ${unit}`}
    >
      {width > 0 ? (
        <>
          <Svg width={width} height={HEIGHT}>
            {ticks.map((v, i) => (
              <Line key={i} x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke={t.border} strokeWidth={1} />
            ))}
            <Path d={path} stroke={t.primary} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            {points.map((p, i) => (
              <Circle
                key={i}
                cx={x(i)}
                cy={y(p.value)}
                r={selected === i ? 6 : 4}
                fill={t.primary}
                stroke={t.card}
                strokeWidth={2}
              />
            ))}
          </Svg>
          {/* y-axis labels */}
          {ticks.map((v, i) => (
            <Text key={i} style={{ position: 'absolute', left: 0, width: PAD.left - 6, top: y(v) - 8, textAlign: 'right', fontSize: 11, color: t.muted }}>
              {axisFmt(v)}
            </Text>
          ))}
          {/* first and last dates */}
          <Text style={{ position: 'absolute', left: PAD.left, bottom: 2, fontSize: 11, color: t.muted }}>{dateLabel(points[0].date)}</Text>
          {points.length > 1 ? (
            <Text style={{ position: 'absolute', right: PAD.right, bottom: 2, fontSize: 11, color: t.muted }}>
              {dateLabel(points[points.length - 1].date)}
            </Text>
          ) : null}
          {/* hit targets larger than the dots */}
          {points.map((p, i) => (
            <Pressable
              key={i}
              onPress={() => setSelected(selected === i ? null : i)}
              accessibilityRole="button"
              accessibilityLabel={`${dateLabel(p.date)}: ${fmt(p.value)} ${unit}`}
              style={{ position: 'absolute', left: x(i) - 16, top: y(p.value) - 16, width: 32, height: 32 }}
            />
          ))}
          {sel ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: Math.max(0, y(sel.value) - 46),
                left: Math.min(Math.max(0, x(selected!) - 60), width - 120),
                width: 120,
                paddingVertical: 4,
                paddingHorizontal: 8,
                borderRadius: 8,
                backgroundColor: t.text,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: t.card, fontWeight: '800', fontSize: 14 }}>
                {fmt(sel.value)} {unit}
              </Text>
              <Text style={{ color: t.card, fontSize: 11, opacity: 0.8 }}>{dateLabel(sel.date)}</Text>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
