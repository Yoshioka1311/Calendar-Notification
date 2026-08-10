import { createContext, PropsWithChildren, useCallback, useContext, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSettings } from '@/contexts/SettingsContext';
import { radius } from '@/theme';

type ToastContextValue = { showToast: (title: string, message?: string) => void };
const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: PropsWithChildren) {
  const { theme } = useSettings();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ title: string; message?: string }>();
  const [translateY] = useState(() => new Animated.Value(-130));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (title: string, message?: string) => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ title, message });
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 210 }).start();
      timer.current = setTimeout(() => {
        Animated.timing(translateY, { toValue: -130, duration: 220, useNativeDriver: true }).start(() => setToast(undefined));
      }, 2800);
    },
    [translateY],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast ? (
        <Animated.View
          accessibilityLiveRegion="polite"
          style={[
            styles.toast,
            {
              top: insets.top + 8,
              backgroundColor: theme.colors.surfaceElevated,
              borderColor: theme.colors.border,
              transform: [{ translateY }],
            },
          ]}>
          <View style={[styles.check, { backgroundColor: theme.colors.success }]}>
            <Text style={styles.checkText}>✓</Text>
          </View>
          <View style={styles.toastCopy}>
            <Text style={[styles.toastTitle, { color: theme.colors.text }]}>{toast.title}</Text>
            {toast.message ? <Text style={[styles.toastMessage, { color: theme.colors.textMuted }]}>{toast.message}</Text> : null}
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider.');
  return context;
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 18,
    right: 18,
    zIndex: 1000,
    minHeight: 68,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 18,
    elevation: 8,
  },
  check: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  checkText: { color: '#FFFFFF', fontWeight: '800', fontSize: 18 },
  toastCopy: { marginLeft: 12, flex: 1 },
  toastTitle: { fontSize: 15, fontWeight: '700' },
  toastMessage: { fontSize: 12, marginTop: 2 },
});
