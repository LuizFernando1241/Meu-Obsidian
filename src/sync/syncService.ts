import type { SyncSettings } from './types';
import { syncNow } from './syncNow';
import {
  getLastSyncAt,
  getSyncPrefs,
  getSyncState,
  getStoredSyncSettings,
  getLastSuccessfulSyncAt,
  setLastAttemptAt,
  setLastSuccessfulSyncAt,
  setSyncPrefs,
  setSyncState,
} from './syncState';

const DEBOUNCE_MS = 25000;

let settingsProvider: (() => SyncSettings | null) | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;
let debounceId: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<void> | null = null;
let pending = false;
let initialized = false;

const getSettings = (): SyncSettings | null => {
  if (settingsProvider) {
    return settingsProvider();
  }
  return getStoredSyncSettings();
};

const updateStatus = (status: Parameters<typeof setSyncState>[0]) => {
  setSyncState(status);
};

const runSync = async (reason: string) => {
  void reason;
  if (inFlight) {
    pending = true;
    return inFlight;
  }

  const execute = async () => {
    const settings = getSettings();
    if (!settings) {
      updateStatus({ status: 'idle', lastError: null, isSyncing: false });
      return;
    }

    const now = Date.now();
    updateStatus({
      status: 'syncing',
      isSyncing: true,
      lastAttemptAt: now,
      lastSyncAt: now,
      lastError: null,
    });
    setLastAttemptAt(now);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      updateStatus({ status: 'offline', lastError: null, isSyncing: false });
      return;
    }

    const result = await syncNow(settings);
    if (result.status === 'ok') {
      const completedAt = Date.now();
      updateStatus({
        status: 'synced',
        dirty: false,
        lastSyncAt: completedAt,
        lastAttemptAt: completedAt,
        lastSuccessfulSyncAt: completedAt,
        lastError: null,
        isSyncing: false,
      });
      setLastAttemptAt(completedAt);
      setLastSuccessfulSyncAt(completedAt);
    } else {
      updateStatus({
        status: 'error',
        lastError: { message: result.message },
        isSyncing: false,
      });
    }
  };

  inFlight = execute().finally(() => {
    inFlight = null;
    if (pending) {
      pending = false;
      void runSync('pending');
    }
  });

  return inFlight;
};

const clearTimers = () => {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (debounceId) {
    clearTimeout(debounceId);
    debounceId = null;
  }
};

const configureInterval = () => {
  const prefs = getSyncPrefs();
  if (!prefs.autoSync) {
    clearTimers();
    return;
  }
  if (intervalId) {
    clearInterval(intervalId);
  }
  intervalId = setInterval(() => {
    void runSync('interval');
  }, prefs.intervalMin * 60 * 1000);
};

export const initAutoSync = (provider?: () => SyncSettings | null) => {
  settingsProvider = provider ?? settingsProvider;

  if (!initialized) {
    initialized = true;

    const lastSyncAt = getLastSyncAt();
    const lastSuccessfulSyncAt = getLastSuccessfulSyncAt();
    if (lastSyncAt || lastSuccessfulSyncAt) {
      updateStatus({ lastSyncAt, lastAttemptAt: lastSyncAt, lastSuccessfulSyncAt });
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        const prefs = getSyncPrefs();
        if (document.visibilityState === 'visible' && prefs.autoSync) {
          void runSync('focus');
        }
      });
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        const prefs = getSyncPrefs();
        if (prefs.autoSync) {
          scheduleSyncSoon();
        }
      });

      window.addEventListener('offline', () => {
        updateStatus({ status: 'offline', lastError: null, isSyncing: false });
      });
    }
  }

  const prefs = getSyncPrefs();
  if (prefs.autoSync) {
    configureInterval();
    void runSync('startup');
  } else {
    clearTimers();
    updateStatus({ status: 'idle', isSyncing: false });
  }
};

export const syncNowManual = async () => {
  await runSync('manual');
};

export const markDirty = () => {
  const state = getSyncState();
  if (!state.dirty) {
    updateStatus({ dirty: true });
  }
};

export const scheduleSyncSoon = () => {
  const prefs = getSyncPrefs();
  if (!prefs.autoSync) {
    return;
  }
  if (debounceId) {
    clearTimeout(debounceId);
  }
  debounceId = setTimeout(() => {
    const state = getSyncState();
    if (state.dirty) {
      void runSync('debounced');
    }
  }, DEBOUNCE_MS);
};

export const setAutoSyncEnabled = (enabled: boolean) => {
  const prefs = getSyncPrefs();
  const next = { ...prefs, autoSync: enabled };
  setSyncPrefs(next);
  if (enabled) {
    configureInterval();
    void runSync('toggle');
  } else {
    clearTimers();
    updateStatus({ status: 'idle', isSyncing: false });
  }
};

export const setIntervalMin = (value: number) => {
  const prefs = getSyncPrefs();
  const next = { ...prefs, intervalMin: value };
  setSyncPrefs(next);
  configureInterval();
};
