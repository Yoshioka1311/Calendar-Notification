import { Stack, ThemeProvider } from 'expo-router';
import 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';

import { EventProvider } from '@/contexts/EventContext';
import { FinanceProvider } from '@/contexts/FinanceContext';
import { NutritionProvider } from '@/contexts/NutritionContext';
import { NotificationBootstrap } from '@/components/Notifications/NotificationBootstrap';
import { SettingsProvider, useSettings } from '@/contexts/SettingsContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { VaultProvider } from '@/contexts/VaultContext';
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
        <NutritionProvider>
          <FinanceProvider>
            <VaultProvider>
              <ToastProvider>
                <StatusBar style={theme.dark ? 'light' : 'dark'} />
                <NotificationBootstrap />
                <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: theme.colors.background } }}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="event/[id]" />
                  <Stack.Screen name="event/edit" />
                </Stack>
              </ToastProvider>
            </VaultProvider>
          </FinanceProvider>
        </NutritionProvider>
      </EventProvider>
    </ThemeProvider>
  );
}
