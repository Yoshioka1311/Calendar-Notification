import { authenticatedBackendRequest } from '@/services/lineIntegrationService';
import type {
  DiscordAlert,
  DiscordBotLog,
  DiscordHealth,
  DiscordLogQuery,
} from '@/types/discordMonitoring';

export async function getDiscordHealth(): Promise<DiscordHealth> {
  return authenticatedBackendRequest<DiscordHealth>('/api/discord/health');
}

export async function getDiscordLogs(query: DiscordLogQuery = {}): Promise<{ logs: DiscordBotLog[]; nextCursor?: string }> {
  const params = new URLSearchParams();
  if (query.level) params.set('level', query.level);
  if (query.category) params.set('category', query.category);
  if (query.search?.trim()) params.set('search', query.search.trim().slice(0, 100));
  if (query.cursor) params.set('cursor', query.cursor);
  params.set('limit', String(query.limit ?? 30));
  return authenticatedBackendRequest(`/api/discord/logs?${params}`);
}

export async function getDiscordLog(id: string): Promise<DiscordBotLog> {
  const response = await authenticatedBackendRequest<{ log: DiscordBotLog }>(`/api/discord/logs/${encodeURIComponent(id)}`);
  return response.log;
}

export async function getDiscordAlerts(status: 'active' | 'resolved' | 'all' = 'active'): Promise<DiscordAlert[]> {
  const response = await authenticatedBackendRequest<{ alerts: DiscordAlert[] }>(`/api/discord/alerts?status=${status}`);
  return response.alerts;
}

export async function getDiscordAlert(id: string): Promise<DiscordAlert> {
  const response = await authenticatedBackendRequest<{ alert: DiscordAlert }>(`/api/discord/alerts/${encodeURIComponent(id)}`);
  return response.alert;
}

export async function acknowledgeDiscordAlert(id: string): Promise<void> {
  await authenticatedBackendRequest(`/api/discord/alerts/${encodeURIComponent(id)}/acknowledge`, { method: 'POST' });
}

export async function markDiscordAlertDelivered(id: string): Promise<void> {
  await authenticatedBackendRequest(`/api/discord/alerts/${encodeURIComponent(id)}/delivered`, { method: 'POST' });
}

export async function registerDiscordPushDevice(input: {
  token: string;
  platform: string;
  warnings: boolean;
  errors: boolean;
  recovery: boolean;
}): Promise<void> {
  await authenticatedBackendRequest('/api/discord/push/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function registerDiscordCommands(): Promise<{ guilds: number; commands: number; failedGuilds: number }> {
  return authenticatedBackendRequest('/api/discord/commands/register', { method: 'POST' });
}

export const discordMonitoringService = {
  getDiscordHealth,
  getDiscordLogs,
  getDiscordLog,
  getDiscordAlerts,
  getDiscordAlert,
  acknowledgeDiscordAlert,
  markDiscordAlertDelivered,
  registerDiscordPushDevice,
  registerDiscordCommands,
};
