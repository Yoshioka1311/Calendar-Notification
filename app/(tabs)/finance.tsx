import * as ImagePicker from 'expo-image-picker';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type DimensionValue,
} from 'react-native';

import { Card } from '@/components/UI/Card';
import { Screen } from '@/components/UI/Screen';
import { useFinance } from '@/contexts/FinanceContext';
import { useSettings } from '@/contexts/SettingsContext';
import { radius, spacing } from '@/theme';
import type { FinanceCategory, FinanceTransaction, FinanceTransactionType, SlipTransactionCandidate } from '@/types/finance';
import { toDateKey } from '@/utils/date';
import { formatTHB, signedTHB } from '@/utils/finance';

type SymbolName = SymbolViewProps['name'];
type FinanceView = 'today' | 'history' | 'insights';
type HistoryFilter = 'all' | FinanceTransactionType;
type FormMode = 'manual' | 'slip';

function symbol(ios: string, android: string, web: string): SymbolName {
  return { ios, android, web } as SymbolName;
}

const CATEGORY_SYMBOLS: Record<string, SymbolName> = {
  food: symbol('fork.knife', 'restaurant', 'restaurant'),
  transport: symbol('train.side.front.car', 'train', 'train'),
  shopping: symbol('bag.fill', 'shopping_bag', 'shopping_bag'),
  entertainment: symbol('gamecontroller.fill', 'stadia_controller', 'stadia_controller'),
  gaming: symbol('gamecontroller.fill', 'sports_esports', 'sports_esports'),
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
  return category?.iconKey
    ? CATEGORY_SYMBOLS[category.iconKey] ?? CATEGORY_SYMBOLS.transfer!
    : CATEGORY_SYMBOLS.transfer!;
}

function labelForDate(dateKey: string, today: string): string {
  const yesterday = new Date(`${today}T00:00:00+07:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = toDateKey(yesterday);
  const dateLabel = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(`${dateKey}T12:00:00+07:00`));
  if (dateKey === today) return `Today — ${dateLabel}`;
  if (dateKey === yesterdayKey) return `Yesterday — ${dateLabel}`;
  return dateLabel;
}

export default function FinanceScreen() {
  const { theme } = useSettings();
  const {
    categories,
    summary,
    transactions,
    loading,
    insightsLoading,
    slipScanning,
    error,
    reload,
    loadInsights,
    addTransaction,
    scanSlipImage,
    clearSlipPreview,
  } = useFinance();
  const [activeView, setActiveView] = useState<FinanceView>('today');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [formVisible, setFormVisible] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('manual');
  const [scanVisible, setScanVisible] = useState(false);
  const [selectedSlipUri, setSelectedSlipUri] = useState<string>();
  const [scanError, setScanError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [type, setType] = useState<FinanceTransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('expense-food');
  const [dateInput, setDateInput] = useState(defaultDateInput());
  const [timeInput, setTimeInput] = useState(defaultTimeInput());
  const [note, setNote] = useState('');
  const [slipCandidate, setSlipCandidate] = useState<SlipTransactionCandidate>();

  const todayKey = toDateKey(new Date());
  const categoriesById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const visibleCategories = categories.filter((category) => category.type === type || category.type === 'both');
  const todayTransactions = useMemo(
    () => transactions.filter((transaction) => transaction.localDate === todayKey).sort((a, b) => b.transactionAt.localeCompare(a.transactionAt)),
    [todayKey, transactions],
  );
  const groupedHistory = useMemo(() => {
    const filtered = historyFilter === 'all' ? transactions : transactions.filter((item) => item.type === historyFilter);
    const groups = new Map<string, FinanceTransaction[]>();
    for (const transaction of filtered) {
      groups.set(transaction.localDate, [...(groups.get(transaction.localDate) ?? []), transaction]);
    }
    return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [historyFilter, transactions]);

  useEffect(() => {
    if (activeView === 'insights') void loadInsights();
  }, [activeView, loadInsights]);

  function resetForm(nextType: FinanceTransactionType = 'expense') {
    setType(nextType);
    setAmount('');
    setCategoryId(nextType === 'income' ? 'income-transfer' : 'expense-food');
    setDateInput(defaultDateInput());
    setTimeInput(defaultTimeInput());
    setNote('');
    setFormError(undefined);
    setSlipCandidate(undefined);
    setSelectedSlipUri(undefined);
  }

  function openManual() {
    resetForm('expense');
    setFormMode('manual');
    setFormVisible(true);
  }

  function populateSlipForm(candidate: SlipTransactionCandidate) {
    setFormMode('slip');
    setSlipCandidate(candidate);
    setType(candidate.type);
    setAmount(String(candidate.amount));
    setCategoryId(candidate.suggestedCategoryId);
    setDateInput(candidate.transactionAt.slice(0, 10));
    setTimeInput(candidate.transactionAt.slice(11, 16));
    setNote(candidate.receiver ? `Transfer to ${candidate.receiver}` : candidate.provider ? `Transfer via ${candidate.provider}` : 'Slip transaction');
    setFormError(undefined);
    setFormVisible(true);
  }

  async function saveTransaction() {
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
        source: formMode === 'slip' ? 'slip' : 'manual',
        slipProvider: slipCandidate?.provider,
        slipFingerprint: slipCandidate?.fingerprint,
        parserConfidence: slipCandidate?.confidence,
      });
      setFormVisible(false);
      clearSlipPreview();
      resetForm(type);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Unable to save transaction.');
    } finally {
      setSaving(false);
    }
  }

  async function processSlip(uri: string) {
    const startedAt = Date.now();
    setSelectedSlipUri(uri);
    setScanError(undefined);
    clearSlipPreview();
    setScanVisible(false);
    const result = await scanSlipImage(uri);
    if (result.status === 'error' || !result.candidate) setScanError(result.message);
    else populateSlipForm(result.candidate);
    if (__DEV__) {
      // Timings are development-only and never include OCR text or financial values.
      // eslint-disable-next-line no-console
      console.info(`[perf] slip selection to result ${Date.now() - startedAt}ms`);
    }
  }

  async function chooseSlip() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 1,
      exif: false,
      base64: false,
    });
    const uri = !result.canceled ? result.assets[0]?.uri : undefined;
    if (uri) await processSlip(uri);
  }

  async function takeSlipPhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setScanVisible(false);
      setScanError('Camera permission is required to photograph a slip. You can still choose one from Photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 1,
      exif: false,
      base64: false,
    });
    const uri = !result.canceled ? result.assets[0]?.uri : undefined;
    if (uri) await processSlip(uri);
  }

  function closeForm() {
    setFormVisible(false);
    clearSlipPreview();
    resetForm(type);
  }

  return (
    <Screen title="Finance" subtitle="Today" refreshing={loading} onRefresh={() => void reload()}>
      <FinanceNavigation active={activeView} onChange={setActiveView} />

      {error ? (
        <Card style={styles.notice}>
          <Text style={[styles.noticeTitle, { color: theme.colors.warning }]}>Using saved finance data</Text>
          <Text style={[styles.noticeText, { color: theme.colors.textMuted }]}>{error}</Text>
        </Card>
      ) : null}

      {activeView === 'today' ? (
        <>
          <Card style={styles.todayHero}>
            <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>SPENT TODAY</Text>
            <Text style={[styles.spentToday, { color: theme.colors.danger }]}>{formatTHB(summary.today.expense)}</Text>
            <View style={styles.secondaryTotals}>
              <SmallTotal label="Income" value={`+${formatTHB(summary.today.income)}`} color={theme.colors.success} />
              <View style={[styles.totalDivider, { backgroundColor: theme.colors.border }]} />
              <SmallTotal label="Net" value={signedTHB(summary.today.net)} color={summary.today.net >= 0 ? theme.colors.success : theme.colors.danger} />
            </View>
          </Card>

          <View style={styles.actions}>
            <ActionButton label="Add" icon={{ ios: 'plus.circle.fill', android: 'add_circle', web: 'add_circle' }} onPress={openManual} />
            <ActionButton label="Scan Slip" icon={{ ios: 'camera.viewfinder', android: 'document_scanner', web: 'document_scanner' }} onPress={() => setScanVisible(true)} />
          </View>

          {scanError ? (
            <Card style={styles.notice}>
              <View style={styles.noticeHeader}>
                <Text style={[styles.noticeTitle, { color: theme.colors.warning }]}>Couldn&apos;t read this slip</Text>
                <Pressable accessibilityRole="button" onPress={() => { setScanError(undefined); clearSlipPreview(); }}>
                  <Text style={[styles.closeText, { color: theme.colors.primary }]}>Dismiss</Text>
                </Pressable>
              </View>
              <Text style={[styles.noticeText, { color: theme.colors.textMuted }]}>{scanError}</Text>
            </Card>
          ) : null}

          <View style={styles.sectionHeaderOutside}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Today&apos;s Transactions</Text>
            <Text style={[styles.sectionHint, { color: theme.colors.textMuted }]}>{todayTransactions.length}</Text>
          </View>
          {loading && !transactions.length ? (
            <FinanceSkeleton />
          ) : todayTransactions.length ? (
            todayTransactions.map((transaction) => (
              <TransactionRow key={transaction.id} transaction={transaction} category={categoriesById.get(transaction.categoryId)} />
            ))
          ) : (
            <Card style={styles.emptyCard}>
              <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>No spending yet today.</Text>
              <Text style={[styles.noticeText, { color: theme.colors.textMuted }]}>Add manually or scan a slip.</Text>
            </Card>
          )}
        </>
      ) : null}

      {activeView === 'history' ? (
        <>
          <FilterChips active={historyFilter} onChange={setHistoryFilter} />
          {groupedHistory.length ? groupedHistory.map(([dateKey, items]) => (
            <View key={dateKey} style={styles.historyGroup}>
              <Text style={[styles.historyDate, { color: theme.colors.textMuted }]}>{labelForDate(dateKey, todayKey)}</Text>
              {items.map((transaction) => (
                <TransactionRow key={transaction.id} transaction={transaction} category={categoriesById.get(transaction.categoryId)} />
              ))}
            </View>
          )) : (
            <Card style={styles.emptyCard}>
              <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>No matching transactions</Text>
            </Card>
          )}
        </>
      ) : null}

      {activeView === 'insights' ? (
        <InsightsContent loading={insightsLoading} />
      ) : null}

      <Modal animationType="fade" transparent visible={scanVisible} onRequestClose={() => setScanVisible(false)}>
        <View style={[styles.modalBackdrop, { backgroundColor: theme.colors.overlay }]}>
          <View style={[styles.scanSheet, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Scan Slip</Text>
            <Text style={[styles.noticeText, { color: theme.colors.textMuted }]}>The selected image is read on this device and is not uploaded.</Text>
            <ActionButton label="Take Photo" icon={{ ios: 'camera.fill', android: 'photo_camera', web: 'photo_camera' }} onPress={() => void takeSlipPhoto()} />
            <ActionButton label="Choose from Photos" icon={{ ios: 'photo.on.rectangle', android: 'photo_library', web: 'photo_library' }} onPress={() => void chooseSlip()} />
            <Pressable accessibilityRole="button" onPress={() => setScanVisible(false)} style={[styles.secondaryButton, { borderColor: theme.colors.border }]}>
              <Text style={[styles.secondaryText, { color: theme.colors.text }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" transparent visible={slipScanning} onRequestClose={() => undefined}>
        <View style={[styles.scanProgressBackdrop, { backgroundColor: theme.colors.overlay }]}>
          <View style={[styles.scanProgressCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            {selectedSlipUri ? <Image source={{ uri: selectedSlipUri }} resizeMode="contain" style={styles.slipPreview} /> : null}
            <View style={styles.scanningRow}>
              <ActivityIndicator color={theme.colors.primary} />
              <View style={styles.scanningCopy}>
                <Text style={[styles.scanningTitle, { color: theme.colors.text }]}>Scanning on this device...</Text>
                <Text style={[styles.noticeText, { color: theme.colors.textMuted }]}>Reading amount, date, time and provider.</Text>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" transparent visible={formVisible} onRequestClose={closeForm}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.modalBackdrop, { backgroundColor: theme.colors.overlay }]}>
          <View style={[styles.formSheet, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>{formMode === 'slip' ? 'Confirm Transaction' : 'Add Transaction'}</Text>
              {formMode === 'slip' && selectedSlipUri ? <Image source={{ uri: selectedSlipUri }} resizeMode="contain" style={[styles.formSlipPreview, { backgroundColor: theme.colors.surfaceElevated }]} /> : null}
              {formMode === 'slip' && slipCandidate ? (
                <Text style={[styles.detectedMeta, { color: theme.colors.textMuted }]}>
                  {slipCandidate.provider ?? 'Bank slip'} · {Math.round(slipCandidate.confidence * 100)}% parser confidence
                </Text>
              ) : null}
              <View style={styles.typeSegment}>
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
              <TextInput keyboardType="decimal-pad" inputMode="decimal" value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={theme.colors.textMuted} style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]} />
              <FormLabel label="Category" />
              <View style={styles.categoryChips}>
                {visibleCategories.slice(0, 12).map((category) => {
                  const selected = category.id === categoryId;
                  return (
                    <Pressable key={category.id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setCategoryId(category.id)} style={[styles.categoryChip, { borderColor: selected ? theme.colors.primary : theme.colors.border, backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surfaceElevated }]}>
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
              <TextInput value={note} onChangeText={setNote} placeholder="Optional" placeholderTextColor={theme.colors.textMuted} style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]} />
              {formError ? <Text style={[styles.errorText, { color: theme.colors.danger }]}>{formError}</Text> : null}
              <View style={styles.modalActions}>
                <Pressable accessibilityRole="button" onPress={closeForm} style={[styles.secondaryButton, { borderColor: theme.colors.border }]}>
                  <Text style={[styles.secondaryText, { color: theme.colors.text }]}>Cancel</Text>
                </Pressable>
                <Pressable accessibilityRole="button" disabled={saving} onPress={() => void saveTransaction()} style={[styles.primaryButton, { backgroundColor: theme.colors.primary, opacity: saving ? 0.7 : 1 }]}>
                  <Text style={[styles.primaryText, { color: theme.dark ? '#141526' : '#FFFFFF' }]}>{saving ? 'Saving...' : 'Save'}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

function FinanceNavigation({ active, onChange }: { active: FinanceView; onChange: (value: FinanceView) => void }) {
  const { theme } = useSettings();
  return (
    <View style={[styles.financeNav, { backgroundColor: theme.colors.surfaceElevated }]}>
      {(['today', 'history', 'insights'] as const).map((view) => {
        const selected = view === active;
        return (
          <Pressable key={view} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => onChange(view)} style={[styles.financeNavItem, selected && { backgroundColor: theme.colors.primarySoft }]}>
            <Text style={[styles.financeNavText, { color: selected ? theme.colors.primary : theme.colors.textMuted }]}>{view[0]!.toUpperCase() + view.slice(1)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SmallTotal({ label, value, color }: { label: string; value: string; color: string }) {
  const { theme } = useSettings();
  return (
    <View style={styles.smallTotal}>
      <Text style={[styles.smallTotalLabel, { color: theme.colors.textMuted }]}>{label} today</Text>
      <Text style={[styles.smallTotalValue, { color }]}>{value}</Text>
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

function FilterChips({ active, onChange }: { active: HistoryFilter; onChange: (value: HistoryFilter) => void }) {
  const { theme } = useSettings();
  return (
    <View style={styles.filterRow}>
      {(['all', 'expense', 'income'] as const).map((filter) => {
        const selected = filter === active;
        return (
          <Pressable key={filter} onPress={() => onChange(filter)} style={[styles.filterChip, { backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surface, borderColor: selected ? theme.colors.primary : theme.colors.border }]}>
            <Text style={[styles.filterText, { color: selected ? theme.colors.primary : theme.colors.textMuted }]}>{filter[0]!.toUpperCase() + filter.slice(1)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function InsightsContent({ loading }: { loading: boolean }) {
  const { theme } = useSettings();
  const { summary, sixMonthAnalytics } = useFinance();
  if (loading && !sixMonthAnalytics.months.length) return <FinanceSkeleton />;
  return (
    <>
      <Card style={styles.sectionCard}>
        <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>THIS WEEK</Text>
        <Text style={[styles.insightPrimary, { color: theme.colors.danger }]}>{formatTHB(summary.week.expense)} spent</Text>
        <View style={styles.inlineMetrics}>
          <MiniMetric label="Income" value={formatTHB(summary.week.income)} />
          <MiniMetric label="Net" value={signedTHB(summary.week.net)} />
        </View>
      </Card>

      <Card style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Top Spending</Text>
          <Text style={[styles.sectionHint, { color: theme.colors.textMuted }]}>This month</Text>
        </View>
        {summary.categoryBreakdown.length ? summary.categoryBreakdown.slice(0, 5).map((item) => (
          <CategoryBar key={item.categoryId} item={item} />
        )) : <Text style={[styles.noticeText, { color: theme.colors.textMuted }]}>No expense categories yet.</Text>}
      </Card>

      <Card style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>6-Month Overview</Text>
          <Text style={[styles.sectionHint, { color: theme.colors.textMuted }]}>Detailed history limit</Text>
        </View>
        <SixMonthChart />
        <View style={styles.inlineMetrics}>
          <MiniMetric label="Avg Expense" value={formatTHB(sixMonthAnalytics.averageMonthlyExpense)} />
          <MiniMetric label="Highest" value={sixMonthAnalytics.highestSpendingMonth ?? '-'} />
          <MiniMetric label="Lowest" value={sixMonthAnalytics.lowestSpendingMonth ?? '-'} />
        </View>
      </Card>
    </>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  const { theme } = useSettings();
  return (
    <View style={styles.miniMetric}>
      <Text style={[styles.smallTotalLabel, { color: theme.colors.textMuted }]}>{label}</Text>
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
          <Text style={[styles.transactionMeta, { color: theme.colors.textMuted }]}>{category?.name ?? 'Other'} · {time}</Text>
        </View>
        <Text style={[styles.transactionAmount, { color: isIncome ? theme.colors.success : theme.colors.danger }]}>
          {isIncome ? '+' : '-'}{formatTHB(transaction.amount)}
        </Text>
      </View>
    </Card>
  );
}

function FinanceSkeleton() {
  const { theme } = useSettings();
  return (
    <View style={styles.skeletonList}>
      {[0, 1].map((item) => (
        <View key={item} style={[styles.skeletonRow, { backgroundColor: theme.colors.surface }]}>
          <View style={[styles.skeletonIcon, { backgroundColor: theme.colors.surfaceElevated }]} />
          <View style={styles.skeletonCopy}>
            <View style={[styles.skeletonLine, { backgroundColor: theme.colors.surfaceElevated }]} />
            <View style={[styles.skeletonLineShort, { backgroundColor: theme.colors.surfaceElevated }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

function FormLabel({ label }: { label: string }) {
  const { theme } = useSettings();
  return <Text style={[styles.formLabel, { color: theme.colors.textMuted }]}>{label}</Text>;
}

const styles = StyleSheet.create({
  financeNav: { flexDirection: 'row', borderRadius: radius.md, padding: 4, marginBottom: spacing.md },
  financeNavItem: { flex: 1, minHeight: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  financeNavText: { fontSize: 12, fontWeight: '900' },
  notice: { marginBottom: spacing.md },
  noticeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  noticeTitle: { fontSize: 14, fontWeight: '900', marginBottom: 4 },
  noticeText: { fontSize: 12, lineHeight: 18 },
  closeText: { fontSize: 12, fontWeight: '900' },
  todayHero: { marginBottom: spacing.md, paddingVertical: 20 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2, marginBottom: 7 },
  spentToday: { fontSize: 42, lineHeight: 49, fontWeight: '900', letterSpacing: -1.1 },
  secondaryTotals: { flexDirection: 'row', alignItems: 'center', marginTop: 17 },
  smallTotal: { flex: 1 },
  smallTotalLabel: { fontSize: 10, lineHeight: 14, fontWeight: '800' },
  smallTotalValue: { fontSize: 16, lineHeight: 22, fontWeight: '900', marginTop: 3 },
  totalDivider: { width: StyleSheet.hairlineWidth, height: 34, marginHorizontal: 18 },
  actions: { flexDirection: 'row', gap: 10, marginBottom: spacing.lg },
  actionButton: { flex: 1, minHeight: 52, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 10 },
  actionText: { fontSize: 13, fontWeight: '900' },
  sectionHeaderOutside: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 4, marginBottom: 9 },
  sectionTitle: { fontSize: 17, lineHeight: 23, fontWeight: '900' },
  sectionHint: { fontSize: 11, lineHeight: 16, fontWeight: '700' },
  emptyCard: { paddingVertical: 18, marginBottom: spacing.md },
  emptyTitle: { fontSize: 14, lineHeight: 20, fontWeight: '900', marginBottom: 3 },
  transactionCard: { marginBottom: 8, paddingVertical: 12 },
  transactionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  transactionIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  transactionCopy: { flex: 1 },
  transactionTitle: { fontSize: 13, lineHeight: 18, fontWeight: '900' },
  transactionMeta: { fontSize: 10, lineHeight: 15, marginTop: 2 },
  transactionAmount: { fontSize: 14, fontWeight: '900' },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: spacing.md },
  filterChip: { minHeight: 38, paddingHorizontal: 16, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  filterText: { fontSize: 11, fontWeight: '900' },
  historyGroup: { marginBottom: spacing.md },
  historyDate: { fontSize: 11, fontWeight: '900', letterSpacing: 0.3, marginBottom: 8, marginLeft: 4 },
  sectionCard: { marginBottom: spacing.md },
  insightPrimary: { fontSize: 28, lineHeight: 35, fontWeight: '900' },
  inlineMetrics: { flexDirection: 'row', gap: 10, marginTop: 14 },
  miniMetric: { flex: 1 },
  miniValue: { fontSize: 14, lineHeight: 20, fontWeight: '900', marginTop: 3 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
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
  skeletonList: { gap: 8 },
  skeletonRow: { minHeight: 64, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  skeletonIcon: { width: 38, height: 38, borderRadius: 12 },
  skeletonCopy: { flex: 1, gap: 7 },
  skeletonLine: { width: '66%', height: 11, borderRadius: 8 },
  skeletonLineShort: { width: '40%', height: 8, borderRadius: 8 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', padding: 14 },
  scanSheet: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 26, padding: 18, gap: 12 },
  formSheet: { maxHeight: '92%', borderWidth: StyleSheet.hairlineWidth, borderRadius: 26, padding: 18 },
  sheetHandle: { width: 42, height: 4, borderRadius: 999, backgroundColor: 'rgba(160,160,180,0.45)', alignSelf: 'center', marginBottom: 5 },
  modalTitle: { fontSize: 22, lineHeight: 28, fontWeight: '900', marginBottom: 12 },
  scanProgressBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22 },
  scanProgressCard: { width: '100%', maxWidth: 420, borderWidth: StyleSheet.hairlineWidth, borderRadius: 24, padding: 14 },
  slipPreview: { width: '100%', height: 260, borderRadius: 16, marginBottom: 14 },
  scanningRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scanningCopy: { flex: 1 },
  scanningTitle: { fontSize: 14, lineHeight: 20, fontWeight: '900' },
  formSlipPreview: { width: '100%', height: 150, borderRadius: 16, marginBottom: 8 },
  detectedMeta: { fontSize: 10, lineHeight: 15, marginBottom: 10, textAlign: 'center' },
  typeSegment: { flexDirection: 'row', gap: 8, marginBottom: 4 },
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
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16, marginBottom: 4 },
  primaryButton: { flex: 1, minHeight: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 14, fontWeight: '900' },
  secondaryButton: { flex: 1, minHeight: 46, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  secondaryText: { fontSize: 14, fontWeight: '900' },
});
