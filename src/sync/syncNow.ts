import { readRemoteVault, writeRemoteVault } from './gistClient';
import { applyMergedToLocal, readLocalSnapshot } from './localSnapshot';
import { mergeVaults } from './merge';
import { parseVault, serializeVault } from './vault';
import type { SyncSettings } from './types';

export const syncNow = async (
  settings: SyncSettings,
): Promise<{ status: 'ok' | 'error'; message: string }> => {
  try {
    const remoteText = await readRemoteVault(settings);
    const remoteVault = parseVault(remoteText.contentText);
    const localSnapshot = await readLocalSnapshot();
    const localVault = {
      schema: 1 as const,
      lastWriteAt: Date.now(),
      items: localSnapshot.items,
      tombstones: localSnapshot.tombstones,
    };

    const { merged, pushNeeded } = mergeVaults(localVault, remoteVault);
    await applyMergedToLocal(merged);

    if (pushNeeded) {
      await writeRemoteVault(settings, serializeVault(merged));
    }

    return {
      status: 'ok',
      message: `Sync ok: ${merged.items.length} itens, ${merged.tombstones.length} tombstones, push: ${
        pushNeeded ? 'sim' : 'nao'
      }`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'error', message };
  }
};
