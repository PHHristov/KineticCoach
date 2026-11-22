import { Text, View } from 'react-native';
import type { Progression } from '../lib/stats';
import { useTheme } from './ui';

/** Status badge for a progression verdict: always icon + label, never colour alone. */
export function ProgressBadge({ verdict }: { verdict: Progression['verdict'] }) {
  const t = useTheme();
  const map = {
    good: { icon: '▲', label: 'Good progress', color: '#12B76A' },
    steady: { icon: '▶', label: 'Steady', color: t.muted },
    down: { icon: '▼', label: 'Dropping', color: '#F79009' },
    new: { icon: '●', label: 'New', color: t.primary },
  } as const;
  const v = map[verdict];
  return (
    <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: t.chip }}>
      <Text style={{ color: v.color, fontSize: 10 }}>{v.icon}</Text>
      <Text style={{ color: t.text, fontSize: 12, fontWeight: '700' }}>{v.label}</Text>
    </View>
  );
}
