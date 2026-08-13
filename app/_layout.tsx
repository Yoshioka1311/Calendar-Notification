import { Stack, ThemeProvider } from 'expo-router';
import 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';

import { EventProvider } from '@/contexts/EventContext';
import { DiscordMonitoringProvider } from '@/contexts/DiscordMonitoringContext';
import { NotificationBootstrap } from '@/components/Notifications/NotificationBootstrap';
import { SettingsProvider, useSettings } from '@/contexts/SettingsContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { configureNotificationPresentation } from '@/services/notifications';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

configureNotificationPresentation();

export default function RootLayout() {
  return (
    <SettingsProvider>
      <RootLayoutNav />
    </SettingsProvider>
  );
}

function RootLayoutNav() {
  const { theme } = useSettings();
  const navigationTheme = {
    dark: theme.dark,
    colors: {
      primary: theme.colors.primary,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.border,
      notification: theme.colors.danger,
    },
    fonts: {
      regular: { fontFamily: 'System', fontWeight: '400' as const },
      medium: { fontFamily: 'System', fontWeight: '500' as const },
      bold: { fontFamily: 'System', fontWeight: '700' as const },
      heavy: { fontFamily: 'System', fontWeight: '800' as const },
    },
  };

  return (
    <ThemeProvider value={navigationTheme}>
      <EventProvider>
        <DiscordMonitoringProvider>
          <ToastProvider>
            <StatusBar style={theme.dark ? 'light' : 'dark'} />
            <NotificationBootstrap />
            <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: theme.colors.background } }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="event/[id]" />
              <Stack.Screen name="event/edit" />
              <Stack.Screen name="discord/log/[id]" />
              <Stack.Screen name="discord/alert/[id]" />
            </Stack>
          </ToastProvider>
        </DiscordMonitoringProvider>
      </EventProvider>
    </ThemeProvider>
  );
}
