export interface Env {
  DB: D1Database;
  LINE_CHANNEL_SECRET?: string;
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  APP_TIME_ZONE: string;
  DISCORD_BOT_TOKEN?: string;
  DISCORD_ALLOWED_GUILD_IDS?: string;
  DISCORD_ALLOWED_CHANNEL_IDS?: string;
}

export type DiscordHealthState = 'healthy' | 'warning' | 'degraded' | 'critical' | 'offline' | 'unknown';
export type DiscordServiceState = 'operational' | 'degraded' | 'offline' | 'unknown';
export type DiscordLogLevel = 'info' | 'success' | 'warning' | 'error' | 'critical';
export type DiscordLogCategory = 'discord' | 'announcement' | 'api' | 'backend' | 'database' | 'security' | 'permission' | 'rate_limit' | 'system';

export interface DiscordBotLog {
  id: string;
  timestamp: string;
  level: DiscordLogLevel;
  category: DiscordLogCategory;
  action: string;
  message: string;
  guildId?: string;
  channelId?: string;
  discordMessageId?: string;
  requestId?: string;
  errorCode?: string;
  durationMs?: number;
  successful?: boolean;
  metadata?: Record<string, unknown>;
  fingerprint?: string;
}

export interface DiscordAlert {
  id: string;
  logId: string;
  fingerprint: string;
  severity: 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  status: 'active' | 'resolved';
  occurrenceCount: number;
  firstOccurredAt: string;
  lastOccurredAt: string;
  lastNotifiedAt?: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  recoveryLogId?: string;
  notificationPending?: boolean;
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
    params?: { date?: string; time?: string; datetime?: string };
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
  reminderMinutesBefore: number;
  parserConfidence?: number;
}

export type EventCategory = 'Personal' | 'Work' | 'School' | 'Study' | 'Assignment' | 'Exam' | 'Meeting' | 'Health' | 'Travel' | 'Exercise' | 'Important' | 'Other';

export interface ParsedIncomingEvent {
  title: string;
  startDateTime: string;
  endDateTime?: string;
  localDate: string;
  startTime: string;
  endTime?: string;
  category: EventCategory;
  parserConfidence?: number;
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

export type LineEventSessionState = 'selecting_date' | 'selecting_time' | 'awaiting_description' | 'selecting_reminder' | 'confirming';

export interface LineEventSession {
  lineUserId: string;
  state: LineEventSessionState;
  localDate?: string;
  startTime?: string;
  title?: string;
  category?: EventCategory;
  reminderMinutesBefore?: number;
  originalText?: string;
  sourceMessageId?: string;
  parserConfidence?: number;
  expiresAt: string;
}

export interface LineReminderRecord {
  eventKey: string;
  ownerDeviceId?: string;
  lineUserId: string;
  title: string;
  startDateTime: string;
  eventAt: string;
  reminderMinutesBefore: number;
  reminderAt: string;
  enabled: boolean;
}

export interface DueLineReminder {
  eventKey: string;
  lineUserId: string;
  title: string;
  startDateTime: string;
  reminderMinutesBefore: number;
}
