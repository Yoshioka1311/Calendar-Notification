import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/UI/Card';
import { Screen } from '@/components/UI/Screen';
import { useSettings } from '@/contexts/SettingsContext';
import { discordMonitoringService } from '@/services/discordMonitoringService';
import type { DiscordBotLog } from '@/types/discordMonitoring';

export default function DiscordLogDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { theme } = useSettings();
  const [log, setLog] = useState<DiscordBotLog>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!id) return;
    void discordMonitoringService.getDiscordLog(id).then(setLog).catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load log.'));
  }, [id]);

  return (
    <Screen title={log?.action ?? 'Activity Details'} subtitle="Discord monitoring record" right={<BackButton />}>
      {error ? <Card><Text style={{ color: theme.colors.danger }}>{error}</Text></Card> : null}
      {log ? (
        <Card>
          <Detail label="Status" value={log.level.toUpperCase()} />
          <Detail label="Category" value={log.category} />
          <Detail label="Time" value={new Date(log.timestamp).toLocaleString()} />
          <Detail label="Message" value={log.message} />
          {log.errorCode ? <Detail label="Error code" value={log.errorCode} /> : null}
          {log.channelId ? <Detail label="Channel ID" value={masked(log.channelId)} /> : null}
          {log.guildId ? <Detail label="Server ID" value={masked(log.guildId)} /> : null}
          {log.discordMessageId ? <Detail label="Discord Message ID" value={masked(log.discordMessageId)} /> : null}
          {log.requestId ? <Detail label="Request ID" value={masked(log.requestId)} /> : null}
          {log.durationMs !== undefined ? <Detail label="Request duration" value={`${log.durationMs} ms`} /> : null}
          {log.metadata && Object.keys(log.metadata).length ? <Detail label="Safe metadata" value={JSON.stringify(log.metadata, null, 2)} /> : null}
        </Card>
      ) : !error ? <Text style={{ color: theme.colors.textMuted }}>Loading activity…</Text> : null}
    </Screen>
  );
}

function BackButton() {
  const { theme } = useSettings();
  return <Pressable onPress={() => router.back()} style={[styles.back, { backgroundColor: theme.colors.primarySoft }]}><Text style={{ color: theme.colors.primary, fontWeight: '800' }}>Back</Text></Pressable>;
}

function Detail({ label, value }: { label: string; value: string }) {
  const { theme } = useSettings();
  return <View style={[styles.detail, { borderBottomColor: theme.colors.border }]}><Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text><Text selectable style={[styles.value, { color: theme.colors.text }]}>{value}</Text></View>;
}

function masked(value: string) { return value.length <= 4 ? '••••' : `${'•'.repeat(Math.min(value.length - 4, 12))}${value.slice(-4)}`; }

const styles = StyleSheet.create({
  back: { minHeight: 40, borderRadius: 12, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  detail: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
  value: { fontSize: 13, lineHeight: 20, marginTop: 5 },
});
