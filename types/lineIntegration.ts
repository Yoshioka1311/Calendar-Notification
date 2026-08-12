import type { EventCategory } from '@/types/event';

export type LineConnectionStatus = 'not-started' | 'waiting' | 'connected';

export interface LinePairingSession {
  pairingCode: string;
  expiresAt: string;
}

export interface LineSyncResult {
  imported: number;
  duplicates: number;
}

export interface LineAcceptedEvent {
  id: string;
  externalEventId: string;
  title: string;
  startDateTime: string;
  endDateTime?: string;
  notes?: string;
  originalText: string;
  category: EventCategory;
  reminderMinutesBefore: number;
  parserConfidence?: number;
}
