import type { NavigateFunction } from 'react-router-dom';

import { createItem } from '../data/repo';
import type { ItemType } from '../data/types';
import type { Command } from './commands';
import { parseInput } from './parser';

const buildPayload = (
  itemType: ItemType,
  rawInput: string,
) => {
  const parsed = parseInput(rawInput);
  const payload = {
    type: itemType,
    title: parsed.cleanTitle,
    tags: parsed.tags,
  };

  if (itemType === 'task') {
    return {
      ...payload,
      status: 'todo' as const,
      dueDate: parsed.dueDate,
    };
  }

  return payload;
};

export const executeCommand = async (
  command: Command,
  navigate: NavigateFunction,
  rawInput: string,
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
    const payload = buildPayload(command.itemType, rawInput);
    const item = await createItem(payload);
    navigate(`/item/${item.id}`);
  }
};
