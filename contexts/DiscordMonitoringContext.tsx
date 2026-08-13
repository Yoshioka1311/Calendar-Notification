import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { useSettings } from '@/contexts/SettingsContext';
import { discordMonitoringService } from '@/services/discordMonitoringService';
import { getYoshiokaPushToken, presentDiscordAlertNotification } from '@/services/notifications';
import type { DiscordAlert, DiscordBotLog, DiscordHealth } from '@/types/discordMonitoring';

type DiscordMonitoringContextValue = {
  health?: DiscordHealth;
  logs: DiscordBotLog[];
  alerts: DiscordAlert[];
  unreadCount: number;
  loading: boolean;
  error?: string;
  lastUpdatedAt?: string;
  refresh: () => Promise<void>;
  acknowledge: (id: string) => Promise<void>;
};

const DiscordMonitoringContext = createContext<DiscordMonitoringContextValue | null>(null);

export function DiscordMonitoringProvider({ children }: PropsWithChildren) {
  const { settings } = useSettings();
  const [health, setHealth] = useState<DiscordHealth>();
  const [logs, setLogs] = useState<DiscordBotLog[]>([]);
  const [alerts, setAlerts] = useState<DiscordAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string>();
  const refreshing = useRef(false);
  const delivering = useRef(new Set<string>());
  const pushSignature = useRef<string | undefined>(undefined);

  const registerPush = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      const token = await getYoshiokaPushToken();
      if (!token) return;
      const signature = [token, settings.discordWarningNotifications, settings.discordErrorNotifications, settings.discordRecoveryNotifications].join('|');
      if (pushSignature.current === signature) return;
      await discordMonitoringService.registerDiscordPushDevice({
        token,
        platform: Platform.OS,
        warnings: settings.discordWarningNotifications,
        errors: settings.discordErrorNotifications,
        recovery: settings.discordRecoveryNotifications,
      });
      pushSignature.current = signature;
    } catch {
      // Pairing, notification permission, or transient network state can recover on the next foreground refresh.
    }
  }, [settings.discordErrorNotifications, settings.discordRecoveryNotifications, settings.discordWarningNotifications]);

  const deliverPendingAlerts = useCallback(async (items: DiscordAlert[]) => {
    if (Platform.OS === 'web') return;
    for (const alert of items.filter((item) => item.notificationPending)) {
      if (delivering.current.has(alert.id)) continue;
      delivering.current.add(alert.id);
      try {
        const enabled = alert.status === 'resolved'
          ? settings.discordRecoveryNotifications
          : alert.severity === 'critical'
            ? true
            : alert.severity === 'error'
              ? settings.discordErrorNotifications
              : settings.discordWarningNotifications;
        if (enabled) await presentDiscordAlertNotification(alert);
        await discordMonitoringService.markDiscordAlertDelivered(alert.id);
      } catch {
        // Keep delivery pending so it can retry after permission or connectivity recovers.
      } finally {
        delivering.current.delete(alert.id);
      }
    }
  }, [settings.discordErrorNotifications, settings.discordRecoveryNotifications, settings.discordWarningNotifications]);

  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    setLoading(true);
    try {
      const [nextHealth, nextLogs, nextAlerts] = await Promise.all([
        discordMonitoringService.getDiscordHealth(),
        discordMonitoringService.getDiscordLogs({ limit: 20 }),
        discordMonitoringService.getDiscordAlerts('all'),
      ]);
      setHealth(nextHealth);
      setLogs(nextLogs.logs);
      setAlerts(nextAlerts);
      setLastUpdatedAt(new Date().toISOString());
      setError(undefined);
      void registerPush();
      void deliverPendingAlerts(nextAlerts);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Monitoring data is unavailable.');
    } finally {
      refreshing.current = false;
      setLoading(false);
    }
  }, [deliverPendingAlerts, registerPush]);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') void refresh();
    }, 60_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [refresh]);

  const acknowledge = useCallback(async (id: string) => {
    await discordMonitoringService.acknowledgeDiscordAlert(id);
    setAlerts((current) => current.map((alert) => (
      alert.id === id ? { ...alert, acknowledgedAt: new Date().toISOString() } : alert
    )));
  }, []);

  const value = useMemo<DiscordMonitoringContextValue>(() => ({
    health,
    logs,
    alerts,
    unreadCount: alerts.filter((alert) => alert.status === 'active' && !alert.acknowledgedAt).length,
    loading,
    error,
    lastUpdatedAt,
    refresh,
    acknowledge,
  }), [acknowledge, alerts, error, health, lastUpdatedAt, loading, logs, refresh]);

  return <DiscordMonitoringContext.Provider value={value}>{children}</DiscordMonitoringContext.Provider>;
}

export function useDiscordMonitoring(): DiscordMonitoringContextValue {
  const context = useContext(DiscordMonitoringContext);
  if (!context) throw new Error('useDiscordMonitoring must be used inside DiscordMonitoringProvider.');
  return context;
}
