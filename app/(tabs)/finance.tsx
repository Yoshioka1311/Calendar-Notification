import * as ImagePicker from 'expo-image-picker';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type DimensionValue,
} from 'react-native';

import { Card } from '@/components/UI/Card';
import { EmptyState } from '@/components/UI/EmptyState';
import { Screen } from '@/components/UI/Screen';
import { useFinance } from '@/contexts/FinanceContext';
import { useSettings } from '@/contexts/SettingsContext';
import { radius, spacing } from '@/theme';
import type { FinanceCategory, FinanceTransaction, FinanceTransactionType } from '@/types/finance';
import { formatTHB, signedTHB } from '@/utils/finance';

type SymbolName = SymbolViewProps['name'];

function symbol(ios: string, android: string, web: string): SymbolName {
  return { ios, android, web } as SymbolName;
}

const CATEGORY_SYMBOLS: Record<string, SymbolName> = {
  food: symbol('fork.knife', 'restaurant', 'restaurant'),
  transport: symbol('train.side.front.car', 'train', 'train'),
  shopping: symbol('bag.fill', 'shopping_bag', 'shopping_bag'),
  entertainment: symbol('gamecontroller.fill', 'stadia_controller', 'stadia_controller'),
  education: symbol('book.fill', 'menu_book', 'menu_book'),
  health: symbol('cross.case.fill', 'medical_services', 'medical_services'),
  bills: symbol('doc.text.fill', 'receipt_long', 'receipt_long'),
  utilities: symbol('bolt.fill', 'bolt', 'bolt'),
  'phone-internet': symbol('wifi', 'wifi', 'wifi'),
  subscriptions: symbol('repeat', 'subscriptions', 'subscriptions'),
  housing: symbol('house.fill', 'home', 'home'),
  travel: symbol('airplane', 'flight', 'flight'),
  salary: symbol('banknote.fill', 'payments', 'payments'),
  allowance: symbol('giftcard.fill', 'redeem', 'redeem'),
  refund: symbol('arrow.uturn.backward.circle.fill', 'currency_exchange', 'currency_exchange'),
  transfer: symbol('arrow.left.arrow.right.circle.fill', 'sync_alt', 'sync_alt'),
  investment: symbol('chart.line.uptrend.xyaxis', 'trending_up', 'trending_up'),
};

function defaultDateInput(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function defaultTimeInput(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
}

function categorySymbol(category?: FinanceCategory): SymbolName {
  return category?.iconKey ? CATEGORY_SYMBOLS[category.iconKey] ?? CATEGORY_SYMBOLS.transfer! : CATEGORY_SYMBOLS.transfer!;
}

export default function FinanceScreen() {
  const { theme } = useSettings();
  const {
    categories,
    summary,
    transactions,
    sixMonthAnalytics,
    loading,
    error,
    slipPreview,
    reload,
    addTransaction,
    scanSlipImage,
    clearSlipPreview,
  } = useFinance();
  const [formVisible, setFormVisible] = useState(false);
  const [scanVisible, setScanVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [type, setType] = useState<FinanceTransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('expense-food');
  const [dateInput, setDateInput] = useState(defaultDateInput());
  const [timeInput, setTimeInput] = useState(defaultTimeInput());
  const [note, setNote] = useState('');

  const categoriesById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const visibleCategories = categories.filter((category) => category.type === type || category.type === 'both');
  const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(new Date());

  function resetForm(nextType: FinanceTransactionType = 'expense') {
    setType(nextType);
    setAmount('');
    setCategoryId(nextType === 'income' ? 'income-transfer' : 'expense-food');
    setDateInput(defaultDateInput());
    setTimeInput(defaultTimeInput());
    setNote('');
    setFormError(undefined);
  }

  async function saveManualTransaction() {
    setSaving(true);
    setFormError(undefined);
    try {
      const transactionAt = `${dateInput.trim()}T${timeInput.trim()}:00+07:00`;
      await addTransaction({
        type,
        amount: Number(amount.replace(/,/g, '')),
        categoryId,
        note,
        transactionAt,
        source: 'manual',
      });
      setFormVisible(false);
      resetForm(type);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Unable to save transaction.');
    } finally {
      setSaving(false);
    }
  }

  async function chooseSlip() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.85,
      exif: false,
      base64: false,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      await scanSlipImage(result.assets[0].uri);
      setScanVisible(false);
    }
  }

  async function takeSlipPhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      await scanSlipImage('');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      exif: false,
      base64: false,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      await scanSlipImage(result.assets[0].uri);
      setScanVisible(false);
    }
  }

  return (
    <Screen title="Finance" subtitle={monthLabel} refreshing={loading} onRefresh={() => void reload()}>
      {error ? (
        <Card style={styles.notice}>
          <Text style={[styles.noticeTitle, { color: theme.colors.warning }]}>Finance paused</Text>
          <Text style={[styles.noticeText, { color: theme.colors.textMuted }]}>{error}</Text>
        </Card>
      ) : null}

      <Card style={styles.heroCard}>
        <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>AVAILABLE / NET THIS MONTH</Text>
        <Text style={[styles.netText, { color: summary.month.net >= 0 ? theme.colors.success : theme.colors.danger }]}>
          {signedTHB(summary.month.net)}
        </Text>
        <View style={styles.todayGrid}>
          <FinanceMetric label="Today Expense" value={formatTHB(summary.today.expense)} tone="danger" />
          <FinanceMetric label="Today Income" value={formatTHB(summary.today.income)} tone="success" />
          <FinanceMetric label="Today Net" value={signedTHB(summary.today.net)} tone={summary.today.net >= 0 ? 'success' : 'danger'} />
        </View>
      </Card>

      <View style={styles.actions}>
        <ActionButton label="+ Manual" icon={{ ios: 'plus.circle.fill', android: 'add_circle', web: 'add_circle' }} onPress={() => { resetForm('expense'); setFormVisible(true); }} />
        <ActionButton label="Scan Slip" icon={{ ios: 'camera.viewfinder', android: 'document_scanner', web: 'document_scanner' }} onPress={() => setScanVisible(true)} />
      </View>

      {slipPreview ? (
        <Card style={styles.notice}>
          <View style={styles.noticeHeader}>
            <Text style={[styles.noticeTitle, { color: theme.colors.warning }]}>Slip scan not ready</Text>
            <Pressable accessibilityRole="button" onPress={clearSlipPreview}>
              <Text style={[styles.closeText, { color: theme.colors.primary }]}>Dismiss</Text>
            </Pressable>
          </View>
          <Text style={[styles.noticeText, { color: theme.colors.textMuted }]}>{slipPreview.message}</Text>
        </Card>
      ) : null}

      <Card style={styles.sectionCard}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>This Week</Text>
        <View style={styles.inlineMetrics}>
          <MiniMetric label="Income" value={formatTHB(summary.week.income)} />
          <MiniMetric label="Expense" value={formatTHB(summary.week.expense)} />
          <MiniMetric label="Net" value={signedTHB(summary.week.net)} />
        </View>
      </Card>

      <Card style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Top Spending</Text>
          {summary.topExpenseCategory ? <Text style={[styles.sectionHint, { color: theme.colors.textMuted }]}>{summary.topExpenseCategory.percentage}%</Text> : null}
        </View>
        {summary.categoryBreakdown.length ? summary.categoryBreakdown.slice(0, 5).map((item) => (
          <CategoryBar key={item.categoryId} item={item} />
        )) : (
          <Text style={[styles.noticeText, { color: theme.colors.textMuted }]}>No expense categories yet.</Text>
        )}
      </Card>

      <Card style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>6-Month Overview</Text>
          <Text style={[styles.sectionHint, { color: theme.colors.textMuted }]}>Max detailed history</Text>
        </View>
        <SixMonthChart />
        <View style={styles.inlineMetrics}>
          <MiniMetric label="Avg Expense" value={formatTHB(sixMonthAnalytics.averageMonthlyExpense)} />
          <MiniMetric label="Highest" value={sixMonthAnalytics.highestSpendingMonth ?? '-'} />
          <MiniMetric label="Lowest" value={sixMonthAnalytics.lowestSpendingMonth ?? '-'} />
        </View>
      </Card>

      <View style={styles.sectionHeaderOutside}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Recent</Text>
        <Text style={[styles.sectionHint, { color: theme.colors.textMuted }]}>{transactions.length} saved</Text>
      </View>
      {summary.recent.length ? summary.recent.map((transaction) => (
        <TransactionRow key={transaction.id} transaction={transaction} category={categoriesById.get(transaction.categoryId)} />
      )) : (
        <Card>
          <EmptyState title="No finance records yet" message="Add a manual income or expense to start tracking your money." />
        </Card>
      )}

      <Modal animationType="slide" transparent visible={formVisible} onRequestClose={() => setFormVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.modalBackdrop, { backgroundColor: theme.colors.overlay }]}>
          <View style={[styles.modalSheet, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Add Transaction</Text>
            <View style={styles.segment}>
              {(['expense', 'income'] as const).map((option) => {
                const selected = option === type;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => { setType(option); setCategoryId(option === 'income' ? 'income-transfer' : 'expense-food'); }}
                    style={[styles.segmentButton, { backgroundColor: selected ? theme.colors.primary : theme.colors.surfaceElevated }]}>
                    <Text style={[styles.segmentText, { color: selected ? (theme.dark ? '#141526' : '#FFFFFF') : theme.colors.textMuted }]}>
                      {option === 'expense' ? 'Expense' : 'Income'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <FormLabel label="Amount" />
            <TextInput
              keyboardType="decimal-pad"
              inputMode="decimal"
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}
            />
            <FormLabel label="Category" />
            <View style={styles.categoryChips}>
              {visibleCategories.slice(0, 10).map((category) => {
                const selected = category.id === categoryId;
                return (
                  <Pressable
                    key={category.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setCategoryId(category.id)}
                    style={[styles.categoryChip, { borderColor: selected ? theme.colors.primary : theme.colors.border, backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surfaceElevated }]}>
                    <SymbolView name={categorySymbol(category)} tintColor={selected ? theme.colors.primary : theme.colors.textMuted} size={16} />
                    <Text style={[styles.categoryChipText, { color: selected ? theme.colors.primary : theme.colors.text }]} numberOfLines={1}>{category.name}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.dateRow}>
              <View style={styles.dateField}>
                <FormLabel label="Date" />
                <TextInput value={dateInput} onChangeText={setDateInput} style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]} />
              </View>
              <View style={styles.dateField}>
                <FormLabel label="Time" />
                <TextInput value={timeInput} onChangeText={setTimeInput} style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]} />
              </View>
            </View>
            <FormLabel label="Note" />
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Optional"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}
            />
            {formError ? <Text style={[styles.errorText, { color: theme.colors.danger }]}>{formError}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable accessibilityRole="button" onPress={() => setFormVisible(false)} style={[styles.secondaryButton, { borderColor: theme.colors.border }]}>
                <Text style={[styles.secondaryText, { color: theme.colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={saving} onPress={() => void saveManualTransaction()} style={[styles.primaryButton, { backgroundColor: theme.colors.primary, opacity: saving ? 0.7 : 1 }]}>
                <Text style={[styles.primaryText, { color: theme.dark ? '#141526' : '#FFFFFF' }]}>{saving ? 'Saving...' : 'Save'}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal animationType="fade" transparent visible={scanVisible} onRequestClose={() => setScanVisible(false)}>
        <View style={[styles.modalBackdrop, { backgroundColor: theme.colors.overlay }]}>
          <View style={[styles.scanSheet, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Scan Slip</Text>
            <Text style={[styles.noticeText, { color: theme.colors.textMuted }]}>
              Yoshioka will only process the one slip image you choose. It will not scan your full gallery.
            </Text>
            <ActionButton label="Take Photo" icon={{ ios: 'camera.fill', android: 'photo_camera', web: 'photo_camera' }} onPress={() => void takeSlipPhoto()} />
            <ActionButton label="Choose from Photos" icon={{ ios: 'photo.on.rectangle', android: 'photo_library', web: 'photo_library' }} onPress={() => void chooseSlip()} />
            <Pressable accessibilityRole="button" onPress={() => setScanVisible(false)} style={[styles.secondaryButton, { borderColor: theme.colors.border }]}>
              <Text style={[styles.secondaryText, { color: theme.colors.text }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function FinanceMetric({ label, value, tone }: { label: string; value: string; tone: 'success' | 'danger' }) {
  const { theme } = useSettings();
  return (
    <View style={[styles.metricCard, { backgroundColor: theme.colors.surfaceElevated }]}>
      <Text style={[styles.metricLabel, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: tone === 'success' ? theme.colors.success : theme.colors.danger }]}>{value}</Text>
    </View>
  );
}

function ActionButton({ label, icon, onPress }: { label: string; icon: SymbolName; onPress: () => void }) {
  const { theme } = useSettings();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.actionButton, { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.border }]}>
      <SymbolView name={icon} tintColor={theme.colors.primary} size={20} />
      <Text style={[styles.actionText, { color: theme.colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  const { theme } = useSettings();
  return (
    <View style={styles.miniMetric}>
      <Text style={[styles.metricLabel, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text style={[styles.miniValue, { color: theme.colors.text }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function CategoryBar({ item }: { item: { categoryName: string; amount: number; percentage: number } }) {
  const { theme } = useSettings();
  const width = `${Math.max(4, Math.min(100, item.percentage))}%` as DimensionValue;
  return (
    <View style={styles.barRow}>
      <View style={styles.barCopy}>
        <Text style={[styles.barLabel, { color: theme.colors.text }]}>{item.categoryName}</Text>
        <Text style={[styles.barAmount, { color: theme.colors.textMuted }]}>{formatTHB(item.amount)}</Text>
      </View>
      <View style={[styles.barTrack, { backgroundColor: theme.colors.surfaceElevated }]}>
        <View style={[styles.barFill, { width, backgroundColor: theme.colors.primary }]} />
      </View>
    </View>
  );
}

function SixMonthChart() {
  const { theme } = useSettings();
  const { sixMonthAnalytics } = useFinance();
  const max = Math.max(1, ...sixMonthAnalytics.months.flatMap((month) => [month.income, month.expense]));
  if (!sixMonthAnalytics.months.length) return <Text style={[styles.noticeText, { color: theme.colors.textMuted }]}>No six-month data yet.</Text>;
  return (
    <View style={styles.monthChart}>
      {sixMonthAnalytics.months.map((month) => (
        <View key={month.month} style={styles.monthItem}>
          <View style={styles.monthBars}>
            <View style={[styles.monthBar, { height: Math.max(3, Math.round((month.income / max) * 70)), backgroundColor: theme.colors.success }]} />
            <View style={[styles.monthBar, { height: Math.max(3, Math.round((month.expense / max) * 70)), backgroundColor: theme.colors.danger }]} />
          </View>
          <Text style={[styles.monthLabel, { color: theme.colors.textMuted }]}>{month.label}</Text>
        </View>
      ))}
    </View>
  );
}

function TransactionRow({ transaction, category }: { transaction: FinanceTransaction; category?: FinanceCategory }) {
  const { theme } = useSettings();
  const isIncome = transaction.type === 'income';
  const time = new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }).format(new Date(transaction.transactionAt));
  return (
    <Card style={styles.transactionCard}>
      <View style={styles.transactionRow}>
        <View style={[styles.transactionIcon, { backgroundColor: isIncome ? 'rgba(22, 134, 107, 0.14)' : 'rgba(216, 58, 82, 0.14)' }]}>
          <SymbolView name={categorySymbol(category)} tintColor={isIncome ? theme.colors.success : theme.colors.danger} size={19} />
        </View>
        <View style={styles.transactionCopy}>
          <Text style={[styles.transactionTitle, { color: theme.colors.text }]} numberOfLines={1}>{transaction.note || category?.name || 'Transaction'}</Text>
          <Text style={[styles.transactionMeta, { color: theme.colors.textMuted }]}>{category?.name ?? 'Other'} · {time} · {transaction.syncStatus ?? 'local'}</Text>
        </View>
        <Text style={[styles.transactionAmount, { color: isIncome ? theme.colors.success : theme.colors.danger }]}>
          {isIncome ? '+' : '-'}{formatTHB(transaction.amount)}
        </Text>
      </View>
    </Card>
  );
}

function FormLabel({ label }: { label: string }) {
  const { theme } = useSettings();
  return <Text style={[styles.formLabel, { color: theme.colors.textMuted }]}>{label}</Text>;
}

const styles = StyleSheet.create({
  notice: { marginBottom: spacing.md },
  noticeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  noticeTitle: { fontSize: 14, fontWeight: '800', marginBottom: 5 },
  noticeText: { fontSize: 12, lineHeight: 18 },
  closeText: { fontSize: 12, fontWeight: '800' },
  heroCard: { marginBottom: spacing.md },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1, marginBottom: 8 },
  netText: { fontSize: 36, lineHeight: 42, fontWeight: '900', letterSpacing: -0.9 },
  todayGrid: { flexDirection: 'row', gap: 8, marginTop: 18 },
  metricCard: { flex: 1, borderRadius: radius.md, padding: 10, minHeight: 76, justifyContent: 'center' },
  metricLabel: { fontSize: 10, lineHeight: 14, fontWeight: '800' },
  metricValue: { fontSize: 16, lineHeight: 22, fontWeight: '900', marginTop: 5 },
  actions: { flexDirection: 'row', gap: 10, marginBottom: spacing.md },
  actionButton: { flex: 1, minHeight: 52, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 10 },
  actionText: { fontSize: 13, fontWeight: '900' },
  sectionCard: { marginBottom: spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionHeaderOutside: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 4, marginBottom: 8 },
  sectionTitle: { fontSize: 17, lineHeight: 23, fontWeight: '900' },
  sectionHint: { fontSize: 11, lineHeight: 16, fontWeight: '700' },
  inlineMetrics: { flexDirection: 'row', gap: 10, marginTop: 8 },
  miniMetric: { flex: 1 },
  miniValue: { fontSize: 15, lineHeight: 21, fontWeight: '900', marginTop: 4 },
  barRow: { marginBottom: 12 },
  barCopy: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 7 },
  barLabel: { fontSize: 12, fontWeight: '800' },
  barAmount: { fontSize: 11, fontWeight: '700' },
  barTrack: { height: 9, borderRadius: 999, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 999 },
  monthChart: { minHeight: 112, flexDirection: 'row', alignItems: 'flex-end', gap: 9, marginVertical: 8 },
  monthItem: { flex: 1, alignItems: 'center', gap: 6 },
  monthBars: { height: 78, flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  monthBar: { width: 8, borderRadius: 8 },
  monthLabel: { fontSize: 9, fontWeight: '800' },
  transactionCard: { marginBottom: 10 },
  transactionRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  transactionIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  transactionCopy: { flex: 1 },
  transactionTitle: { fontSize: 14, lineHeight: 19, fontWeight: '900' },
  transactionMeta: { fontSize: 10, lineHeight: 15, marginTop: 2 },
  transactionAmount: { fontSize: 15, fontWeight: '900' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', padding: 14 },
  modalSheet: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 26, padding: 18 },
  scanSheet: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 26, padding: 18, gap: 12 },
  modalTitle: { fontSize: 22, lineHeight: 28, fontWeight: '900', marginBottom: 14 },
  segment: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  segmentButton: { flex: 1, minHeight: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 13, fontWeight: '900' },
  formLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 0.4, marginBottom: 6, marginTop: 10 },
  input: { minHeight: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: 12, fontSize: 14, fontWeight: '700' },
  categoryChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: { maxWidth: '48%', minHeight: 38, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, alignItems: 'center', flexDirection: 'row', gap: 6 },
  categoryChipText: { flex: 1, fontSize: 11, fontWeight: '800' },
  dateRow: { flexDirection: 'row', gap: 10 },
  dateField: { flex: 1 },
  errorText: { fontSize: 12, lineHeight: 18, marginTop: 10, fontWeight: '700' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  primaryButton: { flex: 1, minHeight: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 14, fontWeight: '900' },
  secondaryButton: { flex: 1, minHeight: 46, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  secondaryText: { fontSize: 14, fontWeight: '900' },
});
