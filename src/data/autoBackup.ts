import { v4 as uuidv4 } from 'uuid';

import { buildVaultBackupPayload, downloadJson, importVaultPayload, validateVaultBackup } from './backup';
import { db } from './db';
import type { AutoBackup } from './types';

export type AutoBackupPrefs = {
  enabled: boolean;
  intervalHours: number;
  retention: number;
};

const DEFAULT_PREFS: AutoBackupPrefs = {
  enabled: true,
  intervalHours: 24,
  retention: 10,
};

const ENABLED_KEY = 'mf_auto_backup_enabled';
const INTERVAL_KEY = 'mf_auto_backup_interval_hours';
const RETENTION_KEY = 'mf_auto_backup_retention';
const LAST_AT_KEY = 'mf_auto_backup_last_at';

const clampNumber = (value: number, min: number, max: number, fallback: number) => {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(value)));
};

export const getAutoBackupPrefs = (): AutoBackupPrefs => {
  if (typeof window === 'undefined') {
    return DEFAULT_PREFS;
  }
  const enabledRaw = window.localStorage.getItem(ENABLED_KEY);
  const intervalRaw = window.localStorage.getItem(INTERVAL_KEY);
  const retentionRaw = window.localStorage.getItem(RETENTION_KEY);
  const enabled =
    enabledRaw === null ? DEFAULT_PREFS.enabled : enabledRaw === 'true';
  const intervalHours = clampNumber(
    intervalRaw ? Number(intervalRaw) : DEFAULT_PREFS.intervalHours,
    1,
    168,
    DEFAULT_PREFS.intervalHours,
  );
  const retention = clampNumber(
    retentionRaw ? Number(retentionRaw) : DEFAULT_PREFS.retention,
    1,
    50,
    DEFAULT_PREFS.retention,
  );
  return { enabled, intervalHours, retention };
};

export const setAutoBackupPrefs = (prefs: AutoBackupPrefs) => {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(ENABLED_KEY, String(Boolean(prefs.enabled)));
  window.localStorage.setItem(
    INTERVAL_KEY,
    String(clampNumber(prefs.intervalHours, 1, 168, DEFAULT_PREFS.intervalHours)),
  );
  window.localStorage.setItem(
    RETENTION_KEY,
    String(clampNumber(prefs.retention, 1, 50, DEFAULT_PREFS.retention)),
  );
};

export const getLastAutoBackupAt = (): number | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }
  const raw = window.localStorage.getItem(LAST_AT_KEY);
  if (!raw) {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
};

export const setLastAutoBackupAt = (value?: number) => {
  if (typeof window === 'undefined') {
    return;
  }
  if (!value) {
    window.localStorage.removeItem(LAST_AT_KEY);
    return;
  }
  window.localStorage.setItem(LAST_AT_KEY, String(value));
};

const buildBackupFilename = (createdAt: number) => {
  const date = new Date(createdAt);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `vault-auto-${year}${month}${day}-${hours}${minutes}.json`;
};

const pruneAutoBackups = async (retention: number) => {
  const all = await db.autoBackups.orderBy('createdAt').reverse().toArray();
  if (all.length <= retention) {
    return;
  }
  const toDelete = all.slice(retention).map((entry) => entry.id);
  if (toDelete.length > 0) {
    await db.autoBackups.bulkDelete(toDelete);
  }
};

export const listAutoBackups = async (): Promise<AutoBackup[]> =>
  db.autoBackups.orderBy('createdAt').reverse().toArray();

export const getAutoBackup = async (id: string): Promise<AutoBackup | undefined> =>
  db.autoBackups.get(id) as Promise<AutoBackup | undefined>;

export const deleteAutoBackup = async (id: string): Promise<void> => {
  await db.autoBackups.delete(id);
};

export const createAutoBackup = async (
  prefs: AutoBackupPrefs,
): Promise<AutoBackup> => {
  const payload = await buildVaultBackupPayload();
  const payloadJson = JSON.stringify(payload);
  const createdAt = Date.now();
  const backup: AutoBackup = {
    id: uuidv4(),
    createdAt,
    bytes: payloadJson.length,
    payloadJson,
  };
  await db.autoBackups.put(backup);
  await pruneAutoBackups(prefs.retention);
  setLastAutoBackupAt(createdAt);
  return backup;
};

let autoBackupInFlight: Promise<AutoBackup | null> | null = null;

export const runAutoBackupIfDue = async (): Promise<AutoBackup | null> => {
  if (autoBackupInFlight) {
    return autoBackupInFlight;
  }
  const execute = async () => {
    const prefs = getAutoBackupPrefs();
    if (!prefs.enabled) {
      return null;
    }
    const lastAt = getLastAutoBackupAt();
    const intervalMs = prefs.intervalHours * 60 * 60 * 1000;
    if (lastAt && Date.now() - lastAt < intervalMs) {
      return null;
    }
    return createAutoBackup(prefs);
  };
  autoBackupInFlight = execute().finally(() => {
    autoBackupInFlight = null;
  });
  return autoBackupInFlight;
};

export const runAutoBackupNow = async (): Promise<AutoBackup> => {
  const prefs = getAutoBackupPrefs();
  return createAutoBackup(prefs);
};

export const downloadAutoBackup = (backup: AutoBackup) => {
  const payload = JSON.parse(backup.payloadJson) as unknown;
  downloadJson(payload, buildBackupFilename(backup.createdAt));
};

export const restoreAutoBackup = async (backup: AutoBackup) => {
  let payload: unknown;
  try {
    payload = JSON.parse(backup.payloadJson);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Backup invalido: ${message}`);
  }
  const validation = validateVaultBackup(payload);
  if (!validation.ok) {
    throw new Error(validation.error);
  }
  return importVaultPayload(payload, 'replace');
};
