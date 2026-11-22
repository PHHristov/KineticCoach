import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
  type TextInputProps,
  type ViewStyle,
  type StyleProp,
} from 'react-native';

const light = {
  bg: '#F6F7F9',
  card: '#FFFFFF',
  text: '#111418',
  muted: '#5F6B7A',
  border: '#E1E5EA',
  primary: '#FF5A1F',
  primaryText: '#FFFFFF',
  rest: '#2F7CF6',
  work: '#FF5A1F',
  prep: '#8A5CF6',
  danger: '#D92D20',
  // Celebration green; dark enough for white text (about 4.7:1).
  success: '#05854A',
  chip: '#EEF1F4',
};
const dark: typeof light = {
  bg: '#0E1114',
  card: '#181C21',
  text: '#F2F4F7',
  muted: '#98A2B3',
  border: '#2A3038',
  primary: '#FF6B35',
  primaryText: '#FFFFFF',
  rest: '#4C8DF8',
  work: '#FF6B35',
  prep: '#9B74F7',
  danger: '#F04438',
  success: '#05854A',
  chip: '#232931',
};
export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export function Screen({ children, style }: { children?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ flex: 1, backgroundColor: t.bg }, style]}>{children}</View>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }, style]}>{children}</View>
  );
}

export function H1({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.h1, { color: t.text }]}>{children}</Text>;
}

export function H2({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.h2, { color: t.text }]}>{children}</Text>;
}

export function Body({
  children,
  muted,
  style,
  numberOfLines,
}: {
  children: React.ReactNode;
  muted?: boolean;
  style?: any;
  numberOfLines?: number;
}) {
  const t = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={[{ color: muted ? t.muted : t.text, fontSize: 15, lineHeight: 21 }, style]}>
      {children}
    </Text>
  );
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  big?: boolean;
};

export function Button({ title, onPress, variant = 'primary', disabled, style, big }: ButtonProps) {
  const t = useTheme();
  const bg =
    variant === 'primary' ? t.primary : variant === 'danger' ? t.danger : variant === 'secondary' ? t.chip : 'transparent';
  const fg = variant === 'primary' || variant === 'danger' ? t.primaryText : variant === 'ghost' ? t.primary : t.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        big && styles.btnBig,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      <Text style={[styles.btnText, big && { fontSize: 18 }, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={[styles.label, { color: t.muted }]}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={t.muted}
        {...props}
        style={[styles.input, { color: t.text, backgroundColor: t.card, borderColor: t.border }, props.style]}
      />
    </View>
  );
}

/** Small − value + control for numeric settings. */
export function Stepper({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  max = 9999,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  const t = useTheme();
  const clamp = (n: number) => Math.round(Math.min(max, Math.max(min, n)) * 100) / 100;
  // Local text so partial input like "2." can be typed before it becomes a number.
  const [text, setText] = React.useState(String(value));
  React.useEffect(() => {
    if (parseFloat(text) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <View style={{ gap: 6, flexGrow: 1, flexBasis: 140 }}>
      <Text style={[styles.label, { color: t.muted }]}>{label}</Text>
      <View style={[styles.stepper, { borderColor: t.border, backgroundColor: t.card }]}>
        <Pressable accessibilityLabel={`Decrease ${label}`} onPress={() => onChange(clamp(value - step))} style={styles.stepBtn}>
          <Text style={[styles.stepBtnText, { color: t.primary }]}>−</Text>
        </Pressable>
        <TextInput
          accessibilityLabel={label}
          keyboardType={Number.isInteger(step) ? 'number-pad' : 'decimal-pad'}
          value={text}
          onChangeText={(s) => {
            const cleaned = s.replace(',', '.').replace(/[^0-9.]/g, '');
            setText(cleaned);
            const n = parseFloat(cleaned);
            if (Number.isFinite(n)) onChange(clamp(n));
          }}
          onBlur={() => setText(String(value))}
          style={[styles.stepValue, { color: t.text }]}
        />
        {suffix ? <Text style={{ color: t.muted, marginRight: 4 }}>{suffix}</Text> : null}
        <Pressable accessibilityLabel={`Increase ${label}`} onPress={() => onChange(clamp(value + step))} style={styles.stepBtn}>
          <Text style={[styles.stepBtnText, { color: t.primary }]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={[styles.chip, { backgroundColor: active ? t.primary : t.chip }]}
    >
      <Text style={{ color: active ? t.primaryText : t.text, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 8 },
  h1: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  h2: { fontSize: 18, fontWeight: '700' },
  btn: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnBig: { paddingVertical: 16, borderRadius: 14 },
  btnText: { fontSize: 15, fontWeight: '700' },
  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, height: 44 },
  stepBtn: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontSize: 22, fontWeight: '700' },
  stepValue: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600', minWidth: 30, paddingVertical: 0 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
});
