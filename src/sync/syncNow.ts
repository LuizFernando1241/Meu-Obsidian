import { readRemoteVault, writeRemoteVault } from './gistClient';
import { applyMergedToLocal, readLocalSnapshot } from './localSnapshot';
import { mergeVaults } from './merge';
import { parseVault, serializeVault } from './vault';
import {
  buildConflictNote,
  collectExistingConflictKeys,
  buildConflictKey,
  hasMeaningfulDiff,
  type ConflictEntry,
} from './conflict';
import { getLastSuccessfulSyncAt } from './syncState';
import type { SyncSettings } from './types';

export const syncNow = async (
  settings: SyncSettings,
): Promise<{ status: 'ok' | 'error'; message: string }> => {
  try {
    const remoteText = await readRemoteVault(settings);
    const remoteVault = parseVault(remoteText.contentText);
    const localSnapshot = await readLocalSnapshot();
    const lastSyncAt = getLastSuccessfulSyncAt() ?? 0;
    const localById = new Map(localSnapshot.items.map((item) => [item.id, item]));
    const remoteById = new Map(remoteVault.items.map((item) => [item.id, item]));
    const conflicts: ConflictEntry[] = [];

    localById.forEach((localItem, id) => {
      const remoteItem = remoteById.get(id);
      if (!remoteItem) {
        return;
      }
      if (localItem.updatedAt <= lastSyncAt || remoteItem.updatedAt <= lastSyncAt) {
        return;
      }
      if (!hasMeaningfulDiff(localItem, remoteItem)) {
        return;
      }
      conflicts.push({ nodeId: id, local: localItem, remote: remoteItem });
    });

    const localVault = {
      schema: 1 as const,
      lastWriteAt: Date.now(),
      items: localSnapshot.items,
      tombstones: localSnapshot.tombstones,
      views: localSnapshot.views,
      schemas: localSnapshot.schemas,
    };

    const { merged, pushNeeded } = mergeVaults(localVault, remoteVault);
    const existingConflictKeys = collectExistingConflictKeys(merged.items);
    const createdAt = Date.now();
    const conflictNotes = conflicts
      .filter((conflict) => {
        const key = buildConflictKey(
          conflict.nodeId,
          conflict.local.updatedAt ?? 0,
          conflict.remote.updatedAt ?? 0,
        );
        if (existingConflictKeys.has(key)) {
          return false;
        }
        existingConflictKeys.add(key);
        return true;
      })
      .map((conflict) => buildConflictNote(conflict, createdAt));

    if (conflictNotes.length > 0) {
      merged.items.push(...conflictNotes);
    }

    await applyMergedToLocal(merged);

    const shouldPush = pushNeeded || conflictNotes.length > 0;
    if (shouldPush) {
      await writeRemoteVault(settings, serializeVault(merged));
    }

    return {
      status: 'ok',
      message: `Sync ok: ${merged.items.length} itens, ${merged.tombstones.length} tombstones, push: ${
        shouldPush ? 'sim' : 'nao'
      }`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'error', message };
  }
};
