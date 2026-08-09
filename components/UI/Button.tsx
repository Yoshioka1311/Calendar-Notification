import * as Haptics from 'expo-haptics';
import type { PropsWithChildren } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { useSettings } from '@/contexts/SettingsContext';
import { radius } from '@/theme';

type ButtonProps = PropsWithChildren<{
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
}>;

export function Button({ children, onPress, variant = 'primary', loading, disabled, style, accessibilityLabel }: ButtonProps) {
  const { theme } = useSettings();
  const colors = {
    primary: { background: theme.colors.primary, text: theme.dark ? '#141526' : '#FFFFFF', border: theme.colors.primary },
    secondary: { background: theme.colors.primarySoft, text: theme.colors.primary, border: theme.colors.primarySoft },
    danger: { background: theme.colors.danger, text: '#FFFFFF', border: theme.colors.danger },
    ghost: { background: 'transparent', text: theme.colors.text, border: theme.colors.border },
  }[variant];

  const handlePress = () => {
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled || loading}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.background, borderColor: colors.border, opacity: disabled ? 0.45 : pressed ? 0.78 : 1 },
        style,
      ]}>
      {loading ? <ActivityIndicator color={colors.text} /> : <Text style={[styles.label, { color: colors.text }]}>{children}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  label: { fontSize: 15, fontWeight: '700' },
});
