import React from 'react';

import type { Block } from '../../data/types';
import { useDebouncedCallback } from '../../app/useDebouncedCallback';

export type EditorSnapshot = {
  title: string;
  blocks: Block[];
};

const MAX = 100;
const TYPING_DELAY = 700;

const cloneBlocks = (blocks: Block[]) => blocks.map((block) => ({ ...block }));

const cloneSnapshot = (snapshot: EditorSnapshot): EditorSnapshot => ({
  title: snapshot.title,
  blocks: cloneBlocks(snapshot.blocks),
});

export const useEditorHistory = (initialSnapshot: EditorSnapshot) => {
  const [past, setPast] = React.useState<EditorSnapshot[]>([]);
  const [present, setPresentState] = React.useState<EditorSnapshot>(
    cloneSnapshot(initialSnapshot),
  );
  const [future, setFuture] = React.useState<EditorSnapshot[]>([]);

  const presentRef = React.useRef(present);
  const typingBaseRef = React.useRef<EditorSnapshot | null>(null);

  React.useEffect(() => {
    presentRef.current = present;
  }, [present]);

  const pushPast = React.useCallback((snapshot: EditorSnapshot) => {
    setPast((prev) => {
      const next = [...prev, cloneSnapshot(snapshot)];
      if (next.length > MAX) {
        next.splice(0, next.length - MAX);
      }
      return next;
    });
  }, []);

  const clearFuture = React.useCallback(() => setFuture([]), []);

  const commitTypingInternal = React.useCallback(() => {
    if (!typingBaseRef.current) {
      return;
    }
    const base = typingBaseRef.current;
    typingBaseRef.current = null;
    pushPast(base);
    clearFuture();
  }, [clearFuture, pushPast]);

  const { debounced: debouncedCommit, cancel: cancelDebounce } = useDebouncedCallback(
    commitTypingInternal,
    TYPING_DELAY,
  );

  const setPresent = React.useCallback(
    (next: EditorSnapshot, mode: 'typing' | 'structural') => {
      if (mode === 'typing') {
        if (!typingBaseRef.current) {
          typingBaseRef.current = cloneSnapshot(presentRef.current);
        }
        setPresentState(cloneSnapshot(next));
        debouncedCommit();
        return;
      }

      cancelDebounce();
      if (typingBaseRef.current) {
        pushPast(typingBaseRef.current);
        typingBaseRef.current = null;
      }
      pushPast(presentRef.current);
      clearFuture();
      setPresentState(cloneSnapshot(next));
    },
    [cancelDebounce, clearFuture, debouncedCommit, pushPast],
  );

  const commitTyping = React.useCallback(() => {
    cancelDebounce();
    commitTypingInternal();
  }, [cancelDebounce, commitTypingInternal]);

  const commitStructural = React.useCallback(() => {
    cancelDebounce();
    commitTypingInternal();
  }, [cancelDebounce, commitTypingInternal]);

  const undo = React.useCallback((): EditorSnapshot | null => {
    cancelDebounce();
    const current = presentRef.current;

    if (typingBaseRef.current) {
      const base = typingBaseRef.current;
      typingBaseRef.current = null;
      setFuture((prev) => [cloneSnapshot(current), ...prev]);
      setPresentState(cloneSnapshot(base));
      return base;
    }

    let previousSnapshot: EditorSnapshot | null = null;
    setPast((prev) => {
      if (prev.length === 0) {
        return prev;
      }
      const nextPast = [...prev];
      previousSnapshot = nextPast.pop() ?? null;
      return nextPast;
    });

    if (!previousSnapshot) {
      return null;
    }

    setFuture((prev) => [cloneSnapshot(current), ...prev]);
    setPresentState(cloneSnapshot(previousSnapshot));
    return previousSnapshot;
  }, [cancelDebounce]);

  const redo = React.useCallback((): EditorSnapshot | null => {
    cancelDebounce();
    const current = presentRef.current;
    let nextSnapshot: EditorSnapshot | null = null;

    setFuture((prev) => {
      if (prev.length === 0) {
        return prev;
      }
      const nextFuture = [...prev];
      nextSnapshot = nextFuture.shift() ?? null;
      return nextFuture;
    });

    if (!nextSnapshot) {
      return null;
    }

    setPast((prev) => [...prev, cloneSnapshot(current)]);
    setPresentState(cloneSnapshot(nextSnapshot));
    return nextSnapshot;
  }, [cancelDebounce]);

  const reset = React.useCallback(
    (snapshot: EditorSnapshot) => {
      cancelDebounce();
      typingBaseRef.current = null;
      setPast([]);
      setFuture([]);
      setPresentState(cloneSnapshot(snapshot));
    },
    [cancelDebounce],
  );

  const canUndo = past.length > 0 || Boolean(typingBaseRef.current);
  const canRedo = future.length > 0;

  return {
    past,
    present,
    future,
    canUndo,
    canRedo,
    setPresent,
    commitTyping,
    commitStructural,
    undo,
    redo,
    reset,
  };
};
