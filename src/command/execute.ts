import type { NavigateFunction } from 'react-router-dom';

import { createFolder, createNote } from '../data/repo';
import type { Node } from '../data/types';
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
  context?: { currentItem?: Node | null },
) => {
  if (command.kind === 'nav') {
    navigate(command.path);
    return;
  }

  if (command.kind === 'open') {
    navigate(`/item/${command.id}`);
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
