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

export interface DiscordHealth {
  status: DiscordHealthState;
  checkedAt: string;
  staleAfterSeconds: number;
  services: Record<string, {
    status: DiscordServiceState;
    checkedAt: string;
    latencyMs?: number;
    errorCode?: string;
    lastSuccessAt?: string;
    reason?: string;
  }>;
  last24Hours: { successes: number; warnings: number; errors: number; critical: number };
  reliability: {
    measuredOperations: number;
    successRate?: number;
    averageLatencyMs?: number;
    lastSuccessfulAction?: string;
  };
}

export type DiscordLogQuery = {
  level?: DiscordLogLevel;
  category?: DiscordLogCategory;
  search?: string;
  cursor?: string;
  limit?: number;
};
