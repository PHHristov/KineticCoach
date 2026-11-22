import { Text, View } from 'react-native';

const COLORS = ['#FF5A1F', '#2F7CF6', '#12B76A', '#8A5CF6', '#F79009', '#DD2590', '#0BA5EC', '#7A5AF8'];

/** Round badge with the profile's initials; the colour is stable per name. */
export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?';
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: COLORS[h % COLORS.length], alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.38 }}>{initials}</Text>
    </View>
  );
}
