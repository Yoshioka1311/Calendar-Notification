import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { vaultService } from '@/services/vaultService';
import type { GameSearchResult, VaultEntryDraft, VaultStatus, VaultUnlockedEntry } from '@/types/vault';

type VaultContextValue = {
  configured: boolean;
  unlocked: boolean;
  entries: VaultUnlockedEntry[];
  loading: boolean;
  error?: string;
  status?: VaultStatus;
  reloadStatus: () => Promise<void>;
  reloadEntries: () => Promise<void>;
  setupVault: (pin: string, confirmPin: string) => Promise<void>;
  unlockVault: (pin: string) => Promise<void>;
  lockVault: () => void;
  saveEntry: (draft: VaultEntryDraft) => Promise<VaultUnlockedEntry>;
  deleteEntry: (id: string) => Promise<void>;
  copyPassword: (password: string) => Promise<void>;
  changePin: (currentPin: string, newPin: string, confirmPin: string) => Promise<void>;
  searchGames: (query: string) => Promise<GameSearchResult[]>;
};

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<VaultStatus>();
  const [masterKeyHex, setMasterKeyHex] = useState<string>();
  const [entries, setEntries] = useState<VaultUnlockedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [activityTick, setActivityTick] = useState(0);

  const recordActivity = useCallback(() => {
    setActivityTick((current) => current + 1);
  }, []);

  const lockVault = useCallback(() => {
    setMasterKeyHex(undefined);
    setEntries([]);
  }, []);

  const reloadStatus = useCallback(async () => {
    const nextStatus = await vaultService.getVaultStatus();
    setStatus(nextStatus);
  }, []);

  const reloadEntries = useCallback(async () => {
    if (!masterKeyHex) return;
    setLoading(true);
    try {
      setEntries(await vaultService.listUnlockedEntries(masterKeyHex));
      setError(undefined);
      recordActivity();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load vault entries.');
    } finally {
      setLoading(false);
    }
  }, [masterKeyHex, recordActivity]);

  useEffect(() => {
    queueMicrotask(async () => {
      try {
        await reloadStatus();
      } finally {
        setLoading(false);
      }
    });
  }, [reloadStatus]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') lockVault();
    });
    return () => subscription.remove();
  }, [lockVault]);

  useEffect(() => {
    if (!masterKeyHex) return undefined;
    const timeoutMs = status?.autoLockMs ?? 60_000;
    const timer = setTimeout(lockVault, timeoutMs);
    return () => clearTimeout(timer);
  }, [masterKeyHex, status?.autoLockMs, activityTick, lockVault]);

  const setupVault = useCallback(async (pin: string, confirmPin: string) => {
    if (pin !== confirmPin) throw new Error('PIN confirmation does not match.');
    const key = await vaultService.setupVault(pin);
    setMasterKeyHex(key);
    setEntries([]);
    await reloadStatus();
    recordActivity();
  }, [reloadStatus, recordActivity]);

  const unlockVault = useCallback(async (pin: string) => {
    const key = await vaultService.unlockVault(pin);
    setMasterKeyHex(key);
    await reloadStatus();
    const nextEntries = await vaultService.listUnlockedEntries(key);
    setEntries(nextEntries);
    setError(undefined);
    recordActivity();
  }, [reloadStatus, recordActivity]);

  const saveEntry = useCallback(async (draft: VaultEntryDraft) => {
    if (!masterKeyHex) throw new Error('Unlock Vault first.');
    const entry = await vaultService.saveVaultEntry(masterKeyHex, draft);
    setEntries(await vaultService.listUnlockedEntries(masterKeyHex));
    recordActivity();
    return entry;
  }, [masterKeyHex, recordActivity]);

  const deleteEntry = useCallback(async (id: string) => {
    await vaultService.removeVaultEntry(id);
    setEntries((current) => current.filter((entry) => entry.id !== id));
    recordActivity();
  }, [recordActivity]);

  const copyPassword = useCallback(async (password: string) => {
    await vaultService.copyPassword(password);
    recordActivity();
  }, [recordActivity]);

  const changePin = useCallback(async (currentPin: string, newPin: string, confirmPin: string) => {
    if (newPin !== confirmPin) throw new Error('New PIN confirmation does not match.');
    const key = await vaultService.changeVaultPin(currentPin, newPin);
    setMasterKeyHex(key);
    await reloadStatus();
    recordActivity();
  }, [reloadStatus, recordActivity]);

  const value = useMemo<VaultContextValue>(() => ({
    configured: Boolean(status?.configured),
    unlocked: Boolean(masterKeyHex),
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
    searchGames: vaultService.searchGames,
  }), [status, masterKeyHex, entries, loading, error, reloadStatus, reloadEntries, setupVault, unlockVault, lockVault, saveEntry, deleteEntry, copyPassword, changePin]);

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault(): VaultContextValue {
  const context = useContext(VaultContext);
  if (!context) throw new Error('useVault must be used inside VaultProvider.');
  return context;
}
