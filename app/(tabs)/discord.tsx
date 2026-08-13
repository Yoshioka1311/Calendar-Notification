import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card } from '@/components/UI/Card';
import { EmptyState } from '@/components/UI/EmptyState';
import { Screen } from '@/components/UI/Screen';
import { useDiscordMonitoring } from '@/contexts/DiscordMonitoringContext';
import { useSettings } from '@/contexts/SettingsContext';
import { discordMonitoringService } from '@/services/discordMonitoringService';
import type { DiscordAlert, DiscordBotLog, DiscordHealthState, DiscordLogLevel, DiscordServiceState } from '@/types/discordMonitoring';

type Section = 'overview' | 'logs' | 'alerts';
type LogFilter = 'all' | 'success' | 'warning' | 'error' | 'critical';

const HEALTH_COPY: Record<DiscordHealthState, string> = {
  healthy: 'Everything is running normally.',
  warning: 'A recoverable issue needs attention.',
  degraded: 'Some Discord functionality is failing.',
  critical: 'A critical Discord issue needs attention.',
  offline: 'The backend cannot currently reach Discord.',
  unknown: 'Monitoring data is unavailable or incomplete.',
};

export default function DiscordScreen() {
  const { health, logs: recentLogs, alerts, unreadCount, loading, error, lastUpdatedAt, refresh, acknowledge } = useDiscordMonitoring();
  const { theme } = useSettings();
  const [section, setSection] = useState<Section>('overview');
  const [filter, setFilter] = useState<LogFilter>('all');
  const [search, setSearch] = useState('');
  const [queriedLogs, setQueriedLogs] = useState<DiscordBotLog[]>();
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (section !== 'logs' || (!search.trim() && filter === 'all')) return;
    const timer = setTimeout(() => {
      setSearching(true);
      void discordMonitoringService.getDiscordLogs({
        search,
        level: filter === 'all' ? undefined : filter,
        limit: 50,
      }).then((result) => setQueriedLogs(result.logs)).finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [filter, search, section]);

  const receivedAt = Date.parse(lastUpdatedAt ?? health?.checkedAt ?? '');
  const stale = health ? receivedAt - Date.parse(health.checkedAt) > health.staleAfterSeconds * 1000 : true;
  const status: DiscordHealthState = error || stale ? 'unknown' : health?.status ?? 'unknown';
  const hasLogQuery = Boolean(search.trim()) || filter !== 'all';
  const visibleLogs = hasLogQuery ? queriedLogs ?? [] : recentLogs;
  const activeAlerts = useMemo(() => alerts.filter((alert) => alert.status === 'active'), [alerts]);
  const resolvedAlerts = useMemo(() => alerts.filter((alert) => alert.status === 'resolved'), [alerts]);

  return (
    <Screen
      title="Discord"
      subtitle="Yoshioka Bot monitoring and health"
      refreshing={loading || searching}
      onRefresh={() => void refresh()}>
      <View style={[styles.segmented, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        {(['overview', 'logs', 'alerts'] as const).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected: section === value }}
            onPress={() => setSection(value)}
            style={[styles.segment, section === value && { backgroundColor: theme.colors.primary }]}>
            <Text style={[styles.segmentText, { color: section === value ? '#FFFFFF' : theme.colors.textMuted }]}>
              {value[0]!.toUpperCase() + value.slice(1)}{value === 'alerts' && unreadCount ? ` ${unreadCount}` : ''}
            </Text>
          </Pressable>
        ))}
      </View>

      {section === 'overview' ? (
        <Overview
          status={status}
          stale={stale}
          health={health}
          error={error}
          lastUpdatedAt={lastUpdatedAt}
          alerts={activeAlerts}
          logs={recentLogs.slice(0, 6)}
          onLogs={() => setSection('logs')}
          onAlerts={() => setSection('alerts')}
        />
      ) : null}
      {section === 'logs' ? (
        <Logs logs={visibleLogs} filter={filter} search={search} onFilter={setFilter} onSearch={setSearch} />
      ) : null}
      {section === 'alerts' ? (
        <Alerts active={activeAlerts} resolved={resolvedAlerts} onAcknowledge={acknowledge} />
      ) : null}
    </Screen>
  );
}

function Overview({ status, stale, health, error, lastUpdatedAt, alerts, logs, onLogs, onAlerts }: {
  status: DiscordHealthState;
  stale: boolean;
  health?: ReturnType<typeof useDiscordMonitoring>['health'];
  error?: string;
  lastUpdatedAt?: string;
  alerts: DiscordAlert[];
  logs: DiscordBotLog[];
  onLogs: () => void;
  onAlerts: () => void;
}) {
  const { theme } = useSettings();
  const color = healthColor(status, theme.colors);
  return (
    <>
      <Card style={[styles.healthCard, { borderColor: color }]}>
        <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>YOSHIOKA DISCORD BOT</Text>
        <View style={styles.statusLine}>
          <View style={[styles.statusDot, { backgroundColor: color }]} />
          <Text style={[styles.healthStatus, { color: theme.colors.text }]}>{capitalize(status)}</Text>
        </View>
        <Text style={[styles.healthCopy, { color: theme.colors.textMuted }]}>{error ?? HEALTH_COPY[status]}</Text>
        <Text style={[styles.checked, { color: stale ? theme.colors.warning : theme.colors.textMuted }]}>
          {stale ? 'Status data may be outdated' : `Last checked ${relativeTime(health?.checkedAt ?? lastUpdatedAt)}`}
        </Text>
      </Card>

      {alerts.length ? (
        <Pressable onPress={onAlerts}>
          <Card style={styles.sectionCard}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Needs attention</Text>
            {alerts.slice(0, 3).map((alert) => <AlertRow key={alert.id} alert={alert} compact />)}
          </Card>
        </Pressable>
      ) : null}

      <Card style={styles.sectionCard}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Services</Text>
        {health ? Object.entries(health.services).map(([name, service]) => (
          <ServiceRow key={name} name={serviceName(name)} state={service.status} detail={service.reason ?? (service.latencyMs ? `${service.latencyMs} ms` : undefined)} />
        )) : <Text style={{ color: theme.colors.textMuted }}>Health data is unavailable.</Text>}
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Last 24 hours</Text>
        <View style={styles.stats}>
          <Stat label="Successful" value={health?.last24Hours.successes ?? 0} color={theme.colors.success} />
          <Stat label="Warnings" value={health?.last24Hours.warnings ?? 0} color={theme.colors.warning} />
          <Stat label="Errors" value={(health?.last24Hours.errors ?? 0) + (health?.last24Hours.critical ?? 0)} color={theme.colors.danger} />
        </View>
        <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
        <InfoPair label="Measured operations" value={String(health?.reliability.measuredOperations ?? 0)} />
        <InfoPair label="Success rate" value={health?.reliability.successRate === undefined ? 'Not enough data' : `${health.reliability.successRate}%`} />
        <InfoPair label="Average latency" value={health?.reliability.averageLatencyMs === undefined ? 'Not enough data' : `${health.reliability.averageLatencyMs} ms`} />
      </Card>

      <Pressable onPress={onLogs}>
        <Card style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Recent activity</Text>
          {logs.length ? logs.map((log) => <LogRow key={log.id} log={log} />) : (
            <Text style={{ color: theme.colors.textMuted }}>No monitoring activity recorded yet.</Text>
          )}
        </Card>
      </Pressable>
    </>
  );
}

function Logs({ logs, filter, search, onFilter, onSearch }: {
  logs: DiscordBotLog[]; filter: LogFilter; search: string;
  onFilter: (value: LogFilter) => void; onSearch: (value: string) => void;
}) {
  const { theme } = useSettings();
  return (
    <>
      <TextInput
        accessibilityLabel="Search Discord monitoring logs"
        placeholder="Search logs..."
        placeholderTextColor={theme.colors.textMuted}
        value={search}
        onChangeText={onSearch}
        maxLength={100}
        style={[styles.search, { color: theme.colors.text, backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
      />
      <View style={styles.filters}>
        {(['all', 'success', 'warning', 'error', 'critical'] as const).map((value) => (
          <Pressable
            key={value}
            onPress={() => onFilter(value)}
            style={[styles.filter, { borderColor: filter === value ? theme.colors.primary : theme.colors.border, backgroundColor: filter === value ? theme.colors.primarySoft : theme.colors.surface }]}>
            <Text style={{ color: filter === value ? theme.colors.primary : theme.colors.textMuted, fontSize: 11, fontWeight: '700' }}>{capitalize(value)}</Text>
          </Pressable>
        ))}
      </View>
      <Card>
        {logs.length ? logs.map((log) => <LogRow key={log.id} log={log} />) : (
          <EmptyState title="No matching activity" message="Try another search or log level." />
        )}
      </Card>
    </>
  );
}

function Alerts({ active, resolved, onAcknowledge }: { active: DiscordAlert[]; resolved: DiscordAlert[]; onAcknowledge: (id: string) => Promise<void> }) {
  const { theme } = useSettings();
  return (
    <>
      <Text style={[styles.groupTitle, { color: theme.colors.textMuted }]}>ACTIVE</Text>
      <Card style={styles.sectionCard}>
        {active.length ? active.map((alert) => <AlertRow key={alert.id} alert={alert} onAcknowledge={onAcknowledge} />) : (
          <EmptyState title="No active alerts" message="Everything requiring attention has been resolved." />
        )}
      </Card>
      <Text style={[styles.groupTitle, { color: theme.colors.textMuted }]}>RESOLVED</Text>
      <Card>
        {resolved.length ? resolved.map((alert) => <AlertRow key={alert.id} alert={alert} />) : (
          <Text style={{ color: theme.colors.textMuted }}>No recovery history yet.</Text>
        )}
      </Card>
    </>
  );
}

function LogRow({ log }: { log: DiscordBotLog }) {
  const { theme } = useSettings();
  return (
    <Pressable onPress={() => router.push(`/discord/log/${log.id}` as never)} style={[styles.item, { borderBottomColor: theme.colors.border }]}>
      <View style={[styles.levelMark, { backgroundColor: levelColor(log.level, theme.colors) }]} />
      <View style={styles.itemCopy}>
        <Text style={[styles.itemTitle, { color: theme.colors.text }]} numberOfLines={1}>{log.action}</Text>
        <Text style={[styles.itemMessage, { color: theme.colors.textMuted }]} numberOfLines={2}>{log.message}</Text>
      </View>
      <Text style={[styles.itemTime, { color: theme.colors.textMuted }]}>{timeOnly(log.timestamp)}</Text>
    </Pressable>
  );
}

function AlertRow({ alert, compact, onAcknowledge }: { alert: DiscordAlert; compact?: boolean; onAcknowledge?: (id: string) => Promise<void> }) {
  const { theme } = useSettings();
  return (
    <Pressable onPress={() => router.push(`/discord/alert/${alert.id}` as never)} style={[styles.item, { borderBottomColor: theme.colors.border }]}>
      <View style={[styles.levelMark, { backgroundColor: alert.status === 'resolved' ? theme.colors.success : levelColor(alert.severity, theme.colors) }]} />
      <View style={styles.itemCopy}>
        <Text style={[styles.itemTitle, { color: theme.colors.text }]} numberOfLines={1}>{alert.title}</Text>
        <Text style={[styles.itemMessage, { color: theme.colors.textMuted }]} numberOfLines={compact ? 1 : 2}>{alert.message}</Text>
        {!compact && alert.status === 'active' && !alert.acknowledgedAt && onAcknowledge ? (
          <Pressable onPress={(event) => { event.stopPropagation(); void onAcknowledge(alert.id); }}>
            <Text style={[styles.acknowledge, { color: theme.colors.primary }]}>Acknowledge</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={[styles.itemTime, { color: theme.colors.textMuted }]}>{relativeTime(alert.lastOccurredAt)}</Text>
    </Pressable>
  );
}

function ServiceRow({ name, state, detail }: { name: string; state: DiscordServiceState; detail?: string }) {
  const { theme } = useSettings();
  return (
    <View style={styles.serviceRow}>
      <View style={styles.serviceCopy}>
        <Text style={[styles.serviceName, { color: theme.colors.text }]}>{name}</Text>
        {detail ? <Text style={[styles.serviceDetail, { color: theme.colors.textMuted }]}>{detail}</Text> : null}
      </View>
      <View style={styles.serviceState}>
        <View style={[styles.smallDot, { backgroundColor: serviceColor(state, theme.colors) }]} />
        <Text style={[styles.serviceLabel, { color: theme.colors.textMuted }]}>{capitalize(state)}</Text>
      </View>
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  const { theme } = useSettings();
  return <View style={styles.stat}><Text style={[styles.statValue, { color }]}>{value}</Text><Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>{label}</Text></View>;
}

function InfoPair({ label, value }: { label: string; value: string }) {
  const { theme } = useSettings();
  return <View style={styles.infoPair}><Text style={{ color: theme.colors.textMuted }}>{label}</Text><Text style={{ color: theme.colors.text, fontWeight: '700' }}>{value}</Text></View>;
}

function capitalize(value: string) { return value[0]!.toUpperCase() + value.slice(1); }
function timeOnly(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '--:--' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function relativeTime(value?: string) {
  if (!value) return 'never';
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 1000));
  if (!Number.isFinite(seconds)) return 'unknown';
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
function serviceName(value: string) { return ({ discordApi: 'Discord API', backend: 'Yoshioka Backend', database: 'Database', discordAuthentication: 'Discord Authentication', announcementService: 'Announcement Service' } as Record<string, string>)[value] ?? value; }
function healthColor(status: DiscordHealthState, colors: ReturnType<typeof useSettings>['theme']['colors']) { if (status === 'healthy') return colors.success; if (status === 'warning') return colors.warning; if (['critical', 'offline'].includes(status)) return colors.danger; if (status === 'degraded') return '#E8792E'; return colors.textMuted; }
function serviceColor(status: DiscordServiceState, colors: ReturnType<typeof useSettings>['theme']['colors']) { if (status === 'operational') return colors.success; if (status === 'degraded') return colors.warning; if (status === 'offline') return colors.danger; return colors.textMuted; }
function levelColor(level: DiscordLogLevel | DiscordAlert['severity'], colors: ReturnType<typeof useSettings>['theme']['colors']) { if (level === 'success') return colors.success; if (level === 'warning') return colors.warning; if (['error', 'critical'].includes(level)) return colors.danger; return colors.primary; }

const styles = StyleSheet.create({
  segmented: { flexDirection: 'row', padding: 4, borderRadius: 15, borderWidth: 1, marginBottom: 16 },
  segment: { flex: 1, minHeight: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 11, fontWeight: '800' },
  healthCard: { marginBottom: 14, borderWidth: 1 },
  eyebrow: { fontSize: 10, letterSpacing: 1.2, fontWeight: '800' },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  statusDot: { width: 14, height: 14, borderRadius: 7 },
  healthStatus: { fontSize: 26, lineHeight: 32, fontWeight: '800' },
  healthCopy: { fontSize: 13, lineHeight: 19, marginTop: 6 },
  checked: { fontSize: 10, fontWeight: '700', marginTop: 13 },
  sectionCard: { marginBottom: 14 },
  sectionTitle: { fontSize: 17, fontWeight: '800', marginBottom: 8 },
  item: { minHeight: 65, flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  levelMark: { width: 4, minHeight: 42, borderRadius: 2 },
  itemCopy: { flex: 1 },
  itemTitle: { fontSize: 13, fontWeight: '700' },
  itemMessage: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  itemTime: { fontSize: 9, marginTop: 2 },
  acknowledge: { fontSize: 11, fontWeight: '800', marginTop: 7 },
  serviceRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  serviceCopy: { flex: 1 },
  serviceName: { fontSize: 13, fontWeight: '700' },
  serviceDetail: { fontSize: 10, marginTop: 2 },
  serviceState: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  smallDot: { width: 8, height: 8, borderRadius: 4 },
  serviceLabel: { fontSize: 10, fontWeight: '700' },
  stats: { flexDirection: 'row' },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 25, fontWeight: '800' },
  statLabel: { fontSize: 9, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 13 },
  infoPair: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  search: { minHeight: 46, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 14, marginBottom: 10 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  filter: { minHeight: 34, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  groupTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1.1, marginLeft: 4, marginBottom: 7, marginTop: 8 },
});
