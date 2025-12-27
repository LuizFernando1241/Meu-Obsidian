import type { SyncSettings } from './types';
import { syncNow } from './syncNow';
import {
  getLastSyncAt,
  getSyncPrefs,
  getSyncState,
  getStoredSyncSettings,
  setLastSyncAt,
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
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      updateStatus({ status: 'offline', lastError: undefined });
      return;
    }

    const settings = getSettings();
    if (!settings) {
      updateStatus({ status: 'idle', lastError: undefined });
      return;
    }

    updateStatus({ status: 'syncing', lastError: undefined });
    const result = await syncNow(settings);
    if (result.status === 'ok') {
      const now = Date.now();
      updateStatus({
        status: 'synced',
        dirty: false,
        lastSyncAt: now,
        lastError: undefined,
      });
      setLastSyncAt(now);
    } else {
      updateStatus({
        status: 'error',
        lastError: result.message,
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
    if (lastSyncAt) {
      updateStatus({ lastSyncAt });
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
        updateStatus({ status: 'offline', lastError: undefined });
      });
    }
  }

  const prefs = getSyncPrefs();
  if (prefs.autoSync) {
    configureInterval();
    void runSync('startup');
  } else {
    clearTimers();
    updateStatus({ status: 'idle' });
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
    updateStatus({ status: 'idle' });
  }
};

export const setIntervalMin = (value: number) => {
  const prefs = getSyncPrefs();
  const next = { ...prefs, intervalMin: value };
  setSyncPrefs(next);
  configureInterval();
};
