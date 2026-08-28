import { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSettings } from '@/contexts/SettingsContext';
import { radius, spacing } from '@/theme';

export type SelectOption = {
  id: string;
  label: string;
  subtitle?: string;
};

type SelectFieldProps = {
  label: string;
  placeholder?: string;
  value?: SelectOption;
  options: SelectOption[];
  searchable?: boolean;
  sheetTitle?: string;
  disabled?: boolean;
  onChange: (option: SelectOption) => void;
};

export function SelectField({
  label,
  placeholder = 'Select',
  value,
  options,
  searchable,
  sheetTitle,
  disabled,
  onChange,
}: SelectFieldProps) {
  const { theme } = useSettings();
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const sheetAnim = useMemo(() => new Animated.Value(0), []);

  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => `${option.label} ${option.subtitle ?? ''}`.toLowerCase().includes(needle));
  }, [options, query]);

  useEffect(() => {
    if (!visible) {
      sheetAnim.setValue(0);
      return;
    }
    Animated.timing(sheetAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [sheetAnim, visible]);

  function close() {
    Animated.timing(sheetAnim, {
      toValue: 0,
      duration: 160,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setVisible(false);
        setQuery('');
      }
    });
  }

  function select(option: SelectOption) {
    onChange(option);
    close();
  }

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value?.label ?? placeholder}`}
        disabled={disabled}
        onPress={() => setVisible(true)}
        style={({ pressed }) => [
          styles.control,
          {
            backgroundColor: theme.colors.background,
            borderColor: theme.colors.border,
            opacity: disabled ? 0.45 : pressed ? 0.78 : 1,
          },
        ]}>
        <View style={styles.valueCopy}>
          <Text style={[styles.valueText, { color: value ? theme.colors.text : theme.colors.textMuted }]} numberOfLines={1}>
            {value?.label ?? placeholder}
          </Text>
          {value?.subtitle ? <Text style={[styles.subtitle, { color: theme.colors.textMuted }]} numberOfLines={1}>{value.subtitle}</Text> : null}
        </View>
        <Text style={[styles.chevron, { color: theme.colors.textMuted }]}>v</Text>
      </Pressable>

      <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />
          <Animated.View
            style={[
              styles.sheet,
              {
                backgroundColor: theme.colors.surfaceElevated,
                borderColor: theme.colors.border,
                opacity: sheetAnim,
                transform: [{ translateY: sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }],
              },
            ]}>
            <SafeAreaView edges={['bottom']} style={styles.sheetSafe}>
              <View style={styles.sheetHeader}>
                <Text style={[styles.sheetTitle, { color: theme.colors.text }]}>{sheetTitle ?? label}</Text>
                <Pressable accessibilityRole="button" onPress={close}>
                  <Text style={[styles.closeText, { color: theme.colors.primary }]}>Close</Text>
                </Pressable>
              </View>
              {searchable ? (
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={`Search ${label.toLowerCase()}...`}
                  placeholderTextColor={theme.colors.textMuted}
                  autoCapitalize="none"
                  style={[styles.searchInput, { backgroundColor: theme.colors.background, borderColor: theme.colors.border, color: theme.colors.text }]}
                />
              ) : null}
              <FlatList
                data={filteredOptions}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                style={styles.list}
                renderItem={({ item }) => (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => select(item)}
                    style={({ pressed }) => [
                      styles.option,
                      {
                        borderBottomColor: theme.colors.border,
                        opacity: pressed ? 0.72 : 1,
                      },
                    ]}>
                    <View style={styles.valueCopy}>
                      <Text style={[styles.optionLabel, { color: theme.colors.text }]}>{item.label}</Text>
                      {item.subtitle ? <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{item.subtitle}</Text> : null}
                    </View>
                    {value?.id === item.id ? <Text style={[styles.selectedMark, { color: theme.colors.primary }]}>Selected</Text> : null}
                  </Pressable>
                )}
                ListEmptyComponent={<Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>No options found</Text>}
              />
            </SafeAreaView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: spacing.md },
  label: { fontSize: 13, fontWeight: '800', marginBottom: 7 },
  control: {
    minHeight: 52,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  valueCopy: { flex: 1 },
  valueText: { fontSize: 15, fontWeight: '700' },
  subtitle: { marginTop: 2, fontSize: 12, lineHeight: 17 },
  chevron: { fontSize: 22, lineHeight: 22, fontWeight: '800' },
  modalWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.54)' },
  sheet: {
    maxHeight: '82%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  sheetSafe: { maxHeight: '100%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.md },
  sheetTitle: { flex: 1, fontSize: 22, lineHeight: 28, fontWeight: '800' },
  closeText: { fontSize: 13, fontWeight: '800' },
  searchInput: {
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    marginBottom: spacing.sm,
    fontSize: 15,
  },
  list: { marginBottom: spacing.sm },
  option: {
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  optionLabel: { fontSize: 15, fontWeight: '800' },
  selectedMark: { fontSize: 18, fontWeight: '900' },
  emptyText: { textAlign: 'center', paddingVertical: spacing.xl, fontSize: 14, fontWeight: '700' },
});
