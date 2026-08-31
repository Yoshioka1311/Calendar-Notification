import { SymbolView } from 'expo-symbols';
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
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
  type ImageStyle,
  type KeyboardTypeOptions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Button } from '@/components/UI/Button';
import { Card } from '@/components/UI/Card';
import { Screen } from '@/components/UI/Screen';
import { SelectField, type SelectOption } from '@/components/UI/SelectField';
import { useSettings } from '@/contexts/SettingsContext';
import { useToast } from '@/contexts/ToastContext';
import { useVault } from '@/contexts/VaultContext';
import {
  VAULT_LOGIN_PROVIDERS,
  VAULT_PLATFORM_ACCOUNT_OPTIONS,
  VAULT_PLATFORM_OPTIONS,
} from '@/services/vaultService';
import { radius, spacing } from '@/theme';
import type { GameSearchResult, VaultEntryDraft, VaultEntryType, VaultUnlockedEntry } from '@/types/vault';

type GameSearchState = 'idle' | 'typing' | 'loading' | 'results' | 'no-results' | 'error' | 'selected';
type ArtworkStyle = StyleProp<ImageStyle>;

type VaultFormState = {
  id?: string;
  entryType?: VaultEntryType;
  gameSearchText: string;
  selectedGame?: GameSearchResult;
  manualGameName?: string;
  platformId?: string;
  platformName?: string;
  customPlatformName: string;
  loginProvider?: string;
  customLoginProvider: string;
  accountLabel: string;
  username: string;
  email: string;
  password: string;
  recoveryEmail: string;
  notes: string;
};

const EMPTY_FORM: VaultFormState = {
  gameSearchText: '',
  customPlatformName: '',
  customLoginProvider: '',
  accountLabel: '',
  username: '',
  email: '',
  password: '',
  recoveryEmail: '',
  notes: '',
};

const LOGIN_PROVIDER_OPTIONS: SelectOption[] = VAULT_LOGIN_PROVIDERS.map((provider) => ({ id: optionId(provider), label: provider }));
const PLATFORM_ACCOUNT_OPTIONS: SelectOption[] = VAULT_PLATFORM_ACCOUNT_OPTIONS.map((platform) => ({ id: platform.id, label: platform.name }));
const BASE_GAME_PLATFORM_OPTIONS: SelectOption[] = VAULT_PLATFORM_OPTIONS.map((platform) => ({ id: platform.id, label: platform.name }));

function optionId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'option';
}

function uniqueOptions(options: SelectOption[]): SelectOption[] {
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = option.label.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizePlatformLabel(value: string): string {
  const lower = value.toLowerCase();
  if (lower.includes('windows') || lower.includes('linux') || lower.includes('mac') || lower === 'pc') return 'PC';
  if (lower.includes('playstation')) return 'PlayStation';
  if (lower.includes('xbox')) return 'Xbox';
  if (lower.includes('nintendo') || lower.includes('switch')) return 'Nintendo Switch';
  if (lower.includes('android')) return 'Android';
  if (lower.includes('ios') || lower.includes('iphone') || lower.includes('ipad')) return 'iOS';
  if (lower.includes('web')) return 'Web';
  return value.trim();
}

function selectValue(options: SelectOption[], id?: string, label?: string): SelectOption | undefined {
  if (!id && !label) return undefined;
  return options.find((option) => option.id === id || option.label.toLowerCase() === label?.toLowerCase())
    ?? (label ? { id: id ?? optionId(label), label } : undefined);
}

function entryTitle(entry: VaultUnlockedEntry): string {
  if (entry.entryType === 'platform') return entry.platformName || 'Platform Vault';
  return entry.gameName || 'Game Vault';
}

function entrySubtitle(entry: VaultUnlockedEntry): string {
  if (entry.entryType === 'platform') return 'Platform Vault';
  return [entry.loginProvider, entry.platformName].filter(Boolean).join(' / ') || 'Game Vault';
}

function displayAccount(entry: VaultUnlockedEntry): string {
  return entry.secret.accountLabel || entry.secret.username || entry.secret.email || (entry.entryType === 'platform' ? 'Main account' : 'Main');
}

function mask(value?: string): string {
  return value ? '*'.repeat(Math.min(Math.max(value.length, 8), 16)) : 'Not set';
}

export default function VaultScreen() {
  const { theme } = useSettings();
  const toast = useToast();
  const {
    configured,
    unlocked,
    entries,
    loading,
    error,
    status,
    reloadStatus,
    reloadEntries,
    setupVault,
    unlockVault,
    lockVault,
    saveEntry,
    deleteEntry,
    copyPassword,
    changePin,
    searchGames,
  } = useVault();

  const [setupPin, setSetupPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [unlockPin, setUnlockPin] = useState('');
  const [pinEntryVisible, setPinEntryVisible] = useState(false);
  const [pinError, setPinError] = useState<string>();
  const [pinBusy, setPinBusy] = useState(false);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [pinChangeError, setPinChangeError] = useState<string>();

  const [query, setQuery] = useState('');
  const [formVisible, setFormVisible] = useState(false);
  const [detailEntry, setDetailEntry] = useState<VaultUnlockedEntry>();
  const [form, setForm] = useState<VaultFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [gameResults, setGameResults] = useState<GameSearchResult[]>([]);
  const [gameSearchState, setGameSearchState] = useState<GameSearchState>('idle');
  const [gameSearchError, setGameSearchError] = useState<string>();
  const [justUnlocked, setJustUnlocked] = useState(false);
  const [locking, setLocking] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const pinInputRef = useRef<TextInput>(null);
  const pinRevealAnim = useMemo(() => new Animated.Value(0), []);
  const lockPressAnim = useMemo(() => new Animated.Value(1), []);
  const lockShakeAnim = useMemo(() => new Animated.Value(0), []);
  const pinShakeAnim = useMemo(() => new Animated.Value(0), []);
  const contentRevealAnim = useMemo(() => new Animated.Value(0), []);
  const unlockOverlayAnim = useMemo(() => new Animated.Value(0), []);
  const lockOverlayAnim = useMemo(() => new Animated.Value(0), []);
  const gameSearchRequest = useRef(0);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => subscription.remove();
  }, []);

  const runGameSearch = useCallback(async (rawQuery: string, requestId = gameSearchRequest.current + 1) => {
    const trimmed = rawQuery.trim();
    if (trimmed.length < 3) return;
    gameSearchRequest.current = requestId;
    setGameSearchState('loading');
    setGameSearchError(undefined);
    try {
      const results = (await searchGames(trimmed)).slice(0, 8);
      if (gameSearchRequest.current !== requestId) return;
      setGameResults(results);
      setGameSearchState(results.length ? 'results' : 'no-results');
    } catch (caught) {
      if (gameSearchRequest.current !== requestId) return;
      setGameResults([]);
      setGameSearchError(caught instanceof Error ? caught.message : 'Unable to search games right now.');
      setGameSearchState('error');
    }
  }, [searchGames]);

  useEffect(() => {
    if (!formVisible || form.entryType !== 'game') return undefined;
    const trimmed = form.gameSearchText.trim();
    if (form.selectedGame || form.manualGameName || trimmed.length < 3) return undefined;

    const requestId = gameSearchRequest.current + 1;
    const timer = setTimeout(() => {
      void runGameSearch(trimmed, requestId);
    }, 420);
    return () => clearTimeout(timer);
  }, [form.entryType, form.gameSearchText, form.manualGameName, form.selectedGame, formVisible, runGameSearch]);

  useEffect(() => {
    if (!unlocked) {
      contentRevealAnim.setValue(0);
      return;
    }
    Animated.timing(contentRevealAnim, {
      toValue: 1,
      duration: reducedMotion ? 140 : 380,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [contentRevealAnim, reducedMotion, unlocked]);

  useEffect(() => {
    if (!justUnlocked) return;
    unlockOverlayAnim.setValue(0);
    Animated.timing(unlockOverlayAnim, {
      toValue: 1,
      duration: reducedMotion ? 180 : 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setJustUnlocked(false));
  }, [justUnlocked, reducedMotion, unlockOverlayAnim]);

  const filteredEntries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((entry) => [
      entryTitle(entry),
      entry.platformName,
      entry.loginProvider,
      entry.secret.accountLabel,
      entry.secret.username,
      entry.secret.email,
    ].some((value) => value?.toLowerCase().includes(needle)));
  }, [entries, query]);

  const gamePlatformOptions = useMemo(() => {
    const fromGame = (form.selectedGame?.platforms ?? [])
      .map(normalizePlatformLabel)
      .filter(Boolean)
      .map((label) => ({ id: optionId(label), label, subtitle: 'From selected game' }));
    return uniqueOptions([...fromGame, ...BASE_GAME_PLATFORM_OPTIONS]);
  }, [form.selectedGame?.platforms]);

  const loginProviderOptions = useMemo(() => {
    if (form.entryType !== 'game') return LOGIN_PROVIDER_OPTIONS;
    const gameName = (form.selectedGame?.name ?? form.manualGameName ?? form.gameSearchText).toLowerCase();
    const suggested = new Set<string>();
    if (gameName.includes('black desert')) {
      suggested.add('Steam');
      suggested.add('Pearl Abyss');
    }
    if (gameName.includes('valorant') || gameName.includes('league of legends')) suggested.add('Riot Games');
    if (form.platformName?.toLowerCase().includes('playstation')) suggested.add('PlayStation Network');
    if (form.platformName?.toLowerCase().includes('xbox')) suggested.add('Xbox');
    if (form.platformName?.toLowerCase().includes('nintendo')) suggested.add('Nintendo');

    const suggestedOptions = LOGIN_PROVIDER_OPTIONS
      .filter((option) => suggested.has(option.label))
      .map((option) => ({ ...option, subtitle: 'Suggested' }));
    return uniqueOptions([...suggestedOptions, ...LOGIN_PROVIDER_OPTIONS]);
  }, [form.entryType, form.gameSearchText, form.manualGameName, form.platformName, form.selectedGame?.name]);

  const selectedPlatformOption = selectValue(
    form.entryType === 'platform' ? PLATFORM_ACCOUNT_OPTIONS : gamePlatformOptions,
    form.platformId,
    form.platformName,
  );
  const selectedLoginProviderOption = selectValue(loginProviderOptions, optionId(form.loginProvider ?? ''), form.loginProvider);
  const effectivePlatformName = form.platformId === 'other' ? form.customPlatformName.trim() : form.platformName?.trim();
  const effectiveLoginProvider = form.loginProvider === 'Other' ? form.customLoginProvider.trim() : form.loginProvider?.trim();
  const effectiveGameName = form.selectedGame?.name ?? form.manualGameName;
  const canSave = Boolean(
    form.entryType
    && effectivePlatformName
    && form.password.trim()
    && (
      form.entryType === 'platform'
        ? form.username.trim() || form.email.trim()
        : effectiveGameName && effectiveLoginProvider
    ),
  );

  async function createVault() {
    setPinBusy(true);
    setPinError(undefined);
    try {
      await setupVault(setupPin, confirmPin);
      setSetupPin('');
      setConfirmPin('');
      setJustUnlocked(true);
      toast.showToast('Vault created', 'Your vault is ready.');
    } catch (caught) {
      setPinError(caught instanceof Error ? caught.message : 'Unable to create Vault.');
    } finally {
      setPinBusy(false);
    }
  }

  function revealPinEntry() {
    setPinEntryVisible(true);
    Animated.sequence([
      Animated.timing(lockPressAnim, { toValue: 0.94, duration: 90, useNativeDriver: true }),
      Animated.spring(lockPressAnim, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
    ]).start();
    Animated.timing(pinRevealAnim, {
      toValue: 1,
      duration: reducedMotion ? 120 : 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => pinInputRef.current?.focus());
  }

  function triggerWrongPin() {
    const shakeFrames = [-1, 1, -1, 1, -0.5, 0];
    Animated.parallel([
      Animated.sequence(shakeFrames.map((toValue) => Animated.timing(pinShakeAnim, { toValue, duration: 42, useNativeDriver: true }))),
      Animated.sequence(shakeFrames.map((toValue) => Animated.timing(lockShakeAnim, { toValue, duration: 42, useNativeDriver: true }))),
    ]).start();
  }

  async function unlock() {
    setPinBusy(true);
    setPinError(undefined);
    try {
      await unlockVault(unlockPin);
      setUnlockPin('');
      setJustUnlocked(true);
      toast.showToast('Vault unlocked');
    } catch (caught) {
      await reloadStatus().catch(() => undefined);
      setPinError(caught instanceof Error ? caught.message : 'Unable to unlock Vault.');
      setUnlockPin('');
      triggerWrongPin();
    } finally {
      setPinBusy(false);
    }
  }

  function startAdd() {
    setForm(EMPTY_FORM);
    setGameResults([]);
    setGameSearchState('idle');
    setGameSearchError(undefined);
    setFormError(undefined);
    setShowPassword(false);
    setFormVisible(true);
  }

  function startEdit(entry: VaultUnlockedEntry) {
    const entryType = entry.entryType ?? (entry.gameName ? 'game' : 'platform');
    setDetailEntry(undefined);
    setForm({
      id: entry.id,
      entryType,
      gameSearchText: entry.gameName ?? '',
      selectedGame: entryType === 'game' && entry.gameProvider === 'igdb' && entry.gameName
        ? {
          provider: 'igdb',
          providerId: entry.externalGameId ?? entry.id,
          name: entry.gameName,
          coverUrl: entry.coverUrl,
          platforms: entry.platformName ? [entry.platformName] : [],
        }
        : undefined,
      manualGameName: entryType === 'game' && entry.gameProvider !== 'igdb' ? entry.gameName : undefined,
      platformId: entry.platformId,
      platformName: entry.platformName,
      customPlatformName: entry.platformId === 'other' ? entry.platformName ?? '' : '',
      loginProvider: entry.loginProvider,
      customLoginProvider: '',
      accountLabel: entry.secret.accountLabel ?? '',
      username: entry.secret.username ?? '',
      email: entry.secret.email ?? '',
      password: entry.secret.password,
      recoveryEmail: entry.secret.recoveryEmail ?? '',
      notes: entry.secret.notes ?? '',
    });
    setGameResults([]);
    setGameSearchState(entryType === 'game' ? 'selected' : 'idle');
    setGameSearchError(undefined);
    setFormError(undefined);
    setShowPassword(false);
    setFormVisible(true);
  }

  function closeForm() {
    setFormVisible(false);
    setForm(EMPTY_FORM);
    setGameResults([]);
    setGameSearchState('idle');
    setGameSearchError(undefined);
    setFormError(undefined);
    setShowPassword(false);
  }

  function selectEntryType(entryType: VaultEntryType) {
    setForm((current) => ({
      ...current,
      entryType,
      gameSearchText: entryType === 'game' ? current.gameSearchText : '',
      selectedGame: undefined,
      manualGameName: undefined,
      platformId: undefined,
      platformName: undefined,
      customPlatformName: '',
      loginProvider: undefined,
      customLoginProvider: '',
    }));
    setGameResults([]);
    setGameSearchState('idle');
    setGameSearchError(undefined);
  }

  function updateGameSearchText(text: string) {
    const trimmed = text.trim();
    setForm((current) => ({
      ...current,
      gameSearchText: text,
      selectedGame: undefined,
      manualGameName: undefined,
    }));
    setGameResults([]);
    setGameSearchError(undefined);
    setGameSearchState(trimmed ? 'typing' : 'idle');
  }

  function selectGame(game: GameSearchResult) {
    setForm((current) => ({
      ...current,
      selectedGame: game,
      manualGameName: undefined,
      gameSearchText: game.name,
      platformId: undefined,
      platformName: undefined,
    }));
    setGameResults([]);
    setGameSearchState('selected');
  }

  function changeGameSelection() {
    setForm((current) => ({
      ...current,
      selectedGame: undefined,
      manualGameName: undefined,
      gameSearchText: '',
      platformId: undefined,
      platformName: undefined,
    }));
    setGameResults([]);
    setGameSearchState('idle');
  }

  function useManualGame() {
    const name = form.gameSearchText.trim();
    if (!name) return;
    setForm((current) => ({
      ...current,
      selectedGame: undefined,
      manualGameName: name,
    }));
    setGameResults([]);
    setGameSearchState('selected');
  }

  async function saveVaultForm() {
    if (!canSave || !form.entryType) return;
    setSaving(true);
    setFormError(undefined);
    try {
      const draft: VaultEntryDraft = {
        id: form.id,
        entryType: form.entryType,
        gameProvider: form.entryType === 'game' ? form.selectedGame ? 'igdb' : 'manual' : undefined,
        externalGameId: form.entryType === 'game' ? form.selectedGame?.providerId : undefined,
        gameName: form.entryType === 'game' ? effectiveGameName : undefined,
        platformId: form.platformId,
        platformName: effectivePlatformName,
        loginProvider: form.entryType === 'game' ? effectiveLoginProvider : undefined,
        coverUrl: form.entryType === 'game' ? form.selectedGame?.coverUrl : undefined,
        secret: {
          accountLabel: form.accountLabel,
          username: form.username,
          email: form.email,
          password: form.password,
          recoveryEmail: form.recoveryEmail,
          notes: form.notes,
        },
      };
      await saveEntry(draft);
      closeForm();
      toast.showToast('Saved securely', 'Vault entry added.');
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Unable to save vault.');
    } finally {
      setSaving(false);
    }
  }

  async function copyEntryPassword(entry: VaultUnlockedEntry) {
    await copyPassword(entry.secret.password);
    toast.showToast('Password copied', 'Clipboard will clear soon if supported.');
  }

  function confirmDelete(entry: VaultUnlockedEntry) {
    const run = async () => {
      await deleteEntry(entry.id);
      setDetailEntry(undefined);
      toast.showToast('Vault entry deleted');
    };
    if (Platform.OS === 'web') {
      void run();
      return;
    }
    Alert.alert('Delete vault entry?', 'This removes the encrypted entry from this device and requests backend deletion.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void run() },
    ]);
  }

  function lockWithAnimation() {
    if (locking) return;
    setLocking(true);
    lockOverlayAnim.setValue(0);
    Animated.parallel([
      Animated.timing(contentRevealAnim, {
        toValue: 0.25,
        duration: reducedMotion ? 120 : 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(lockOverlayAnim, {
        toValue: 1,
        duration: reducedMotion ? 160 : 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      lockVault();
      setPinEntryVisible(false);
      setUnlockPin('');
      setPinError(undefined);
      setLocking(false);
      lockOverlayAnim.setValue(0);
    });
  }

  async function submitPinChange() {
    setPinChangeError(undefined);
    try {
      await changePin(currentPin, newPin, confirmNewPin);
      setCurrentPin('');
      setNewPin('');
      setConfirmNewPin('');
      setPinModalVisible(false);
      toast.showToast('PIN changed', 'Vault key was re-wrapped.');
    } catch (caught) {
      setPinChangeError(caught instanceof Error ? caught.message : 'Unable to change PIN.');
    }
  }

  if (!configured) {
    return (
      <Screen scroll={false} contentStyle={styles.setupContent}>
        <VaultHeroLock variant="closed" size={118} />
        <Text style={[styles.heroTitle, { color: theme.colors.text }]}>Create Yoshioka Vault</Text>
        <Text style={[styles.heroSubtitle, { color: theme.colors.textMuted }]}>Choose a 6-digit PIN for this device.</Text>
        <Card style={styles.formCard}>
          <PinDotsInput label="New PIN" value={setupPin} onChangeText={setSetupPin} />
          <PinDotsInput label="Confirm PIN" value={confirmPin} onChangeText={setConfirmPin} />
          {pinError ? <Text style={[styles.errorText, { color: theme.colors.danger }]}>{pinError}</Text> : null}
          <Button onPress={createVault} loading={pinBusy} disabled={setupPin.length !== 6 || confirmPin.length !== 6}>
            Create Vault
          </Button>
        </Card>
        <Text style={[styles.microCopy, { color: theme.colors.textMuted }]}>If the PIN is forgotten, the encrypted vault cannot be recovered.</Text>
      </Screen>
    );
  }

  if (!unlocked) {
    const lockoutMessage = status?.lockedUntil ? `Try again after ${new Date(status.lockedUntil).toLocaleTimeString()}` : undefined;
    return (
      <Screen scroll={false} contentStyle={styles.lockedContent}>
        <Animated.View
          style={{
            transform: [
              { scale: lockPressAnim },
              { translateX: lockShakeAnim.interpolate({ inputRange: [-1, 1], outputRange: [-8, 8] }) },
            ],
          }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Tap to unlock Vault" onPress={revealPinEntry}>
            <VaultUnlockIndicator busy={pinBusy} variant={pinEntryVisible ? 'keyhole' : 'closed'} size={140} />
          </Pressable>
        </Animated.View>
        <Text style={[styles.heroTitle, { color: theme.colors.text }]}>Yoshioka Vault</Text>
        <Text style={[styles.heroSubtitle, { color: theme.colors.textMuted }]}>
          {pinEntryVisible ? 'Enter your 6-digit PIN' : 'Tap the lock to unlock'}
        </Text>

        {pinEntryVisible ? (
          <Animated.View
            style={[
              styles.unlockPanel,
              {
                opacity: pinRevealAnim,
                transform: [
                  { translateY: pinRevealAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
                  { translateX: pinShakeAnim.interpolate({ inputRange: [-1, 1], outputRange: [-10, 10] }) },
                ],
              },
            ]}>
            <PinDotsInput ref={pinInputRef} value={unlockPin} onChangeText={setUnlockPin} autoFocus />
            {status?.failedAttempts ? (
              <Text style={[styles.microCopy, { color: theme.colors.textMuted }]}>Failed attempts: {status.failedAttempts}/5</Text>
            ) : null}
            {lockoutMessage ? <Text style={[styles.errorText, { color: theme.colors.danger }]}>{lockoutMessage}</Text> : null}
            {pinError ? <Text style={[styles.errorText, { color: theme.colors.danger }]}>{pinError}</Text> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={pinBusy ? 'Unlocking Vault' : 'Unlock Vault'}
              disabled={pinBusy || unlockPin.length !== 6}
              onPress={() => void unlock()}
              style={({ pressed }) => [
                styles.unlockAction,
                {
                  backgroundColor: theme.colors.primary,
                  opacity: unlockPin.length !== 6 ? 0.45 : pressed ? 0.78 : 1,
                },
              ]}>
              <Text style={[styles.unlockActionText, { color: theme.dark ? '#141526' : '#FFFFFF' }]}>
                {pinBusy ? 'Unlocking...' : 'Unlock Vault'}
              </Text>
            </Pressable>
          </Animated.View>
        ) : null}

        <Text style={[styles.forgotText, { color: theme.colors.textMuted }]}>Forgot PIN requires creating a new vault.</Text>
      </Screen>
    );
  }

  return (
    <Screen
      title="Vault"
      subtitle={`${entries.length} saved vault${entries.length === 1 ? '' : 's'}`}
      refreshing={loading}
      onRefresh={() => void reloadEntries()}
      right={(
        <View style={styles.headerActions}>
          <HeaderAction label="Change PIN" onPress={() => setPinModalVisible(true)} />
          <HeaderAction label="Lock" onPress={lockWithAnimation} />
        </View>
      )}>
      <Animated.View
        style={{
          opacity: contentRevealAnim,
          transform: [{ translateY: contentRevealAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
        }}>
        {entries.length ? (
          <Button onPress={startAdd} style={styles.topAddButton}>+ Add Vault</Button>
        ) : null}

        {error ? (
          <Card style={styles.notice}>
            <Text style={[styles.errorText, { color: theme.colors.danger }]}>{error}</Text>
          </Card>
        ) : null}

        {entries.length > 1 ? (
          <TextInput
            placeholder="Search Vault"
            placeholderTextColor={theme.colors.textMuted}
            value={query}
            onChangeText={setQuery}
            style={[styles.searchInput, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.text }]}
          />
        ) : null}

        {loading && !entries.length ? (
          <VaultEntriesSkeleton />
        ) : filteredEntries.length ? filteredEntries.map((entry, index) => (
          <AnimatedEntryCard key={entry.id} index={index}>
            <Pressable accessibilityRole="button" onPress={() => setDetailEntry(entry)}>
              <Card style={styles.entryCard}>
                <View style={styles.entryRow}>
                  <VaultEntryArtwork entry={entry} />
                  <View style={styles.entryCopy}>
                    <Text style={[styles.entryKind, { color: theme.colors.primary }]}>{entry.entryType === 'platform' ? 'PLATFORM' : 'GAME'}</Text>
                    <Text style={[styles.entryTitle, { color: theme.colors.text }]}>{entryTitle(entry)}</Text>
                    <Text style={[styles.entrySubtitle, { color: theme.colors.textMuted }]}>{entrySubtitle(entry)}</Text>
                    <Text style={[styles.entryAccount, { color: theme.colors.text }]}>{displayAccount(entry)}</Text>
                  </View>
                  <Text style={[styles.chevron, { color: theme.colors.textMuted }]}>&gt;</Text>
                </View>
              </Card>
            </Pressable>
          </AnimatedEntryCard>
        )) : (
          <VaultEmptyState hasEntries={entries.length > 0} onAdd={startAdd} />
        )}
      </Animated.View>

      {locking ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.lockingOverlay,
            {
              opacity: lockOverlayAnim,
              transform: [{ scale: lockOverlayAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
            },
          ]}>
          <VaultHeroLock variant="closed" size={96} />
        </Animated.View>
      ) : null}

      {justUnlocked ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.unlockOverlay,
            {
              opacity: unlockOverlayAnim.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 0] }),
              transform: [
                { scale: unlockOverlayAnim.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0.86, 1.08, 0.72] }) },
                { translateY: unlockOverlayAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -18] }) },
              ],
            },
          ]}>
          <VaultHeroLock variant="open" size={106} />
        </Animated.View>
      ) : null}

      <AddVaultModal
        visible={formVisible}
        form={form}
        formError={formError}
        saving={saving}
        showPassword={showPassword}
        canSave={canSave}
        gameResults={gameResults}
        gameSearchState={gameSearchState}
        gameSearchError={gameSearchError}
        selectedPlatformOption={selectedPlatformOption}
        selectedLoginProviderOption={selectedLoginProviderOption}
        gamePlatformOptions={gamePlatformOptions}
        loginProviderOptions={loginProviderOptions}
        onClose={closeForm}
        onSelectEntryType={selectEntryType}
        onSelectGame={selectGame}
        onChangeGame={changeGameSelection}
        onSearchTextChange={updateGameSearchText}
        onUseManualGame={useManualGame}
        onRetryGameSearch={() => void runGameSearch(form.gameSearchText)}
        onShowPassword={() => setShowPassword((current) => !current)}
        onChangeForm={(patch) => setForm((current) => ({ ...current, ...patch }))}
        onSave={() => void saveVaultForm()}
      />

      <DetailModal
        entry={detailEntry}
        onClose={() => setDetailEntry(undefined)}
        onCopy={() => detailEntry ? void copyEntryPassword(detailEntry) : undefined}
        onEdit={() => detailEntry ? startEdit(detailEntry) : undefined}
        onDelete={() => detailEntry ? confirmDelete(detailEntry) : undefined}
      />

      <ChangePinModal
        visible={pinModalVisible}
        currentPin={currentPin}
        newPin={newPin}
        confirmNewPin={confirmNewPin}
        error={pinChangeError}
        onClose={() => setPinModalVisible(false)}
        onCurrentPin={setCurrentPin}
        onNewPin={setNewPin}
        onConfirmNewPin={setConfirmNewPin}
        onSubmit={() => void submitPinChange()}
      />
    </Screen>
  );
}

function VaultHeroLock({ variant, size, flush = false }: { variant: 'closed' | 'open' | 'keyhole'; size: number; flush?: boolean }) {
  const { theme } = useSettings();
  const iconName = variant === 'open'
    ? { ios: 'lock.open.fill', android: 'lock_open', web: 'lock_open' } as const
    : { ios: 'lock.fill', android: 'lock', web: 'lock' } as const;
  return (
    <View style={[styles.heroLockWrap, flush && styles.heroLockFlush, { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.colors.primarySoft }]}>
      <View style={[styles.heroGlow, { backgroundColor: theme.colors.primary }]} />
      <SymbolView name={iconName} tintColor={theme.colors.primary} size={Math.round(size * 0.44)} />
      {variant === 'keyhole' ? <View style={[styles.keyholePulse, { borderColor: theme.colors.primary }]} /> : null}
    </View>
  );
}

function VaultUnlockIndicator({ busy, variant, size }: { busy: boolean; variant: 'closed' | 'keyhole'; size: number }) {
  const { theme } = useSettings();
  const spin = useMemo(() => new Animated.Value(0), []);
  const pulse = useMemo(() => new Animated.Value(1), []);

  useEffect(() => {
    if (!busy) {
      spin.stopAnimation();
      pulse.stopAnimation();
      spin.setValue(0);
      pulse.setValue(1);
      return undefined;
    }
    const spinLoop = Animated.loop(Animated.timing(spin, {
      toValue: 1,
      duration: 900,
      easing: Easing.linear,
      useNativeDriver: true,
    }));
    const pulseLoop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.035, duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    spinLoop.start();
    pulseLoop.start();
    return () => {
      spinLoop.stop();
      pulseLoop.stop();
    };
  }, [busy, pulse, spin]);

  return (
    <View style={{ width: size + 18, height: size + 18, alignItems: 'center', justifyContent: 'center' }}>
      {busy ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.unlockRing,
            {
              width: size + 14,
              height: size + 14,
              borderRadius: (size + 14) / 2,
              borderTopColor: theme.colors.primary,
              borderRightColor: theme.colors.primary,
              transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
            },
          ]}
        />
      ) : null}
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <VaultHeroLock flush variant={variant} size={size} />
      </Animated.View>
    </View>
  );
}

type PinDotsInputProps = {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  autoFocus?: boolean;
};

const PinDotsInput = forwardRef<TextInput, PinDotsInputProps>(function PinDotsInput({ label, value, onChangeText, autoFocus }, ref) {
  const { theme } = useSettings();
  const inputRef = useRef<TextInput>(null);

  function assignRef(node: TextInput | null) {
    inputRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  }

  return (
    <View style={styles.field}>
      {label ? <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text> : null}
      <Pressable accessibilityRole="button" onPress={() => inputRef.current?.focus()}>
        <View style={[styles.pinDots, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
          {Array.from({ length: 6 }).map((_, index) => (
            <View
              key={index}
              style={[
                styles.pinDot,
                {
                  backgroundColor: index < value.length ? theme.colors.primary : 'transparent',
                  borderColor: index < value.length ? theme.colors.primary : theme.colors.textMuted,
                },
              ]}
            />
          ))}
        </View>
      </Pressable>
      <TextInput
        ref={assignRef}
        value={value}
        onChangeText={(text) => onChangeText(text.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        secureTextEntry
        maxLength={6}
        autoFocus={autoFocus}
        style={styles.hiddenPinInput}
      />
    </View>
  );
});

function HeaderAction({ label, onPress }: { label: string; onPress: () => void }) {
  const { theme } = useSettings();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.headerAction,
        { borderColor: theme.colors.border, backgroundColor: pressed ? theme.colors.primarySoft : 'transparent' },
      ]}>
      <Text style={[styles.headerActionText, { color: theme.colors.text }]}>{label}</Text>
    </Pressable>
  );
}

function AnimatedEntryCard({ children, index }: { children: ReactNode; index: number }) {
  const anim = useMemo(() => new Animated.Value(0), []);
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 260,
      delay: Math.min(index, 4) * 45,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [anim, index]);
  return (
    <Animated.View style={{ opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
      {children}
    </Animated.View>
  );
}

function VaultEntryArtwork({ entry }: { entry: VaultUnlockedEntry }) {
  if (entry.entryType === 'game' && entry.coverUrl) return <CoverImage uri={entry.coverUrl} style={styles.cover} />;
  return <FallbackArtwork variant={entry.entryType === 'platform' ? 'platform' : 'game'} style={styles.cover} />;
}

function CoverImage({ uri, style }: { uri?: string; style: ArtworkStyle }) {
  const [failed, setFailed] = useState(false);
  if (!uri || failed) return <FallbackArtwork variant="game" style={style as StyleProp<ViewStyle>} />;
  return <Image source={{ uri }} onError={() => setFailed(true)} style={style} />;
}

function FallbackArtwork({ variant, style }: { variant: 'game' | 'platform'; style: StyleProp<ViewStyle> }) {
  const { theme } = useSettings();
  return (
    <View style={[style, styles.fallbackArtwork, { backgroundColor: theme.colors.primarySoft }]}>
      <SymbolView
        name={variant === 'game'
          ? { ios: 'gamecontroller.fill', android: 'sports_esports', web: 'sports_esports' }
          : { ios: 'person.crop.square.filled.and.at.rectangle', android: 'account_circle', web: 'account_circle' }}
        tintColor={theme.colors.primary}
        size={24}
      />
    </View>
  );
}

function VaultEmptyState({ hasEntries, onAdd }: { hasEntries: boolean; onAdd: () => void }) {
  const { theme } = useSettings();
  return (
    <View style={styles.emptyState}>
      <VaultHeroLock variant="closed" size={78} />
      <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>{hasEntries ? 'No matching vault' : 'Your Vault is empty'}</Text>
      <Text style={[styles.emptyMessage, { color: theme.colors.textMuted }]}>
        {hasEntries ? 'Try a different search term.' : 'Save a game or platform login securely.'}
      </Text>
      {!hasEntries ? <Button onPress={onAdd} style={styles.emptyButton}>+ Add Vault</Button> : null}
    </View>
  );
}

function VaultEntriesSkeleton() {
  const { theme } = useSettings();
  return (
    <View accessibilityLabel="Loading encrypted Vault entries" style={styles.skeletonList}>
      {[0, 1].map((item) => (
        <Card key={item} style={styles.entryCard}>
          <View style={styles.entryRow}>
            <View style={[styles.skeletonArtwork, { backgroundColor: theme.colors.primarySoft }]} />
            <View style={styles.skeletonCopy}>
              <View style={[styles.skeletonLineShort, { backgroundColor: theme.colors.primarySoft }]} />
              <View style={[styles.skeletonLine, { backgroundColor: theme.colors.border }]} />
              <View style={[styles.skeletonLineMedium, { backgroundColor: theme.colors.border }]} />
            </View>
          </View>
        </Card>
      ))}
    </View>
  );
}

function AddVaultModal({
  visible,
  form,
  formError,
  saving,
  showPassword,
  canSave,
  gameResults,
  gameSearchState,
  gameSearchError,
  selectedPlatformOption,
  selectedLoginProviderOption,
  gamePlatformOptions,
  loginProviderOptions,
  onClose,
  onSelectEntryType,
  onSelectGame,
  onChangeGame,
  onSearchTextChange,
  onUseManualGame,
  onRetryGameSearch,
  onShowPassword,
  onChangeForm,
  onSave,
}: {
  visible: boolean;
  form: VaultFormState;
  formError?: string;
  saving: boolean;
  showPassword: boolean;
  canSave: boolean;
  gameResults: GameSearchResult[];
  gameSearchState: GameSearchState;
  gameSearchError?: string;
  selectedPlatformOption?: SelectOption;
  selectedLoginProviderOption?: SelectOption;
  gamePlatformOptions: SelectOption[];
  loginProviderOptions: SelectOption[];
  onClose: () => void;
  onSelectEntryType: (entryType: VaultEntryType) => void;
  onSelectGame: (game: GameSearchResult) => void;
  onChangeGame: () => void;
  onSearchTextChange: (text: string) => void;
  onUseManualGame: () => void;
  onRetryGameSearch: () => void;
  onShowPassword: () => void;
  onChangeForm: (patch: Partial<VaultFormState>) => void;
  onSave: () => void;
}) {
  const { theme } = useSettings();
  const platformOptions = form.entryType === 'platform' ? PLATFORM_ACCOUNT_OPTIONS : gamePlatformOptions;
  const selectedGameName = form.selectedGame?.name ?? form.manualGameName;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap}>
        <View style={[styles.modalCard, { backgroundColor: theme.colors.surfaceElevated }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>{form.id ? 'Edit Vault' : 'Add Vault'}</Text>
            <Pressable accessibilityRole="button" onPress={onClose}>
              <Text style={[styles.closeText, { color: theme.colors.primary }]}>Close</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>What do you want to save?</Text>
            <View style={styles.typeGrid}>
              <TypeChoice title="Platform Account" selected={form.entryType === 'platform'} onPress={() => onSelectEntryType('platform')} />
              <TypeChoice title="Game Account" selected={form.entryType === 'game'} onPress={() => onSelectEntryType('game')} />
            </View>

            {form.entryType === 'game' ? (
              <View style={styles.formSection}>
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Game</Text>
                {selectedGameName ? (
                  <SelectedGameCard game={form.selectedGame} manualName={form.manualGameName} onChange={onChangeGame} />
                ) : (
                  <>
                    <Field
                      label="Search game"
                      value={form.gameSearchText}
                      onChangeText={onSearchTextChange}
                      placeholder="Black Desert, Valorant..."
                      autoCapitalize="words"
                    />
                    <GameSearchPanel
                      query={form.gameSearchText}
                      state={gameSearchState}
                      results={gameResults}
                      error={gameSearchError}
                      onSelect={onSelectGame}
                      onRetry={onRetryGameSearch}
                      onUseManual={onUseManualGame}
                    />
                  </>
                )}
              </View>
            ) : null}

            {form.entryType ? (
              <>
                <View style={styles.formSection}>
                  <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Account</Text>
                  <SelectField
                    label="Platform"
                    placeholder="Select"
                    sheetTitle="Select Platform"
                    searchable
                    value={selectedPlatformOption}
                    options={platformOptions}
                    onChange={(option) => onChangeForm({
                      platformId: option.id,
                      platformName: option.label,
                      customPlatformName: option.id === 'other' ? '' : form.customPlatformName,
                    })}
                  />
                  {form.platformId === 'other' ? (
                    <Field
                      label="Platform name"
                      value={form.customPlatformName}
                      onChangeText={(value) => onChangeForm({ customPlatformName: value, platformName: value })}
                      placeholder="Enter platform"
                    />
                  ) : null}

                  {form.entryType === 'game' ? (
                    <>
                      <SelectField
                        label="Login Provider"
                        placeholder="Select"
                        sheetTitle="Select Login Provider"
                        searchable
                        value={selectedLoginProviderOption}
                        options={loginProviderOptions}
                        onChange={(option) => onChangeForm({
                          loginProvider: option.label,
                          customLoginProvider: option.id === 'other' ? '' : form.customLoginProvider,
                        })}
                      />
                      {form.loginProvider === 'Other' ? (
                        <Field
                          label="Login provider name"
                          value={form.customLoginProvider}
                          onChangeText={(value) => onChangeForm({ customLoginProvider: value })}
                          placeholder="Enter provider"
                        />
                      ) : null}
                    </>
                  ) : null}

                  <Field
                    label="Account label"
                    value={form.accountLabel}
                    onChangeText={(value) => onChangeForm({ accountLabel: value })}
                    placeholder={form.entryType === 'platform' ? 'Main account' : 'Main, alt, region, server'}
                  />
                </View>

                <View style={styles.formSection}>
                  <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Login</Text>
                  <Field
                    label="Username / Email"
                    value={form.username || form.email}
                    onChangeText={(value) => {
                      const looksEmail = value.includes('@');
                      onChangeForm({ username: looksEmail ? '' : value, email: looksEmail ? value : '' });
                    }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                  <Field
                    label="Password"
                    value={form.password}
                    onChangeText={(value) => onChangeForm({ password: value })}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    rightLabel={showPassword ? 'Hide' : 'Show'}
                    onRightPress={onShowPassword}
                  />
                </View>

                <View style={styles.formSection}>
                  <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Optional</Text>
                  <Field
                    label="Recovery Email"
                    value={form.recoveryEmail}
                    onChangeText={(value) => onChangeForm({ recoveryEmail: value })}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    placeholder="Optional"
                  />
                  <Field
                    label="Notes"
                    value={form.notes}
                    onChangeText={(value) => onChangeForm({ notes: value })}
                    multiline
                    placeholder="Optional"
                  />
                </View>

                {formError ? <Text style={[styles.errorText, { color: theme.colors.danger }]}>{formError}</Text> : null}
                <Button onPress={onSave} loading={saving} disabled={!canSave} style={styles.saveButton}>
                  Save Vault
                </Button>
              </>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function TypeChoice({ title, selected, onPress }: { title: string; selected: boolean; onPress: () => void }) {
  const { theme } = useSettings();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.typeChoice,
        {
          backgroundColor: selected ? theme.colors.primary : theme.colors.background,
          borderColor: selected ? theme.colors.primary : theme.colors.border,
          opacity: pressed ? 0.78 : 1,
        },
      ]}>
      <Text style={[styles.typeChoiceText, { color: selected ? (theme.dark ? '#15172A' : '#FFFFFF') : theme.colors.text }]}>{title}</Text>
    </Pressable>
  );
}

function SelectedGameCard({ game, manualName, onChange }: { game?: GameSearchResult; manualName?: string; onChange: () => void }) {
  const { theme } = useSettings();
  return (
    <Card style={styles.selectedGameCard}>
      <View style={styles.entryRow}>
        <CoverImage uri={game?.coverUrl} style={styles.resultCover} />
        <View style={styles.entryCopy}>
          <Text style={[styles.resultTitle, { color: theme.colors.text }]}>{game?.name ?? manualName}</Text>
          <Text style={[styles.entrySubtitle, { color: theme.colors.textMuted }]}>
            {game ? [game.releaseYear, game.platforms.slice(0, 3).map(normalizePlatformLabel).join(' / ')].filter(Boolean).join(' / ') : 'Manual game'}
          </Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onChange}>
          <Text style={[styles.closeText, { color: theme.colors.primary }]}>Change</Text>
        </Pressable>
      </View>
    </Card>
  );
}

function GameSearchPanel({
  query,
  state,
  results,
  error,
  onSelect,
  onRetry,
  onUseManual,
}: {
  query: string;
  state: GameSearchState;
  results: GameSearchResult[];
  error?: string;
  onSelect: (game: GameSearchResult) => void;
  onRetry: () => void;
  onUseManual: () => void;
}) {
  const { theme } = useSettings();
  const trimmed = query.trim();

  if (state === 'idle') return null;
  if (state === 'typing') {
    return trimmed.length < 3
      ? <Text style={[styles.searchHint, { color: theme.colors.textMuted }]}>Type at least 3 characters.</Text>
      : <Text style={[styles.searchHint, { color: theme.colors.textMuted }]}>Keep typing...</Text>;
  }
  if (state === 'loading') {
    return (
      <View style={styles.searchStatus}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={[styles.searchHint, { color: theme.colors.textMuted }]}>Searching...</Text>
      </View>
    );
  }
  if (state === 'error') {
    return (
      <Card style={styles.searchMessage}>
        <Text style={[styles.errorText, { color: theme.colors.warning }]}>{error ?? 'Unable to search games right now.'}</Text>
        <View style={styles.inlineActions}>
          <Button onPress={onRetry} variant="secondary" style={styles.inlineButton}>Retry</Button>
          <Button onPress={onUseManual} variant="ghost" style={styles.inlineButton}>Use manually</Button>
        </View>
      </Card>
    );
  }
  if (state === 'no-results') {
    return (
      <Card style={styles.searchMessage}>
        <Text style={[styles.resultTitle, { color: theme.colors.text }]}>No games found</Text>
        <Button onPress={onUseManual} variant="secondary" style={styles.manualButton}>{`Use "${trimmed}" manually`}</Button>
      </Card>
    );
  }
  if (state !== 'results') return null;

  return (
    <View style={[styles.resultList, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
      {results.map((game) => (
        <Pressable key={game.providerId} onPress={() => onSelect(game)} style={({ pressed }) => [styles.gameResult, { opacity: pressed ? 0.72 : 1 }]}>
          <CoverImage uri={game.coverUrl} style={styles.resultCover} />
          <View style={styles.entryCopy}>
            <Text style={[styles.resultTitle, { color: theme.colors.text }]}>{game.name}</Text>
            <Text style={[styles.entrySubtitle, { color: theme.colors.textMuted }]}>
              {[game.releaseYear, game.platforms.slice(0, 3).map(normalizePlatformLabel).join(' / ')].filter(Boolean).join(' / ')}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: KeyboardTypeOptions;
  rightLabel?: string;
  onRightPress?: () => void;
};

function Field({ label, value, onChangeText, placeholder, secureTextEntry, multiline, autoCapitalize, keyboardType, rightLabel, onRightPress }: FieldProps) {
  const { theme } = useSettings();
  return (
    <View style={styles.field}>
      <View style={styles.fieldHeader}>
        <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text>
        {rightLabel && onRightPress ? (
          <Pressable accessibilityRole="button" onPress={onRightPress}>
            <Text style={[styles.closeText, { color: theme.colors.primary }]}>{rightLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        style={[
          styles.input,
          multiline ? styles.textArea : undefined,
          { backgroundColor: theme.colors.background, borderColor: theme.colors.border, color: theme.colors.text },
        ]}
      />
    </View>
  );
}

function DetailModal({
  entry,
  onClose,
  onCopy,
  onEdit,
  onDelete,
}: {
  entry?: VaultUnlockedEntry;
  onClose: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { theme } = useSettings();
  return (
    <Modal visible={Boolean(entry)} animationType="slide" transparent onRequestClose={onClose}>
      {entry ? (
        <View style={styles.modalWrap}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.surfaceElevated }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>{entryTitle(entry)}</Text>
              <Pressable accessibilityRole="button" onPress={onClose}>
                <Text style={[styles.closeText, { color: theme.colors.primary }]}>Close</Text>
              </Pressable>
            </View>
            <SecretRow label="Type" value={entry.entryType === 'platform' ? 'Platform Account' : 'Game Account'} />
            {entry.entryType === 'game' ? <SecretRow label="Game" value={entry.gameName || 'Not set'} /> : null}
            <SecretRow label="Platform" value={entry.platformName || 'Not set'} />
            {entry.entryType === 'game' ? <SecretRow label="Login provider" value={entry.loginProvider || 'Not set'} /> : null}
            <SecretRow label="Account label" value={displayAccount(entry)} />
            <SecretRow label="Username" value={entry.secret.username || 'Not set'} />
            <SecretRow label="Email" value={entry.secret.email || 'Not set'} />
            <SecretRow label="Password" value={mask(entry.secret.password)} />
            <SecretRow label="Recovery email" value={entry.secret.recoveryEmail || 'Not set'} />
            <SecretRow label="Notes" value={entry.secret.notes || 'No notes'} />
            <View style={styles.actions}>
              <Button onPress={onCopy} style={styles.actionButton}>Copy Password</Button>
              <Button onPress={onEdit} variant="secondary" style={styles.actionButton}>Edit</Button>
            </View>
            <Button onPress={onDelete} variant="danger">Delete Vault</Button>
          </View>
        </View>
      ) : null}
    </Modal>
  );
}

function SecretRow({ label, value }: { label: string; value: string }) {
  const { theme } = useSettings();
  return (
    <View style={[styles.secretRow, { borderBottomColor: theme.colors.border }]}>
      <Text style={[styles.secretLabel, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text style={[styles.secretValue, { color: theme.colors.text }]}>{value}</Text>
    </View>
  );
}

function ChangePinModal({
  visible,
  currentPin,
  newPin,
  confirmNewPin,
  error,
  onClose,
  onCurrentPin,
  onNewPin,
  onConfirmNewPin,
  onSubmit,
}: {
  visible: boolean;
  currentPin: string;
  newPin: string;
  confirmNewPin: string;
  error?: string;
  onClose: () => void;
  onCurrentPin: (value: string) => void;
  onNewPin: (value: string) => void;
  onConfirmNewPin: (value: string) => void;
  onSubmit: () => void;
}) {
  const { theme } = useSettings();
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalWrap}>
        <View style={[styles.modalCard, { backgroundColor: theme.colors.surfaceElevated }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Change PIN</Text>
            <Pressable accessibilityRole="button" onPress={onClose}>
              <Text style={[styles.closeText, { color: theme.colors.primary }]}>Close</Text>
            </Pressable>
          </View>
          <PinDotsInput label="Current PIN" value={currentPin} onChangeText={onCurrentPin} />
          <PinDotsInput label="New PIN" value={newPin} onChangeText={onNewPin} />
          <PinDotsInput label="Confirm new PIN" value={confirmNewPin} onChangeText={onConfirmNewPin} />
          {error ? <Text style={[styles.errorText, { color: theme.colors.danger }]}>{error}</Text> : null}
          <Button onPress={onSubmit} disabled={currentPin.length !== 6 || newPin.length !== 6 || confirmNewPin.length !== 6}>
            Change PIN
          </Button>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  setupContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 74,
  },
  lockedContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 92,
  },
  heroLockWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  heroLockFlush: { marginBottom: 0 },
  unlockRing: {
    position: 'absolute',
    borderWidth: 3,
    borderLeftColor: 'rgba(158, 147, 255, 0.18)',
    borderBottomColor: 'rgba(158, 147, 255, 0.18)',
  },
  heroGlow: {
    position: 'absolute',
    width: '82%',
    height: '82%',
    borderRadius: 999,
    opacity: 0.12,
  },
  keyholePulse: {
    position: 'absolute',
    width: '72%',
    height: '72%',
    borderRadius: 999,
    borderWidth: 1,
    opacity: 0.42,
  },
  heroTitle: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
    letterSpacing: -0.7,
    textAlign: 'center',
  },
  heroSubtitle: {
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  unlockPanel: {
    width: '100%',
    gap: spacing.md,
  },
  unlockAction: {
    minHeight: 50,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  unlockActionText: { fontSize: 15, fontWeight: '800' },
  formCard: { gap: spacing.md, width: '100%' },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 0,
  },
  headerAction: {
    minHeight: 36,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActionText: { fontSize: 12, fontWeight: '800' },
  topAddButton: { marginBottom: spacing.md },
  notice: { marginBottom: spacing.md },
  searchInput: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    marginBottom: spacing.md,
    fontSize: 15,
  },
  entryCard: { marginBottom: spacing.sm },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  skeletonList: { paddingTop: spacing.xs },
  skeletonArtwork: { width: 58, height: 58, borderRadius: 14 },
  skeletonCopy: { flex: 1, gap: spacing.sm },
  skeletonLine: { width: '78%', height: 14, borderRadius: 8 },
  skeletonLineMedium: { width: '55%', height: 11, borderRadius: 8 },
  skeletonLineShort: { width: 72, height: 10, borderRadius: 8 },
  cover: { width: 54, height: 66, borderRadius: radius.md, backgroundColor: '#1A1A22' },
  fallbackArtwork: { alignItems: 'center', justifyContent: 'center' },
  entryCopy: { flex: 1 },
  entryKind: { fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 1.2 },
  entryTitle: { fontSize: 17, fontWeight: '900', marginTop: 1 },
  entrySubtitle: { marginTop: 3, fontSize: 12, lineHeight: 17 },
  entryAccount: { marginTop: 7, fontSize: 14, fontWeight: '800' },
  chevron: { fontSize: 24, fontWeight: '800' },
  emptyState: { alignItems: 'center', paddingVertical: 54, paddingHorizontal: 18 },
  emptyTitle: { marginTop: spacing.md, fontSize: 22, lineHeight: 28, fontWeight: '900', textAlign: 'center' },
  emptyMessage: { fontSize: 15, lineHeight: 21, textAlign: 'center', marginTop: 6, maxWidth: 300 },
  emptyButton: { marginTop: spacing.xl, minWidth: 170 },
  lockingOverlay: {
    position: 'absolute',
    top: '36%',
    alignSelf: 'center',
  },
  unlockOverlay: {
    position: 'absolute',
    top: '34%',
    alignSelf: 'center',
  },
  modalWrap: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.56)',
  },
  modalCard: {
    maxHeight: '92%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 18,
    gap: spacing.md,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  modalTitle: { flex: 1, fontSize: 26, lineHeight: 32, fontWeight: '900', paddingRight: spacing.md },
  closeText: { fontSize: 13, fontWeight: '900' },
  sectionTitle: { fontSize: 15, lineHeight: 21, fontWeight: '900', marginBottom: spacing.sm },
  typeGrid: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  typeChoice: {
    flex: 1,
    minHeight: 58,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  typeChoiceText: { textAlign: 'center', fontSize: 14, fontWeight: '900' },
  formSection: { marginBottom: spacing.lg },
  selectedGameCard: { marginBottom: spacing.md },
  field: { marginBottom: spacing.md },
  fieldHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 },
  label: { fontSize: 13, fontWeight: '900', marginBottom: 7 },
  input: {
    minHeight: 50,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '700',
  },
  textArea: { minHeight: 92, textAlignVertical: 'top' },
  hiddenPinInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  pinDots: {
    minHeight: 58,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  pinDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
  },
  forgotText: { marginTop: spacing.xl, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  microCopy: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
  errorText: { fontSize: 13, lineHeight: 19, fontWeight: '800' },
  searchHint: { fontSize: 13, lineHeight: 19, fontWeight: '700', marginBottom: spacing.md },
  searchStatus: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  searchMessage: { gap: spacing.sm, marginBottom: spacing.md },
  inlineActions: { flexDirection: 'row', gap: spacing.sm },
  inlineButton: { flex: 1, minHeight: 42 },
  manualButton: { marginTop: spacing.sm, minHeight: 42 },
  resultList: {
    maxHeight: 330,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  gameResult: {
    minHeight: 72,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  resultCover: { width: 42, height: 56, borderRadius: 10 },
  resultTitle: { fontSize: 15, fontWeight: '900' },
  saveButton: { marginTop: spacing.sm, marginBottom: spacing.xl },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.md },
  actionButton: { flex: 1 },
  secretRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
  },
  secretLabel: { fontSize: 12, fontWeight: '800', marginBottom: 3 },
  secretValue: { fontSize: 15, lineHeight: 21, fontWeight: '700' },
});
