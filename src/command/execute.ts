import type { NavigateFunction } from 'react-router-dom';

import { createFolder, createNote, setChecklistDue, setChecklistSnooze, updateChecklistMeta } from '../data/repo';
import { db } from '../data/db';
import type { Block, Node, NoteNode, Space } from '../data/types';
import { setFocusTask } from '../data/focus';
import { addDaysISO, getTodayISO, toISODate } from '../tasks/date';
import type { IndexedTask } from '../tasks/taskIndex';
import { buildTaskId } from '../tasks/indexerContract';
import { useTaskSelection } from '../store/useTaskSelection';
import type { Command } from './commands';
import { parseInput } from './parser';

const buildPayload = (rawInput: string) => {
  const parsed = parseInput(rawInput);
  const payload = {
    title: parsed.cleanTitle,
    tags: parsed.tags,
  };

  return payload;
};

export const executeCommand = async (
  command: Command,
  navigate: NavigateFunction,
  rawInput: string,
  context?: { currentItem?: Node | null; selectedTask?: IndexedTask | null; space?: Space },
) => {
  if (command.kind === 'nav') {
    navigate(command.path);
    return;
  }

  if (command.kind === 'open-task') {
    const task = command.task ?? context?.selectedTask;
    if (!task) {
      return;
    }
    useTaskSelection.getState().setSelectedTask(task);
    navigate(`/item/${task.noteId}`, { state: { highlightBlockId: task.blockId } });
    return;
  }

  if (command.kind === 'open') {
    navigate(`/item/${command.id}`);
    return;
  }

  if (command.kind === 'task-action') {
    const task = context?.selectedTask;
    if (!task) {
      throw new Error('Nenhuma tarefa selecionada.');
    }
    const today = getTodayISO();
    if (command.action === 'schedule-today') {
      await setChecklistSnooze(task.noteId, task.blockId, today);
      return;
    }
    if (command.action === 'schedule-tomorrow') {
      await setChecklistSnooze(task.noteId, task.blockId, addDaysISO(today, 1));
      return;
    }
    if (command.action === 'schedule-next-week') {
      await setChecklistSnooze(task.noteId, task.blockId, addDaysISO(today, 7));
      return;
    }
    if (command.action === 'due-set') {
      const parsed = parseInput(rawInput);
      if (!parsed.dueDate) {
        throw new Error('Informe uma data no formato AAAA-MM-DD.');
      }
      const iso = toISODate(new Date(parsed.dueDate));
      await setChecklistDue(task.noteId, task.blockId, iso);
      return;
    }
    if (command.action === 'toggle-next-action') {
      const note = (await db.items.get(task.noteId)) as NoteNode | undefined;
      const block = Array.isArray(note?.content)
        ? (note?.content.find((entry) => entry.id === task.blockId) as Block | undefined)
        : undefined;
      const current = Boolean(block?.meta && (block.meta as { isNextAction?: boolean }).isNextAction);
      await updateChecklistMeta(task.noteId, task.blockId, { isNextAction: !current });
      return;
    }
    if (command.action === 'set-focus') {
      const space = context?.space ?? 'PERSONAL';
      const note = (await db.items.get(task.noteId)) as NoteNode | undefined;
      const block = Array.isArray(note?.content)
        ? (note?.content.find((entry) => entry.id === task.blockId) as Block | undefined)
        : undefined;
      const itemId = block?.taskId ?? block?.id ?? task.blockId;
      const taskId = buildTaskId(task.noteId, task.blockId, itemId);
      await setFocusTask(space, taskId);
      return;
    }
    return;
  }

  if (command.kind === 'create') {
    const payload = buildPayload(rawInput);
    const resolveParentId = () => {
      if (command.target === 'root') {
        return undefined;
      }
      if (!context?.currentItem) {
        return undefined;
      }
      return context.currentItem.nodeType === 'folder'
        ? context.currentItem.id
        : context.currentItem.parentId;
    };
    const parentId = resolveParentId();
    const item =
      command.nodeType === 'folder'
        ? await createFolder({ ...payload, parentId })
        : await createNote({ ...payload, parentId });
    navigate(`/item/${item.id}`, { state: { focusEditor: true } });
  }
};
