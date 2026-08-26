import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/UI/Button';
import { useSettings } from '@/contexts/SettingsContext';
import {
  getNotificationPermissionStatus,
  prepareNotifications,
  requestNotificationPermission,
} from '@/services/notifications';

const PROMPT_SEEN_KEY = '@calendar-noti/notification-explanation-v1';
const EVENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function openNotificationEvent(response: Notifications.NotificationResponse): void {
  const eventId = response.notification.request.content.data?.eventId;
  if (typeof eventId !== 'string' || !EVENT_ID_PATTERN.test(eventId)) return;
  router.push({ pathname: '/event/[id]', params: { id: eventId } });
}

export function NotificationBootstrap() {
  const { ready, theme } = useSettings();
  const [showExplanation, setShowExplanation] = useState(false);
  const handledResponseId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void prepareNotifications().catch((caught) => {
      // eslint-disable-next-line no-console -- deliberately development-only diagnostics
      if (__DEV__) console.error('[notifications] channel setup failed', caught);
    });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handledResponseId.current = response.notification.request.identifier;
      openNotificationEvent(response);
      void Notifications.clearLastNotificationResponseAsync();
    });

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response || handledResponseId.current === response.notification.request.identifier) return;
      handledResponseId.current = response.notification.request.identifier;
      openNotificationEvent(response);
      void Notifications.clearLastNotificationResponseAsync();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!ready || Platform.OS === 'web') return;
    void Promise.all([AsyncStorage.getItem(PROMPT_SEEN_KEY), getNotificationPermissionStatus()])
      .then(([seen, permission]) => {
        if (!seen && !permission.granted && permission.canAskAgain) setShowExplanation(true);
      })
      .catch(() => undefined);
  }, [ready]);

  const close = async () => {
    setShowExplanation(false);
    await AsyncStorage.setItem(PROMPT_SEEN_KEY, '1');
  };

  const allow = async () => {
    await close();
    await requestNotificationPermission();
  };

  return (
    <Modal transparent animationType="fade" visible={showExplanation} onRequestClose={() => void close()}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.title, { color: theme.colors.text }]}>Never miss an event</Text>
          <Text style={[styles.body, { color: theme.colors.textMuted }]}>Yoshioka can remind you before calendar events. You can change this permission later in Settings.</Text>
          <Button onPress={() => void allow()}>Allow notifications</Button>
          <Button variant="ghost" onPress={() => void close()} style={styles.later}>Not now</Button>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  card: { width: '100%', maxWidth: 420, borderRadius: 22, borderWidth: 1, padding: 22 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '800', marginBottom: 10 },
  body: { fontSize: 14, lineHeight: 21, marginBottom: 20 },
  later: { marginTop: 10 },
});
