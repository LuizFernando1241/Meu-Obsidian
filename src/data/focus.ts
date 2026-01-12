import { db } from './db';
import type { Space, UserStateRow } from './types';

const DEFAULT_USER_ID = 'local';
const DEFAULT_CAPACITY_MIN = 420;

const buildDefaultState = (space: Space): UserStateRow => ({
  userId: DEFAULT_USER_ID,
  space,
  focusTaskId: undefined,
  focusQueue: [],
  capacityLimitMin: DEFAULT_CAPACITY_MIN,
  updatedAt: Date.now(),
});

export const setFocusTask = async (space: Space, taskId: string | null) => {
  const key: [string, Space] = [DEFAULT_USER_ID, space];
  const existing = await db.user_state.get(key);
  const next: UserStateRow = {
    ...(existing ?? buildDefaultState(space)),
    focusTaskId: taskId ?? undefined,
    updatedAt: Date.now(),
  };
  await db.user_state.put(next);
};

export const setFocusQueue = async (space: Space, taskIds: string[]) => {
  const key: [string, Space] = [DEFAULT_USER_ID, space];
  const existing = await db.user_state.get(key);
  const next: UserStateRow = {
    ...(existing ?? buildDefaultState(space)),
    focusQueue: [...taskIds],
    updatedAt: Date.now(),
  };
  await db.user_state.put(next);
};

export const enqueueFocusTask = async (space: Space, taskId: string) => {
  const key: [string, Space] = [DEFAULT_USER_ID, space];
  const existing = await db.user_state.get(key);
  const queue = existing?.focusQueue ?? [];
  if (queue.includes(taskId)) {
    return;
  }
  const next: UserStateRow = {
    ...(existing ?? buildDefaultState(space)),
    focusQueue: [...queue, taskId].slice(0, 5),
    updatedAt: Date.now(),
  };
  await db.user_state.put(next);
};

export const removeFocusTask = async (space: Space, taskId: string) => {
  const key: [string, Space] = [DEFAULT_USER_ID, space];
  const existing = await db.user_state.get(key);
  if (!existing) {
    return;
  }
  const nextQueue = (existing.focusQueue ?? []).filter((id) => id !== taskId);
  const next: UserStateRow = {
    ...existing,
    focusQueue: nextQueue,
    updatedAt: Date.now(),
  };
  await db.user_state.put(next);
};
