import type { SyncSettings } from './types';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline';

export type SyncError = {
  message: string;
  code?: string;
};

export type SyncRuntimeState = {
  status: SyncStatus;
  lastSyncAt?: number;
  lastAttemptAt?: number;
  lastSuccessfulSyncAt?: number;
  lastError?: SyncError | null;
  isSyncing: boolean;
  dirty: boolean;
};

type SyncPrefs = {
  autoSync: boolean;
  intervalMin: number;
};

const AUTO_SYNC_KEY = 'mf_sync_auto';
const INTERVAL_KEY = 'mf_sync_interval_min';
const LAST_SYNC_KEY = 'mf_sync_last_at';
const LAST_ATTEMPT_KEY = 'mf_sync_last_attempt_at';
const LAST_SUCCESS_KEY = 'mf_sync_last_success_at';
const SETTINGS_KEY = 'mf_sync_settings';

const DEFAULT_PREFS: SyncPrefs = {
  autoSync: true,
  intervalMin: 3,
};

let runtimeState: SyncRuntimeState = {
  status: 'idle',
  dirty: false,
  isSyncing: false,
  lastSyncAt: undefined,
  lastAttemptAt: undefined,
  lastError: undefined,
};

const listeners = new Set<(state: SyncRuntimeState) => void>();

const notify = () => {
  listeners.forEach((listener) => listener(runtimeState));
};

const clampInterval = (value: number) => {
  if (!Number.isFinite(value)) {
    return DEFAULT_PREFS.intervalMin;
  }
  return Math.min(60, Math.max(1, Math.floor(value)));
};

export const getSyncPrefs = (): SyncPrefs => {
  if (typeof window === 'undefined') {
    return DEFAULT_PREFS;
  }
  const autoRaw = window.localStorage.getItem(AUTO_SYNC_KEY);
  const intervalRaw = window.localStorage.getItem(INTERVAL_KEY);
  const autoSync = autoRaw === null ? DEFAULT_PREFS.autoSync : autoRaw === 'true';
  const intervalMin = intervalRaw ? clampInterval(Number(intervalRaw)) : DEFAULT_PREFS.intervalMin;
  return { autoSync, intervalMin };
};

export const setSyncPrefs = (prefs: SyncPrefs) => {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(AUTO_SYNC_KEY, String(Boolean(prefs.autoSync)));
  window.localStorage.setItem(INTERVAL_KEY, String(clampInterval(prefs.intervalMin)));
};

export const getLastAttemptAt = (): number | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }
  const raw =
    window.localStorage.getItem(LAST_ATTEMPT_KEY) ??
    window.localStorage.getItem(LAST_SYNC_KEY);
  if (!raw) {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
};

export const getLastSyncAt = (): number | undefined => getLastAttemptAt();

export const getLastSuccessfulSyncAt = (): number | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }
  const raw = window.localStorage.getItem(LAST_SUCCESS_KEY);
  if (!raw) {
    return getLastAttemptAt();
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
};

export const setLastAttemptAt = (value?: number) => {
  if (typeof window === 'undefined') {
    return;
  }
  if (!value) {
    window.localStorage.removeItem(LAST_ATTEMPT_KEY);
    window.localStorage.removeItem(LAST_SYNC_KEY);
    return;
  }
  window.localStorage.setItem(LAST_ATTEMPT_KEY, String(value));
  window.localStorage.setItem(LAST_SYNC_KEY, String(value));
};

export const setLastSyncAt = (value?: number) => setLastAttemptAt(value);

export const setLastSuccessfulSyncAt = (value?: number) => {
  if (typeof window === 'undefined') {
    return;
  }
  if (!value) {
    window.localStorage.removeItem(LAST_SUCCESS_KEY);
    return;
  }
  window.localStorage.setItem(LAST_SUCCESS_KEY, String(value));
};

if (runtimeState.lastSyncAt === undefined) {
  const lastSyncAt = getLastAttemptAt();
  const lastSuccessfulSyncAt = getLastSuccessfulSyncAt();
  runtimeState = {
    ...runtimeState,
    lastSyncAt,
    lastAttemptAt: lastSyncAt,
    lastSuccessfulSyncAt,
  };
}

export const getStoredSyncSettings = (): SyncSettings | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = window.localStorage.getItem(SETTINGS_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<SyncSettings>;
    const gistId = parsed.gistId?.trim();
    const token = parsed.token?.trim();
    if (!gistId || !token) {
      return null;
    }
    return {
      gistId,
      token,
      filename: parsed.filename?.trim() || undefined,
    };
  } catch {
    return null;
  }
};

export const getSyncState = (): SyncRuntimeState => runtimeState;

export const setSyncState = (partial: Partial<SyncRuntimeState>) => {
  runtimeState = { ...runtimeState, ...partial };
  notify();
};

export const subscribeSyncState = (listener: (state: SyncRuntimeState) => void) => {
  listeners.add(listener);
  listener(runtimeState);
  return () => {
    listeners.delete(listener);
  };
};
