import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { DuplicateExternalEventError, eventService } from '@/services/eventService';
import { EVENT_CATEGORIES } from '@/types/event';
import type { CalendarEvent } from '@/types/event';
import type { LineAcceptedEvent, LineConnectionStatus, LinePairingSession, LineSyncResult } from '@/types/lineIntegration';
import { detectEventCategory } from '@/utils/eventCategory';

const API_URL = 'https://calendar-notification.violetar1311.workers.dev';
const INSTALLATION_KEY = 'line.installation-id.v1';
const TOKEN_KEY = 'line.device-token.v1';

async function getStored(key: string): Promise<string | null> {
  return Platform.OS === 'web' ? AsyncStorage.getItem(key) : SecureStore.getItemAsync(key);
}

async function setStored(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') await AsyncStorage.setItem(key, value);
  else await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}

async function getInstallationId(): Promise<string> {
  const stored = await getStored(INSTALLATION_KEY);
  if (stored) return stored;
  const created = Crypto.randomUUID();
  await setStored(INSTALLATION_KEY, created);
  return created;
}

async function apiRequest<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(body.error || 'LINE connection is unavailable.');
    return body as T;
  } catch (caught) {
    if (caught instanceof Error && caught.name === 'AbortError') throw new Error('LINE connection timed out.');
    throw caught;
  } finally {
    clearTimeout(timer);
  }
}

export async function authenticatedBackendRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getStored(TOKEN_KEY);
  if (!token) throw new Error('Connect LINE in Settings to verify this device as the owner.');
  return apiRequest<T>(path, init, token);
}

export async function startLinePairing(): Promise<LinePairingSession> {
  const response = await apiRequest<{ token: string; pairingCode: string; expiresAt: string }>(
    '/api/devices/pairing/start',
    { method: 'POST', body: JSON.stringify({ installationId: await getInstallationId(), platform: Platform.OS }) },
  );
  await setStored(TOKEN_KEY, response.token);
  return { pairingCode: response.pairingCode, expiresAt: response.expiresAt };
}

export async function getLineConnectionStatus(): Promise<LineConnectionStatus> {
  const token = await getStored(TOKEN_KEY);
  if (!token) return 'not-started';
  try {
    const response = await apiRequest<{ connected: boolean }>('/api/devices/me', { method: 'GET' }, token);
    return response.connected ? 'connected' : 'waiting';
  } catch (caught) {
    if (caught instanceof Error && caught.message === 'Unauthorized.') return 'not-started';
    throw caught;
  }
}

function eventDraft(event: LineAcceptedEvent) {
  const endTime = event.endDateTime?.slice(11, 16);
  return {
    title: event.title,
    startDate: event.startDateTime.slice(0, 10),
    startTime: event.startDateTime.slice(11, 16),
    endTime: endTime || undefined,
    category: EVENT_CATEGORIES.includes(event.category) && event.category !== 'Other'
      ? event.category
      : detectEventCategory(event.title),
    notes: event.notes,
    reminderMinutesBefore: Number.isInteger(event.reminderMinutesBefore) && event.reminderMinutesBefore >= 0
      ? event.reminderMinutesBefore
      : 1440,
    phoneReminderEnabled: true,
    lineReminderEnabled: true,
  };
}

export async function syncLineEvents(): Promise<LineSyncResult> {
  const token = await getStored(TOKEN_KEY);
  if (!token) return { imported: 0, duplicates: 0 };
  const response = await apiRequest<{ events: LineAcceptedEvent[] }>('/api/events/accepted', { method: 'GET' }, token);
  let imported = 0;
  let duplicates = 0;
  for (const incoming of response.events) {
    let shouldAcknowledge = false;
    try {
      await eventService.createEvent({
        ...eventDraft(incoming),
        source: 'line',
        externalEventId: incoming.externalEventId,
        originalText: incoming.originalText,
        parserConfidence: incoming.parserConfidence,
      });
      imported += 1;
      shouldAcknowledge = true;
    } catch (caught) {
      if (caught instanceof DuplicateExternalEventError) {
        duplicates += 1;
        shouldAcknowledge = true;
      } else {
        throw caught;
      }
    }
    if (shouldAcknowledge) {
      await apiRequest(`/api/events/${encodeURIComponent(incoming.id)}/imported`, { method: 'POST' }, token);
    }
  }
  return { imported, duplicates };
}

export async function syncEventReminder(event: CalendarEvent): Promise<'synced' | 'disabled' | 'not-connected' | 'error'> {
  const token = await getStored(TOKEN_KEY);
  if (!token) return event.lineReminderEnabled ? 'not-connected' : 'disabled';
  try {
    await apiRequest('/api/reminders/upsert', {
      method: 'POST',
      body: JSON.stringify({
        eventId: event.id,
        externalEventId: event.externalEventId,
        title: event.title,
        startDateTime: `${event.startDate}T${event.startTime}:00+07:00`,
        reminderMinutesBefore: event.reminderMinutesBefore,
        enabled: event.lineReminderEnabled && event.reminderMinutesBefore >= 0,
      }),
    }, token);
    return event.lineReminderEnabled && event.reminderMinutesBefore >= 0 ? 'synced' : 'disabled';
  } catch (caught) {
    if (caught instanceof Error && caught.message.includes('Connect LINE')) return 'not-connected';
    // eslint-disable-next-line no-console -- deliberately development-only diagnostics
    if (__DEV__) console.error('[line-reminders] sync failed', { eventId: event.id, error: caught instanceof Error ? caught.message : String(caught) });
    return 'error';
  }
}

export const lineIntegrationService = { startLinePairing, getLineConnectionStatus, syncLineEvents, syncEventReminder };
