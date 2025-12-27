import { useCallback, useEffect, useRef } from 'react';

type AnyFn = (...args: any[]) => void;

export const useDebouncedCallback = <T extends AnyFn>(callback: T, delay: number) => {
  const callbackRef = useRef(callback);
  const timeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const cancel = useCallback(() => {
    if (timeoutRef.current !== undefined) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, []);

  const debounced = useCallback(
    (...args: Parameters<T>) => {
      cancel();
      timeoutRef.current = window.setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [cancel, delay],
  );

  useEffect(() => cancel, [cancel]);

  return { debounced, cancel };
};
