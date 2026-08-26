import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import type { CalendarEvent } from '@/types/event';
import { combineLocalDateTime, formatShortDate } from '@/utils/date';
import { calculateReminderDate } from '@/utils/reminder';

export const EVENT_REMINDER_CHANNEL_ID = 'event-reminders';

export type NotificationResult =
  | { status: 'scheduled'; notificationId: string; scheduledFor: Date }
  | { status: 'disabled' | 'permission-denied' | 'past' | 'unavailable' | 'error'; error?: string };

export type NotificationPermissionSnapshot = {
  granted: boolean;
  canAskAgain: boolean;
  status: Notifications.PermissionStatus;
};

function debugLog(message: string, details?: Record<string, unknown>): void {
  // eslint-disable-next-line no-console -- deliberately development-only diagnostics
  if (__DEV__) console.info(`[notifications] ${message}`, details ?? '');
}

function debugError(message: string, caught: unknown, details?: Record<string, unknown>): void {
  // eslint-disable-next-line no-console -- deliberately development-only diagnostics
  if (__DEV__) console.error(`[notifications] ${message}`, { ...details, error: caught instanceof Error ? caught.message : String(caught) });
}

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

/** Android 13 only shows the permission prompt after a channel exists. */
export async function prepareNotifications(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(EVENT_REMINDER_CHANNEL_ID, {
    name: 'Event Reminders',
    description: 'High-priority reminders for events saved in Yoshioka Calendar',
    importance: Notifications.AndroidImportance.HIGH,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    vibrationPattern: [0, 250, 150, 250],
    lightColor: '#5B5BD6',
    showBadge: true,
    sound: 'default',
  });
}

function localIso(value: Date): string {
  const offsetMinutes = -value.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const hours = String(Math.floor(Math.abs(offsetMinutes) / 60)).padStart(2, '0');
  const minutes = String(Math.abs(offsetMinutes) % 60).padStart(2, '0');
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}T${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}:${String(value.getSeconds()).padStart(2, '0')}${sign}${hours}:${minutes}`;
}

function permissionIsGranted(permission: Notifications.NotificationPermissionsStatus): boolean {
  if (permission.granted) return true;
  return Platform.OS === 'ios' && permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export async function getNotificationPermissionStatus(): Promise<NotificationPermissionSnapshot> {
  if (Platform.OS === 'web') {
    return { granted: false, canAskAgain: false, status: Notifications.PermissionStatus.UNDETERMINED };
  }
  const permission = await Notifications.getPermissionsAsync();
  return {
    granted: permissionIsGranted(permission),
    canAskAgain: permission.canAskAgain,
    status: permission.status,
  };
}

export async function getNotificationPermission(): Promise<boolean> {
  return (await getNotificationPermissionStatus()).granted;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  // This must happen before the prompt on Android 13+.
  await prepareNotifications();
  const current = await Notifications.getPermissionsAsync();
  if (permissionIsGranted(current)) return true;
  if (!current.canAskAgain) return false;

  const requested = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  debugLog('permission result', { status: requested.status, granted: requested.granted, canAskAgain: requested.canAskAgain });
  return permissionIsGranted(requested);
}

function reminderBody(event: CalendarEvent, scheduledFor: Date): string {
  const eventDate = combineLocalDateTime(event.startDate, event.startTime);
  const deliveryDay = new Date(scheduledFor.getFullYear(), scheduledFor.getMonth(), scheduledFor.getDate()).getTime();
  const eventDay = eventDate
    ? new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate()).getTime()
    : deliveryDay;
  const dayDifference = Math.round((eventDay - deliveryDay) / 86_400_000);
  const when = dayDifference === 0
    ? `วันนี้ เวลา ${event.startTime} น.`
    : dayDifference === 1
      ? `พรุ่งนี้ เวลา ${event.startTime} น.`
      : `${formatShortDate(event.startDate, 'th-TH')} เวลา ${event.startTime} น.`;
  return `${event.title}\n${when}`;
}

export async function scheduleEventNotification(event: CalendarEvent): Promise<NotificationResult> {
  if (event.phoneReminderEnabled === false || event.reminderMinutesBefore < 0) return { status: 'disabled' };
  if (Platform.OS === 'web') return { status: 'unavailable' };

  const eventDate = combineLocalDateTime(event.startDate, event.startTime);
  if (!eventDate) throw new Error('The event date or time is invalid.');

  const scheduledFor = calculateReminderDate(event.startDate, event.startTime, event.reminderMinutesBefore);
  if (!scheduledFor) throw new Error('The reminder date is invalid.');
  if (scheduledFor.getTime() <= Date.now()) {
    debugLog('not scheduled because reminder time is in the past', {
      event: event.title,
      eventAt: localIso(eventDate),
      reminderMinutesBefore: event.reminderMinutesBefore,
      scheduledFor: localIso(scheduledFor),
    });
    return { status: 'past' };
  }

  try {
    await prepareNotifications();
    const permission = await getNotificationPermissionStatus();
    if (!permission.granted) return { status: 'permission-denied' };

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Yoshioka',
        body: reminderBody(event, scheduledFor),
        data: { eventId: event.id, route: `/event/${event.id}` },
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: scheduledFor,
        channelId: Platform.OS === 'android' ? EVENT_REMINDER_CHANNEL_ID : undefined,
      },
    });

    debugLog('scheduled event reminder', {
      event: event.title,
      eventAt: localIso(eventDate),
      reminderMinutesBefore: event.reminderMinutesBefore,
      scheduledFor: localIso(scheduledFor),
      notificationId,
    });
    return { status: 'scheduled', notificationId, scheduledFor };
  } catch (caught) {
    debugError('failed to schedule event reminder', caught, { eventId: event.id, scheduledFor: scheduledFor.toISOString() });
    return { status: 'error', error: caught instanceof Error ? caught.message : 'Unknown notification error' };
  }
}

export async function cancelEventNotification(notificationId?: string): Promise<void> {
  if (!notificationId || Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
    debugLog('cancelled event reminder', { notificationId });
  } catch (caught) {
    debugError('failed to cancel event reminder', caught, { notificationId });
    throw caught;
  }
}

export async function rescheduleEventNotification(event: CalendarEvent): Promise<NotificationResult> {
  await cancelEventNotification(event.notificationId);
  return scheduleEventNotification({ ...event, notificationId: undefined });
}

export async function getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
  if (Platform.OS === 'web') return [];
  return Notifications.getAllScheduledNotificationsAsync();
}

export async function scheduleTestNotification(seconds: number): Promise<string> {
  if (Platform.OS === 'web') throw new Error('Notifications are unavailable on web.');
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 3600) throw new Error('Test delay must be between 1 and 3600 seconds.');
  const permitted = await requestNotificationPermission();
  if (!permitted) throw new Error('Notification permission is not enabled.');

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Yoshioka',
      body: 'Notification test successful\nNative notifications are working.',
      data: { test: true },
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      repeats: false,
      channelId: Platform.OS === 'android' ? EVENT_REMINDER_CHANNEL_ID : undefined,
    },
  });
  debugLog('scheduled test notification', { seconds, scheduledFor: localIso(new Date(Date.now() + seconds * 1000)), notificationId });
  return notificationId;
}
