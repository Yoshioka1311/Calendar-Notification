import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/UI/Button';
import { Card } from '@/components/UI/Card';
import { Screen } from '@/components/UI/Screen';
import { useDiscordMonitoring } from '@/contexts/DiscordMonitoringContext';
import { useSettings } from '@/contexts/SettingsContext';
import { discordMonitoringService } from '@/services/discordMonitoringService';
import type { DiscordAlert } from '@/types/discordMonitoring';

export default function DiscordAlertDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { acknowledge } = useDiscordMonitoring();
  const { theme } = useSettings();
  const [alert, setAlert] = useState<DiscordAlert>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    void discordMonitoringService.getDiscordAlert(id).then(setAlert).catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load alert.'));
  }, [id]);

  const runAcknowledge = async () => {
    if (!alert) return;
    setBusy(true);
    try {
      await acknowledge(alert.id);
      setAlert({ ...alert, acknowledgedAt: new Date().toISOString() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={alert?.title ?? 'Alert Details'} subtitle="Discord monitoring alert" right={<BackButton />}>
      {error ? <Card><Text style={{ color: theme.colors.danger }}>{error}</Text></Card> : null}
      {alert ? (
        <Card style={{ borderColor: alert.status === 'resolved' ? theme.colors.success : alert.severity === 'warning' ? theme.colors.warning : theme.colors.danger }}>
          <Detail label="Status" value={alert.status === 'resolved' ? 'Resolved' : alert.severity.toUpperCase()} />
          <Detail label="Explanation" value={alert.message} />
          <Detail label="First occurred" value={new Date(alert.firstOccurredAt).toLocaleString()} />
          <Detail label="Last occurred" value={new Date(alert.lastOccurredAt).toLocaleString()} />
          <Detail label="Occurrences" value={String(alert.occurrenceCount)} />
          <Detail label="Acknowledgement" value={alert.acknowledgedAt ? `Acknowledged ${new Date(alert.acknowledgedAt).toLocaleString()}` : 'Not acknowledged'} />
          {alert.resolvedAt ? <Detail label="Recovery" value={`Resolved ${new Date(alert.resolvedAt).toLocaleString()}`} /> : null}
          {alert.status === 'active' && !alert.acknowledgedAt ? <Button loading={busy} onPress={() => void runAcknowledge()} style={styles.button}>Acknowledge</Button> : null}
          <Button variant="secondary" onPress={() => router.push(`/discord/log/${alert.logId}` as never)} style={styles.button}>View related activity</Button>
        </Card>
      ) : !error ? <Text style={{ color: theme.colors.textMuted }}>Loading alert…</Text> : null}
    </Screen>
  );
}

function BackButton() {
  const { theme } = useSettings();
  return <Pressable onPress={() => router.back()} style={[styles.back, { backgroundColor: theme.colors.primarySoft }]}><Text style={{ color: theme.colors.primary, fontWeight: '800' }}>Back</Text></Pressable>;
}

function Detail({ label, value }: { label: string; value: string }) {
  const { theme } = useSettings();
  return <View style={[styles.detail, { borderBottomColor: theme.colors.border }]}><Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text><Text style={[styles.value, { color: theme.colors.text }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  back: { minHeight: 40, borderRadius: 12, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  detail: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
  value: { fontSize: 13, lineHeight: 20, marginTop: 5 },
  button: { marginTop: 12 },
});
