export interface Env {
  DB: D1Database;
  LINE_CHANNEL_SECRET?: string;
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  APP_TIME_ZONE: string;
}

export interface LineWebhookBody {
  destination?: string;
  events: LineWebhookEvent[];
}

export interface LineWebhookEvent {
  type: string;
  webhookEventId: string;
  replyToken?: string;
  timestamp?: number;
  deliveryContext?: { isRedelivery?: boolean };
  source?: {
    type?: string;
    userId?: string;
    groupId?: string;
    roomId?: string;
  };
  message?: {
    type?: string;
    id?: string;
    text?: string;
  };
  postback?: {
    data?: string;
  };
}

export interface AppDevice {
  id: string;
  installationId: string;
  lineUserId?: string;
}

export interface AcceptedEvent {
  id: string;
  externalEventId: string;
  title: string;
  startDateTime: string;
  endDateTime?: string;
  notes?: string;
  originalText: string;
  category: EventCategory;
}

export type EventCategory = 'Personal' | 'Work' | 'School' | 'Meeting' | 'Health' | 'Important' | 'Other';

export interface ParsedIncomingEvent {
  title: string;
  startDateTime: string;
  endDateTime?: string;
  localDate: string;
  startTime: string;
  endTime?: string;
  category: EventCategory;
}

export interface IncomingEventRecord extends ParsedIncomingEvent {
  id: string;
  webhookEventId: string;
  externalEventId: string;
  lineUserId: string;
  messageId: string;
  originalText: string;
  notes: string;
}
