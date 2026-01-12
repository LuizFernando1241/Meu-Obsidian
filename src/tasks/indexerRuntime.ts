import { db } from '../data/db';
import type { NoteNode } from '../data/types';
import type { IndexerEvent } from './indexerContract';
import { createIndexerEventBus, createIndexerScheduler } from './indexerContract';
import { rebuildTaskIndexResumable } from './taskIndexRebuild';
import { removeTasksIndexForNoteId, syncTasksIndexForNote } from './taskIndexStore';

const eventBus = createIndexerEventBus();

const fetchNote = async (noteId: string): Promise<NoteNode | undefined> => {
  const node = await db.items.get(noteId);
  if (!node || node.nodeType !== 'note') {
    return undefined;
  }
  return node as NoteNode;
};

const handleNoteEvent = async (noteId: string) => {
  const note = await fetchNote(noteId);
  if (!note) {
    await removeTasksIndexForNoteId(noteId);
    return;
  }
  await syncTasksIndexForNote(note);
};

const scheduler = createIndexerScheduler({
  debounceMs: 350,
  onEvent: async (event) => {
    if (event.type === 'VAULT_REINDEX_REQUESTED') {
      await rebuildTaskIndexResumable();
      return;
    }
    await handleNoteEvent(event.noteId);
  },
});

eventBus.subscribe(scheduler.enqueue);

export const emitIndexerEvent = (event: IndexerEvent) => {
  eventBus.emit(event);
};

export const flushIndexerEvents = async (noteId?: string) => {
  await scheduler.flush(noteId);
};

export const shutdownIndexerEvents = () => {
  scheduler.shutdown();
};
