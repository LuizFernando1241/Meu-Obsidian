import { v4 as uuidv4 } from 'uuid';

import { db } from './db';
import { getTodayISO } from '../tasks/date';
import { emitLocalChange, createNote, appendNoteBlock, getByTitleExact } from './repo';
import type { Block, InboxItemRow, NoteNode, Space } from './types';

const DEFAULT_USER_ID = 'local';

export const createInboxItem = async (
  content: string,
  space: Space,
  userId = DEFAULT_USER_ID,
): Promise<InboxItemRow> => {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error('Conteudo vazio.');
  }
  const now = Date.now();
  const row: InboxItemRow = {
    id: uuidv4(),
    userId,
    space,
    content: trimmed,
    status: 'OPEN',
    createdAt: now,
  };
  await db.inbox_items.put(row);
  emitLocalChange();
  return row;
};

export type InboxShortcutKind = 'task' | 'event' | 'note' | 'contact' | null;

export const parseInboxShortcut = (content: string): { kind: InboxShortcutKind; text: string } => {
  const trimmed = content.trimStart();
  const symbol = trimmed.charAt(0);
  const rest = trimmed.slice(1).trim();
  if (symbol === '!') {
    return { kind: 'task', text: rest || trimmed };
  }
  if (symbol === '@') {
    return { kind: 'event', text: rest || trimmed };
  }
  if (symbol === '#') {
    return { kind: 'note', text: rest || trimmed };
  }
  if (symbol === '$') {
    return { kind: 'contact', text: rest || trimmed };
  }
  return { kind: null, text: content.trim() };
};

const makeChecklistBlock = (text: string): Block => ({
  id: uuidv4(),
  type: 'checklist',
  text,
  checked: false,
  createdAt: Date.now(),
});

const makeParagraphBlock = (text: string): Block => ({
  id: uuidv4(),
  type: 'paragraph',
  text,
  createdAt: Date.now(),
});

const markProcessed = async (row: InboxItemRow, convertedTo: InboxItemRow['convertedTo']) => {
  await db.inbox_items.update(row.id, {
    status: 'PROCESSED',
    convertedTo,
    processedAt: Date.now(),
  });
  emitLocalChange();
};

export const convertInboxItemToTask = async (
  id: string,
): Promise<{ noteId: string; blockId: string } | null> => {
  const row = await db.inbox_items.get(id);
  if (!row || row.status !== 'OPEN') {
    return null;
  }
  const { text } = parseInboxShortcut(row.content);
  const title = `Inbox - ${row.space}`;
  const existing = await getByTitleExact(title);
  const block = makeChecklistBlock(text || row.content);
  let noteId = '';
  if (existing && existing.nodeType === 'note') {
    await appendNoteBlock(existing.id, block);
    noteId = existing.id;
  } else {
    const note = await createNote({ title, content: [block] });
    noteId = note.id;
  }
  await markProcessed(row, 'TASK');
  return { noteId, blockId: block.id };
};

const convertInboxItemToNoteWithTags = async (
  row: InboxItemRow,
  tags: string[],
  props?: Record<string, unknown>,
): Promise<NoteNode> => {
  const { text } = parseInboxShortcut(row.content);
  const cleanText = text || row.content;
  const title = cleanText.trim() ? cleanText.trim().slice(0, 80) : 'Nova nota';
  const note = await createNote({
    title,
    content: [makeParagraphBlock(cleanText)],
    tags,
    props,
  });
  return note;
};

export const convertInboxItemToNote = async (id: string): Promise<NoteNode | null> => {
  const row = await db.inbox_items.get(id);
  if (!row || row.status !== 'OPEN') {
    return null;
  }
  const note = await convertInboxItemToNoteWithTags(row, ['registro']);
  await markProcessed(row, 'NOTE');
  return note;
};

export const convertInboxItemToEvent = async (id: string): Promise<NoteNode | null> => {
  const row = await db.inbox_items.get(id);
  if (!row || row.status !== 'OPEN') {
    return null;
  }
  const note = await convertInboxItemToNoteWithTags(row, ['evento'], {
    eventDate: getTodayISO(),
    eventType: 'local',
  });
  await markProcessed(row, 'NOTE');
  return note;
};

export const convertInboxItemToRecord = async (id: string): Promise<NoteNode | null> => {
  const row = await db.inbox_items.get(id);
  if (!row || row.status !== 'OPEN') {
    return null;
  }
  const { kind } = parseInboxShortcut(row.content);
  const tags = kind === 'contact' ? ['registro', 'contato'] : ['registro', 'ideia'];
  const note = await convertInboxItemToNoteWithTags(row, tags, {
    recordType: kind === 'contact' ? 'contact' : 'idea',
  });
  await markProcessed(row, 'NOTE');
  return note;
};

export const archiveInboxItem = async (id: string): Promise<void> => {
  const row = await db.inbox_items.get(id);
  if (!row || row.status !== 'OPEN') {
    return;
  }
  await markProcessed(row, undefined);
};
