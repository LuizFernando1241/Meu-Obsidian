const chains = new Map<string, Promise<unknown>>();

export const enqueueItemWrite = async <T>(
  itemId: string,
  fn: () => Promise<T>,
): Promise<T> => {
  const previous = chains.get(itemId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(fn);

  chains.set(itemId, next);
  next.catch(() => undefined);

  try {
    return await next;
  } finally {
    if (chains.get(itemId) === next) {
      chains.delete(itemId);
    }
  }
};
