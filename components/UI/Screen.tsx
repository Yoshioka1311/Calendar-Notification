import type { PropsWithChildren, ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSettings } from '@/contexts/SettingsContext';

type ScreenProps = PropsWithChildren<{
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: ViewStyle;
}>;

export function Screen({
  children,
  title,
  subtitle,
  right,
  scroll = true,
  refreshing = false,
  onRefresh,
  contentStyle,
}: ScreenProps) {
  const { theme } = useSettings();
  const header = title ? (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.text }]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  ) : null;

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} /> : undefined}
          contentContainerStyle={[styles.content, contentStyle]}>
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.flex, contentStyle]}>
          {header}
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 28 },
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 },
  headerCopy: { flex: 1, paddingRight: 12 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.6 },
  subtitle: { marginTop: 4, fontSize: 14, lineHeight: 20 },
});
