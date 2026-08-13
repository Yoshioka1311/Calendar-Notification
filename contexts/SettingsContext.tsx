import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { darkTheme, lightTheme, type AppTheme } from '@/theme';
import { DEFAULT_SETTINGS, type AppSettings } from '@/types/settings';
import { REMINDER_OPTIONS } from '@/types/event';

const SETTINGS_KEY = '@calendar-noti/settings-v1';

type SettingsContextValue = {
  settings: AppSettings;
  theme: AppTheme;
  ready: boolean;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

function readSettings(value: string | null): AppSettings {
  if (!value) return DEFAULT_SETTINGS;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_SETTINGS;
    const candidate = parsed as Partial<AppSettings>;
    return {
      themeMode: ['system', 'light', 'dark'].includes(candidate.themeMode ?? '')
        ? candidate.themeMode!
        : DEFAULT_SETTINGS.themeMode,
      weekStartsOn: ['sunday', 'monday'].includes(candidate.weekStartsOn ?? '')
        ? candidate.weekStartsOn!
        : DEFAULT_SETTINGS.weekStartsOn,
      language: ['auto', 'english', 'thai'].includes(candidate.language ?? '')
        ? candidate.language!
        : DEFAULT_SETTINGS.language,
      defaultReminderMinutes: REMINDER_OPTIONS.some((option) => option.minutes === candidate.defaultReminderMinutes)
        ? candidate.defaultReminderMinutes!
        : DEFAULT_SETTINGS.defaultReminderMinutes,
      discordWarningNotifications: typeof candidate.discordWarningNotifications === 'boolean'
        ? candidate.discordWarningNotifications
        : DEFAULT_SETTINGS.discordWarningNotifications,
      discordErrorNotifications: typeof candidate.discordErrorNotifications === 'boolean'
        ? candidate.discordErrorNotifications
        : DEFAULT_SETTINGS.discordErrorNotifications,
      discordRecoveryNotifications: typeof candidate.discordRecoveryNotifications === 'boolean'
        ? candidate.discordRecoveryNotifications
        : DEFAULT_SETTINGS.discordRecoveryNotifications,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function SettingsProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY)
      .then((value) => setSettings(readSettings(value)))
      .finally(() => setReady(true));
  }, []);

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  }, [settings]);

  const resolvedDark = settings.themeMode === 'system' ? systemScheme === 'dark' : settings.themeMode === 'dark';
  const theme = resolvedDark ? darkTheme : lightTheme;
  const value = useMemo(
    () => ({ settings, theme, ready, updateSettings }),
    [ready, settings, theme, updateSettings],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used inside SettingsProvider.');
  return context;
}
