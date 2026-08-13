export type ThemeMode = 'system' | 'light' | 'dark';
export type WeekStart = 'sunday' | 'monday';
export type AppLanguage = 'auto' | 'english' | 'thai';

export interface AppSettings {
  themeMode: ThemeMode;
  weekStartsOn: WeekStart;
  language: AppLanguage;
  defaultReminderMinutes: number;
  discordWarningNotifications: boolean;
  discordErrorNotifications: boolean;
  discordRecoveryNotifications: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  themeMode: 'system',
  weekStartsOn: 'sunday',
  language: 'auto',
  defaultReminderMinutes: 1440,
  discordWarningNotifications: true,
  discordErrorNotifications: true,
  discordRecoveryNotifications: true,
};
