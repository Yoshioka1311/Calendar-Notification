import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import type { CalendarEvent } from '@/types/event';
import { combineLocalDateTime, formatTime } from '@/utils/date';

export type NotificationResult =
  | { status: 'scheduled'; notificationId: string; scheduledFor: Date }
  | { status: 'disabled' | 'permission-denied' | 'past' | 'unavailable' | 'error' };

export function configureNotificationPresentation(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function prepareNotifications(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('event-reminders', {
      name: 'Event reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 220, 160, 220],
      lightColor: '#5B5BD6',
    });
  }
}

type PermissionSnapshot = { granted: boolean; canAskAgain: boolean };

export async function getNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const permission = (await Notifications.getPermissionsAsync()) as unknown as PermissionSnapshot;
  return permission.granted;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const current = (await Notifications.getPermissionsAsync()) as unknown as PermissionSnapshot;
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = (await Notifications.requestPermissionsAsync()) as unknown as PermissionSnapshot;
  return requested.granted;
}

export async function scheduleEventNotification(event: CalendarEvent): Promise<NotificationResult> {
  if (event.reminderMinutesBefore <= 0) return { status: 'disabled' };
  if (Platform.OS === 'web') return { status: 'unavailable' };

  const eventDate = combineLocalDateTime(event.startDate, event.startTime);
  if (!eventDate) throw new Error('The event date or time is invalid.');

  const scheduledFor = new Date(eventDate.getTime() - event.reminderMinutesBefore * 60_000);
  if (scheduledFor.getTime() <= Date.now()) return { status: 'past' };

  const permitted = await requestNotificationPermission();
  if (!permitted) return { status: 'permission-denied' };

  await prepareNotifications();
  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: event.reminderMinutesBefore === 1440 ? 'Tomorrow' : 'Event reminder',
      body: `${event.title} • ${formatTime(event.startTime)}`,
      data: { eventId: event.id },
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: scheduledFor,
      channelId: Platform.OS === 'android' ? 'event-reminders' : undefined,
    },
  });

  return { status: 'scheduled', notificationId, scheduledFor };
}

export async function cancelEventNotification(notificationId?: string): Promise<void> {
  if (!notificationId || Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}
