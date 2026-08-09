import { StyleSheet, Text, View } from 'react-native';

import { useSettings } from '@/contexts/SettingsContext';
import { Button } from '@/components/UI/Button';

type EmptyStateProps = { title: string; message: string; actionLabel?: string; onAction?: () => void };

export function EmptyState({ title, message, actionLabel, onAction }: EmptyStateProps) {
  const { theme } = useSettings();
  return (
    <View style={styles.container}>
      <View style={[styles.icon, { backgroundColor: theme.colors.primarySoft }]}>
        <Text style={styles.emoji}>✦</Text>
      </View>
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      <Text style={[styles.message, { color: theme.colors.textMuted }]}>{message}</Text>
      {actionLabel && onAction ? <Button onPress={onAction} style={styles.action}>{actionLabel}</Button> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: 30, paddingHorizontal: 18 },
  icon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emoji: { fontSize: 24, color: '#7C6FF2' },
  title: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  message: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 6, maxWidth: 280 },
  action: { marginTop: 18, minWidth: 140 },
});
