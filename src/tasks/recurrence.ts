import { addDays, addMonths, startOfDay } from 'date-fns';

import type { Item, Recurrence } from '../data/types';

const normalizeInterval = (interval: number | undefined) => {
  if (typeof interval === 'number' && interval > 0) {
    return Math.floor(interval);
  }
  return 1;
};

export const computeNextDueDateMs = (task: Item, nowMs: number): number | undefined => {
  const recurrence = task.recurrence as Recurrence | undefined;
  if (!recurrence) {
    return undefined;
  }

  const interval = normalizeInterval(recurrence.interval);
  const baseMs = typeof task.dueDate === 'number' ? task.dueDate : nowMs;
  const baseDate = startOfDay(new Date(baseMs));

  if (recurrence.freq === 'daily') {
    return startOfDay(addDays(baseDate, interval)).getTime();
  }

  if (recurrence.freq === 'weekly') {
    return startOfDay(addDays(baseDate, interval * 7)).getTime();
  }

  if (recurrence.freq === 'monthly') {
    return startOfDay(addMonths(baseDate, interval)).getTime();
  }

  return undefined;
};
