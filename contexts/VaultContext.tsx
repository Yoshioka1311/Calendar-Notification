import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

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
  const masterKeyRef = useRef<string | undefined>(undefined);
  const sessionGeneration = useRef(0);

  const lockVault = useCallback(() => {
    sessionGeneration.current += 1;
    masterKeyRef.current = undefined;
    setMasterKeyHex(undefined);
    setEntries([]);
    setLoading(false);
    setError(undefined);
  }, []);

  const reloadStatus = useCallback(async () => {
    const nextStatus = await vaultService.getVaultStatus();
    setStatus(nextStatus);
  }, []);

  const loadEntriesForSession = useCallback(async (
    key: string,
    generation: number,
    refreshRemote: boolean,
  ) => {
    const startedAt = Date.now();
    try {
      const nextEntries = refreshRemote
        ? await vaultService.refreshUnlockedEntries(key)
        : await vaultService.listLocalUnlockedEntries(key);
      if (sessionGeneration.current !== generation || masterKeyRef.current !== key) return;
      setEntries(nextEntries);
      setError(undefined);
      if (__DEV__) {
        console.info(`[perf] vault ${refreshRemote ? 'sync' : 'local decrypt'} ${Date.now() - startedAt}ms`);
      }
    } catch (caught) {
      if (sessionGeneration.current !== generation) return;
      setError(caught instanceof Error ? caught.message : 'Unable to load vault entries.');
    } finally {
      if (sessionGeneration.current === generation) setLoading(false);
    }
  }, []);

  const hydrateUnlockedVault = useCallback((key: string) => {
    const generation = sessionGeneration.current + 1;
    sessionGeneration.current = generation;
    masterKeyRef.current = key;
    setMasterKeyHex(key);
    setEntries([]);
    setLoading(true);
    setError(undefined);

    queueMicrotask(async () => {
      await loadEntriesForSession(key, generation, false);
      if (sessionGeneration.current !== generation) return;
      void loadEntriesForSession(key, generation, true);
    });
  }, [loadEntriesForSession]);

  const reloadEntries = useCallback(async () => {
    const key = masterKeyRef.current;
    if (!key) return;
    setLoading(true);
    await loadEntriesForSession(key, sessionGeneration.current, true);
  }, [loadEntriesForSession]);

  useEffect(() => {
    queueMicrotask(async () => {
      try {
        await reloadStatus();
      } finally {
        setLoading(false);
      }
    });
  }, [reloadStatus]);

  const setupVault = useCallback(async (pin: string, confirmPin: string) => {
    if (pin !== confirmPin) throw new Error('PIN confirmation does not match.');
    const key = await vaultService.setupVault(pin);
    hydrateUnlockedVault(key);
    await reloadStatus();
  }, [hydrateUnlockedVault, reloadStatus]);

  const unlockVault = useCallback(async (pin: string) => {
    const startedAt = Date.now();
    const key = await vaultService.unlockVault(pin);
    if (__DEV__) console.info(`[perf] vault PIN verify and key unwrap ${Date.now() - startedAt}ms`);
    hydrateUnlockedVault(key);
  }, [hydrateUnlockedVault]);

  const saveEntry = useCallback(async (draft: VaultEntryDraft) => {
    const key = masterKeyRef.current;
    if (!key) throw new Error('Unlock Vault first.');
    const entry = await vaultService.saveVaultEntry(key, draft);
    setEntries((current) => [entry, ...current.filter((item) => item.id !== entry.id)]);
    return entry;
  }, []);

  const deleteEntry = useCallback(async (id: string) => {
    await vaultService.removeVaultEntry(id);
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const copyPassword = useCallback(async (password: string) => {
    await vaultService.copyPassword(password);
  }, []);

  const changePin = useCallback(async (currentPin: string, newPin: string, confirmPin: string) => {
    if (newPin !== confirmPin) throw new Error('New PIN confirmation does not match.');
    const key = await vaultService.changeVaultPin(currentPin, newPin);
    masterKeyRef.current = key;
    setMasterKeyHex(key);
    await reloadStatus();
  }, [reloadStatus]);

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
