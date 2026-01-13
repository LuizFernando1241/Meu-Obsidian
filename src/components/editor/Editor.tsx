import React from 'react';
import { Box, Stack } from '@mui/material';
import { v4 as uuidv4 } from 'uuid';

import type { ParsedWikilink } from '../../app/wikilinks';
import { replaceRange } from '../../app/wikilinks';
import { createNote, searchByTitlePrefix } from '../../data/repo';
import type { Block, BlockType, Node } from '../../data/types';
import { parseMarkdownToBlocks } from '../../editor/markdownToBlocks';
import { useNotifier } from '../Notifier';
import BlockEditor from './BlockEditor';
import { arrayMove, findIndexById } from './reorder';
import SlashMenu from './SlashMenu';
import WikilinkAutocomplete from './WikilinkAutocomplete';

type FocusTarget = {
  id: string;
  position?: 'start' | 'end';
  selectionStart?: number;
  selectionEnd?: number;
};

type LinkState = {
  blockId: string;
  anchorEl: HTMLElement | null;
  query: string;
  replaceStart: number;
  replaceEnd: number;
  highlightedIndex: number;
};

type EditorProps = {
  blocks: Block[];
  onBlocksChangeTyping: (blocks: Block[]) => void;
  onBlocksChangeStructural: (blocks: Block[]) => void;
  onBlur?: () => void;
  focusRequest?: { id: string; position?: 'start' | 'end'; nonce: number };
  onFocusBlock?: (blockId: string) => void;
  onPromoteChecklist?: (blockId: string, text: string) => void;
  onChecklistToggleTask?: (taskId: string, checked: boolean) => void;
  onLinkClick?: (link: ParsedWikilink) => void;
};

const BLOCK_TYPES: BlockType[] = [
  'paragraph',
  'h1',
  'h2',
  'h3',
  'bullet',
  'numbered',
  'checklist',
  'callout',
  'code',
  'divider',
];

const TEXTUAL_BLOCK_TYPES: BlockType[] = [
  'paragraph',
  'h1',
  'h2',
  'h3',
  'bullet',
  'numbered',
  'checklist',
  'callout',
];

const isBlockType = (value: string | undefined): value is BlockType =>
  !!value && BLOCK_TYPES.includes(value as BlockType);

const isTextualBlock = (value: BlockType) => TEXTUAL_BLOCK_TYPES.includes(value);

const getHeadingLevel = (type?: BlockType) =>
  type === 'h1' ? 1 : type === 'h2' ? 2 : type === 'h3' ? 3 : 0;

const computeHeadingState = (blocks: Block[]) => {
  const hiddenIds = new Set<string>();
  const headingHasChildren: Record<string, boolean> = {};
  const stack: { id: string; level: number; collapsed: boolean }[] = [];

  const markAncestorsWithChildren = () => {
    stack.forEach((entry) => {
      headingHasChildren[entry.id] = true;
    });
  };

  blocks.forEach((block) => {
    const level = getHeadingLevel(isBlockType(block.type) ? block.type : undefined);
    if (level) {
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      const isHidden = stack.some((entry) => entry.collapsed);
      if (isHidden) {
        hiddenIds.add(block.id);
      }
      markAncestorsWithChildren();
      stack.push({ id: block.id, level, collapsed: Boolean(block.collapsed) });
      return;
    }

    const isHidden = stack.some((entry) => entry.collapsed);
    if (isHidden) {
      hiddenIds.add(block.id);
    }
    markAncestorsWithChildren();
  });

  return { hiddenIds, headingHasChildren };
};

type ShortcutMatch = {
  type: BlockType;
  text: string;
  checked?: boolean;
};

const getShortcutMatch = (text: string): ShortcutMatch | null => {
  const trimmed = text.trim();
  if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
    return { type: 'divider', text: '' };
  }

  const codeMatch = text.match(/^!\s*(.*)$/);
  if (codeMatch) {
    return { type: 'code', text: codeMatch[1] ?? '' };
  }

  const atChecklistMatch = text.match(/^@\s*\[( |x|X)\]\s*(.*)$/);
  if (atChecklistMatch) {
    return {
      type: 'checklist',
      text: atChecklistMatch[2] ?? '',
      checked: atChecklistMatch[1].toLowerCase() === 'x',
    };
  }

  const atChecklistSimpleMatch = text.match(/^@\s+(.*)$/);
  if (atChecklistSimpleMatch) {
    return {
      type: 'checklist',
      text: atChecklistSimpleMatch[1] ?? '',
      checked: false,
    };
  }

  const checklistMatch = text.match(/^[-*]\s*\[( |x|X)\]\s*(.*)$/);
  if (checklistMatch) {
    return {
      type: 'checklist',
      text: checklistMatch[2] ?? '',
      checked: checklistMatch[1].toLowerCase() === 'x',
    };
  }

  const inlineChecklistMatch = text.match(/^\[( |x|X)\]\s*(.*)$/);
  if (inlineChecklistMatch) {
    return {
      type: 'checklist',
      text: inlineChecklistMatch[2] ?? '',
      checked: inlineChecklistMatch[1].toLowerCase() === 'x',
    };
  }

  const headingMatch = text.match(/^(#{1,3})(\s+)?(.*)$/);
  if (headingMatch) {
    const level = headingMatch[1].length;
    const remainder = headingMatch[3] ?? '';
    if (!headingMatch[2] && remainder.length === 0) {
      return null;
    }
    const type = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3';
    return { type, text: remainder };
  }

  const bulletMatch = text.match(/^[-*]\s+(.*)$/);
  if (bulletMatch) {
    return { type: 'bullet', text: bulletMatch[1] ?? '' };
  }

  const numberedMatch = text.match(/^\d+\.\s+(.*)$/);
  if (numberedMatch) {
    return { type: 'numbered', text: numberedMatch[1] ?? '' };
  }

  const calloutMatch = text.match(/^>\s*(.*)$/);
  if (calloutMatch) {
    return { type: 'callout', text: calloutMatch[1] ?? '' };
  }

  return null;
};

const createEmptyBlock = (): Block => ({
  id: uuidv4(),
  type: 'paragraph',
  text: '',
});

const createBlockWithType = (type: BlockType): Block => {
  const base = createEmptyBlock();
  if (!isBlockType(type)) {
    return base;
  }
  const next: Block = { ...base, type };
  if (type === 'checklist') {
    next.checked = false;
    next.createdAt = Date.now();
  }
  return next;
};

const parseSlashCommand = (text: string) => {
  if (!text.startsWith('/')) {
    return null;
  }
  const raw = text.slice(1);
  const spaceIndex = raw.search(/\s/);
  const query = spaceIndex === -1 ? raw : raw.slice(0, spaceIndex);
  const remainder = spaceIndex === -1 ? '' : raw.slice(spaceIndex + 1);
  return { query, remainder: remainder.replace(/^\s+/, '') };
};

const getWikilinkContext = (text: string, caret: number) => {
  const beforeCaret = text.slice(0, caret);
  const start = beforeCaret.lastIndexOf('[[');
  if (start < 0) {
    return null;
  }
  const afterStart = beforeCaret.slice(start + 2);
  if (!afterStart) {
    return { query: '', start, end: caret };
  }
  if (afterStart.includes(']]') || afterStart.includes(']')) {
    return null;
  }
  return { query: afterStart, start, end: caret };
};

export default function Editor({
  blocks,
  onBlocksChangeTyping,
  onBlocksChangeStructural,
  onBlur,
  focusRequest,
  onFocusBlock,
  onPromoteChecklist,
  onChecklistToggleTask,
  onLinkClick,
}: EditorProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const blockRefs = React.useRef<Record<string, HTMLElement | null>>({});
  const blocksRef = React.useRef(blocks);
  const notifier = useNotifier();

  const [focusTarget, setFocusTarget] = React.useState<FocusTarget | null>(null);
  const [slashState, setSlashState] = React.useState<{
    blockId: string;
    anchorEl: HTMLElement | null;
    query: string;
  } | null>(null);

  const { hiddenIds, headingHasChildren } = React.useMemo(
    () => computeHeadingState(blocks),
    [blocks],
  );
  const visibleBlocks = React.useMemo(
    () =>
      blocks
        .map((block, index) => ({ block, index }))
        .filter(({ block }) => !hiddenIds.has(block.id)),
    [blocks, hiddenIds],
  );
  const [linkState, setLinkState] = React.useState<LinkState | null>(null);
  const [linkResults, setLinkResults] = React.useState<Node[]>([]);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);
  const [dropPosition, setDropPosition] = React.useState<'above' | 'below' | null>(null);
  const lastFocusedIdRef = React.useRef<string | null>(null);
  const selectionAnchorRef = React.useRef<string | null>(null);
  const [selectedBlockIds, setSelectedBlockIds] = React.useState<string[]>([]);
  const selectedIdSet = React.useMemo(
    () => new Set(selectedBlockIds),
    [selectedBlockIds],
  );
  const isSelectingRef = React.useRef(false);
  const [rawEditBlockId, setRawEditBlockId] = React.useState<string | null>(null);

  React.useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  const updateBlocks = React.useCallback(
    (
      updater: (current: Block[]) => Block[],
      mode: 'typing' | 'structural',
    ) => {
      const next = updater(blocksRef.current);
      if (mode === 'typing') {
        onBlocksChangeTyping(next);
      } else {
        onBlocksChangeStructural(next);
      }
    },
    [onBlocksChangeStructural, onBlocksChangeTyping],
  );

  const getBlockIdFromPoint = React.useCallback((x: number, y: number) => {
    const element = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!element) {
      return null;
    }
    const blockElement = element.closest('[data-block-id]') as HTMLElement | null;
    return blockElement?.dataset.blockId ?? null;
  }, []);

  const updateSelectionRange = React.useCallback((anchorId: string, currentId: string) => {
    const blocksSnapshot = blocksRef.current;
    const anchorIndex = blocksSnapshot.findIndex((block) => block.id === anchorId);
    const currentIndex = blocksSnapshot.findIndex((block) => block.id === currentId);
    if (anchorIndex === -1 || currentIndex === -1) {
      return;
    }
    const from = Math.min(anchorIndex, currentIndex);
    const to = Math.max(anchorIndex, currentIndex);
    const rangeIds = blocksSnapshot.slice(from, to + 1).map((block) => block.id);
    setSelectedBlockIds(rangeIds);
  }, []);

  React.useEffect(() => {
    setSelectedBlockIds((prev) => prev.filter((id) => blocksRef.current.some((b) => b.id === id)));
  }, [blocks]);

  React.useEffect(() => {
    if (selectedBlockIds.length === 0) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement;
      if (containerRef.current && active && !containerRef.current.contains(active)) {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setSelectedBlockIds([]);
        selectionAnchorRef.current = null;
        return;
      }
      if (event.key !== 'Backspace' && event.key !== 'Delete') {
        return;
      }
      event.preventDefault();
      const selected = new Set(selectedBlockIds);
      if (selected.size === 0) {
        return;
      }
      const currentBlocks = blocksRef.current;
      const indices = currentBlocks
        .map((block, index) => (selected.has(block.id) ? index : -1))
        .filter((index) => index !== -1);
      if (indices.length === 0) {
        return;
      }
      const minIndex = Math.min(...indices);
      const remaining = currentBlocks.filter((block) => !selected.has(block.id));
      const nextBlocks =
        remaining.length === 0 ? [createEmptyBlock()] : remaining;
      updateBlocks(() => nextBlocks, 'structural');
      setSelectedBlockIds([]);
      selectionAnchorRef.current = null;
      const nextFocus =
        nextBlocks[minIndex]?.id ?? nextBlocks[minIndex - 1]?.id ?? nextBlocks[0]?.id;
      if (nextFocus) {
        setFocusTarget({ id: nextFocus, position: 'start' });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedBlockIds, updateBlocks]);

  const clearDragState = React.useCallback(() => {
    setDraggingId(null);
    setOverId(null);
    setDropPosition(null);
  }, []);

  const getDragId = (event: React.DragEvent) =>
    event.dataTransfer.getData('application/x-block-id') ||
    event.dataTransfer.getData('text/plain') ||
    '';

  const handleDragStart = React.useCallback(
    (event: React.DragEvent, blockId: string) => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', blockId);
      event.dataTransfer.setData('application/x-block-id', blockId);
      lastFocusedIdRef.current = blockId;
      setDraggingId(blockId);
      setOverId(blockId);
      setDropPosition(null);
      if (slashState) {
        setSlashState(null);
      }
      if (linkState) {
        setLinkState(null);
        setLinkResults([]);
      }
    },
    [linkState, slashState],
  );

  const handleDragEnd = React.useCallback(() => {
    clearDragState();
  }, [clearDragState]);

  const handleDragOver = React.useCallback(
    (event: React.DragEvent, blockId: string) => {
      const activeId = draggingId || getDragId(event);
      if (!activeId) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (!draggingId) {
        setDraggingId(activeId);
      }

      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const nextPosition = event.clientY < rect.top + rect.height / 2 ? 'above' : 'below';
      if (overId !== blockId || dropPosition !== nextPosition) {
        setOverId(blockId);
        setDropPosition(nextPosition);
      }
    },
    [draggingId, dropPosition, overId],
  );

  const handleDrop = React.useCallback(
    (event: React.DragEvent, blockId: string) => {
      event.preventDefault();
      const activeId = draggingId || getDragId(event);
      if (!activeId) {
        clearDragState();
        return;
      }

      const fromIndex = findIndexById(blocksRef.current, activeId);
      const overIndex = findIndexById(blocksRef.current, blockId);
      if (fromIndex < 0 || overIndex < 0) {
        clearDragState();
        return;
      }

      let toIndex = overIndex;
      if (dropPosition === 'below') {
        toIndex = overIndex + 1;
      }

      const next = arrayMove(blocksRef.current, fromIndex, toIndex);
      const orderChanged =
        next.length !== blocksRef.current.length ||
        next.some((block, index) => block.id !== blocksRef.current[index]?.id);

      if (orderChanged) {
        updateBlocks(() => next, 'structural');
        const focusId = lastFocusedIdRef.current ?? activeId;
        const nextFocusId = next.some((block) => block.id === focusId)
          ? focusId
          : next[0]?.id ?? activeId;
        setFocusTarget({ id: nextFocusId, position: 'end' });
      }

      clearDragState();
    },
    [clearDragState, draggingId, dropPosition, updateBlocks],
  );

  React.useEffect(() => {
    if (!linkState) {
      setLinkResults([]);
      return;
    }

    let active = true;
    searchByTitlePrefix(linkState.query.trim(), 10)
      .then((items) => {
        if (active) {
          setLinkResults(items);
        }
      })
      .catch((error) => {
        console.error(error);
        if (active) {
          setLinkResults([]);
        }
      });

    return () => {
      active = false;
    };
  }, [linkState?.query]);

  React.useEffect(() => {
    if (!focusTarget) {
      return;
    }
    const element = blockRefs.current[focusTarget.id];
    if (!element) {
      return;
    }
    element.focus();
    if ('setSelectionRange' in element && 'value' in element) {
      const valueLength = String((element as HTMLTextAreaElement).value ?? '').length;
      if (focusTarget.selectionStart !== undefined) {
        const selectionStart = focusTarget.selectionStart;
        const selectionEnd = focusTarget.selectionEnd ?? selectionStart;
        (element as HTMLTextAreaElement).setSelectionRange(selectionStart, selectionEnd);
      } else {
        const position = focusTarget.position === 'end' ? valueLength : 0;
        (element as HTMLTextAreaElement).setSelectionRange(position, position);
      }
    }
    setFocusTarget(null);
  }, [focusTarget, blocks]);

  React.useEffect(() => {
    if (!focusRequest) {
      return;
    }
    const targetId =
      blocksRef.current.find((block) => block.id === focusRequest.id)?.id ??
      blocksRef.current[0]?.id;
    if (!targetId) {
      return;
    }
    setFocusTarget({ id: targetId, position: focusRequest.position ?? 'end' });
  }, [focusRequest?.nonce]);

  const handleSelectBlock = React.useCallback(
    (event: React.MouseEvent, blockId: string) => {
      const blocksSnapshot = blocksRef.current;
      const blockIndex = blocksSnapshot.findIndex((block) => block.id === blockId);
      if (blockIndex === -1) {
        return;
      }
      if (event.shiftKey && selectionAnchorRef.current) {
        const anchorIndex = blocksSnapshot.findIndex(
          (block) => block.id === selectionAnchorRef.current,
        );
        if (anchorIndex === -1) {
          setSelectedBlockIds([blockId]);
          selectionAnchorRef.current = blockId;
          return;
        }
        const from = Math.min(anchorIndex, blockIndex);
        const to = Math.max(anchorIndex, blockIndex);
        const rangeIds = blocksSnapshot.slice(from, to + 1).map((block) => block.id);
        setSelectedBlockIds(rangeIds);
        return;
      }

      if (event.metaKey || event.ctrlKey) {
        setSelectedBlockIds((prev) => {
          const next = new Set(prev);
          if (next.has(blockId)) {
            next.delete(blockId);
          } else {
            next.add(blockId);
          }
          return blocksSnapshot
            .filter((block) => next.has(block.id))
            .map((block) => block.id);
        });
        selectionAnchorRef.current = blockId;
        return;
      }

      setSelectedBlockIds([blockId]);
      selectionAnchorRef.current = blockId;
    },
    [],
  );

  const handleSelectionStart = React.useCallback(
    (event: React.MouseEvent, blockId: string) => {
      if (event.button !== 0) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        target.closest(
          'textarea, input, button, [contenteditable="true"], .drag-handle',
        )
      ) {
        return;
      }
      if (event.shiftKey || event.metaKey || event.ctrlKey) {
        handleSelectBlock(event, blockId);
        return;
      }

      event.preventDefault();
      isSelectingRef.current = true;
      selectionAnchorRef.current = blockId;
      updateSelectionRange(blockId, blockId);

      const handleMove = (moveEvent: MouseEvent) => {
        if (!isSelectingRef.current) {
          return;
        }
        const hoverId = getBlockIdFromPoint(moveEvent.clientX, moveEvent.clientY);
        if (!hoverId) {
          return;
        }
        updateSelectionRange(selectionAnchorRef.current ?? blockId, hoverId);
      };

      const handleUp = () => {
        isSelectingRef.current = false;
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleUp);
      };

      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
    },
    [getBlockIdFromPoint, handleSelectBlock, updateSelectionRange],
  );

  const updateSlashState = React.useCallback(
    (blockId: string, text: string) => {
      const parsed = parseSlashCommand(text);
      if (!parsed) {
        if (slashState?.blockId === blockId) {
          setSlashState(null);
        }
        return;
      }
      const anchorEl = blockRefs.current[blockId] ?? null;
      setSlashState({ blockId, anchorEl, query: parsed.query });
    },
    [slashState],
  );

  const updateLinkState = React.useCallback(
    (
      blockId: string,
      text: string,
      meta?: { selectionStart?: number; selectionEnd?: number },
    ) => {
      const current = blocksRef.current.find((block) => block.id === blockId);
      const currentType = isBlockType(current?.type) ? current?.type : 'paragraph';
      if (!current || !isTextualBlock(currentType)) {
        if (linkState?.blockId === blockId) {
          setLinkState(null);
        }
        return;
      }

      const element = blockRefs.current[blockId] as HTMLInputElement | HTMLTextAreaElement | null;
      const selectionStart =
        meta?.selectionStart ??
        (element && 'selectionStart' in element ? element.selectionStart ?? text.length : text.length);
      const context = getWikilinkContext(text, selectionStart);
      if (!context) {
        if (linkState?.blockId === blockId) {
          setLinkState(null);
        }
        return;
      }
      const anchorEl = blockRefs.current[blockId] ?? null;
      setLinkState({
        blockId,
        anchorEl,
        query: context.query,
        replaceStart: context.start,
        replaceEnd: context.end,
        highlightedIndex: 0,
      });
    },
    [linkState],
  );

  const insertBlockAfter = React.useCallback(
    (index: number, type: BlockType = 'paragraph') => {
      const newBlock = createBlockWithType(type);
      updateBlocks((prev) => {
        const next = [...prev];
        next.splice(index + 1, 0, newBlock);
        return next;
      }, 'structural');
      setFocusTarget({ id: newBlock.id, position: 'start' });
    },
    [updateBlocks],
  );

  const removeBlockAt = React.useCallback(
    (index: number) => {
      updateBlocks((prev) => {
        const next = [...prev];
        const [removed] = next.splice(index, 1);
        if (removed && slashState?.blockId === removed.id) {
          setSlashState(null);
        }
        if (removed && linkState?.blockId === removed.id) {
          setLinkState(null);
        }
        return next.length === 0 ? [createEmptyBlock()] : next;
      }, 'structural');
    },
    [updateBlocks, slashState, linkState],
  );

  const applyLinkInsertion = React.useCallback(
    (item: { id: string; title: string }) => {
      if (!linkState) {
        return;
      }
      const display = item.title.trim() || 'Sem titulo';
      const replacement = `[[id:${item.id}|${display}]] `;
      let nextFocus: FocusTarget | null = null;

      updateBlocks((prev) => {
        const index = prev.findIndex((block) => block.id === linkState.blockId);
        if (index === -1) {
          return prev;
        }
        const current = prev[index];
        const text = current.text ?? '';
        const nextText = replaceRange(
          text,
          linkState.replaceStart,
          linkState.replaceEnd,
          replacement,
        );
        const next = [...prev];
        next[index] = { ...current, text: nextText };
        const caret = linkState.replaceStart + replacement.length;
        nextFocus = { id: current.id, selectionStart: caret, selectionEnd: caret };
        return next;
      }, 'structural');

      if (nextFocus) {
        setFocusTarget(nextFocus);
      }
      setLinkState(null);
    },
    [linkState, updateBlocks],
  );

  const handleCreateNew = React.useCallback(
    async (titleOverride?: string) => {
      const title =
        titleOverride?.trim() ?? (linkState ? linkState.query.trim() : '');
      if (!title) {
        return;
      }
      try {
        const created = await createNote({ title });
        applyLinkInsertion({ id: created.id, title: created.title });
      } catch (error) {
        console.error(error);
        const message = error instanceof Error ? error.message : String(error);
        notifier.error(`Erro ao criar nota: ${message}`);
      }
    },
    [applyLinkInsertion, linkState, notifier],
  );

  const handleSelectItem = React.useCallback(
    (item: Node) => {
      applyLinkInsertion({ id: item.id, title: item.title });
    },
    [applyLinkInsertion],
  );

  const handleBlockKeyDown = React.useCallback(
    (event: React.KeyboardEvent, index: number, block: Block) => {
      const text = block.text ?? '';

      if (linkState?.blockId === block.id) {
        const optionsCount = linkResults.length > 0 ? linkResults.length : linkState.query.trim() ? 1 : 0;
        if (event.key === 'ArrowDown' && optionsCount > 0) {
          event.preventDefault();
          setLinkState((prev) => {
            if (!prev) {
              return prev;
            }
            const nextIndex = (prev.highlightedIndex + 1) % optionsCount;
            return { ...prev, highlightedIndex: nextIndex };
          });
          return;
        }
        if (event.key === 'ArrowUp' && optionsCount > 0) {
          event.preventDefault();
          setLinkState((prev) => {
            if (!prev) {
              return prev;
            }
            const nextIndex = (prev.highlightedIndex - 1 + optionsCount) % optionsCount;
            return { ...prev, highlightedIndex: nextIndex };
          });
          return;
        }
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          if (linkResults.length > 0) {
            const selected = linkResults[linkState.highlightedIndex] ?? linkResults[0];
            if (selected) {
              handleSelectItem(selected);
            }
          } else {
            void handleCreateNew();
          }
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          setLinkState(null);
          return;
        }
      }

      if (event.key === 'Escape' && slashState?.blockId === block.id) {
        event.preventDefault();
        setSlashState(null);
        return;
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        const currentType = isBlockType(block.type) ? block.type : 'paragraph';
        if (
          currentType === 'bullet' ||
          currentType === 'numbered' ||
          currentType === 'checklist'
        ) {
          event.preventDefault();
          insertBlockAfter(index, currentType);
          return;
        }
        event.preventDefault();
        insertBlockAfter(index);
        return;
      }

      if (event.key === 'Backspace' && text.length === 0 && index > 0) {
        event.preventDefault();
        const previousId = blocks[index - 1].id;
        removeBlockAt(index);
        setFocusTarget({ id: previousId, position: 'end' });
        return;
      }

      if (event.key === 'ArrowUp' && index > 0) {
        const target = event.target as HTMLTextAreaElement;
        const caret = 'selectionStart' in target ? target.selectionStart ?? 0 : 0;
        if (!('selectionStart' in target) || caret === 0) {
          event.preventDefault();
          setFocusTarget({ id: blocks[index - 1].id, position: 'end' });
        }
      }

      if (event.key === 'ArrowDown' && index < blocks.length - 1) {
        const target = event.target as HTMLTextAreaElement;
        const valueLength =
          'value' in target ? String((target as HTMLTextAreaElement).value ?? '').length : 0;
        const caret = 'selectionEnd' in target ? target.selectionEnd ?? valueLength : valueLength;
        if (!('selectionEnd' in target) || caret === valueLength) {
          event.preventDefault();
          setFocusTarget({ id: blocks[index + 1].id, position: 'start' });
        }
      }
    },
    [
      blocks,
      handleCreateNew,
      handleSelectItem,
      insertBlockAfter,
      linkResults,
      linkState,
      removeBlockAt,
      slashState,
    ],
  );

  const handleBlockChange = React.useCallback(
    (
      blockId: string,
      patch: Partial<Block>,
      meta?: { selectionStart?: number; selectionEnd?: number },
    ) => {
      const current = blocksRef.current.find((block) => block.id === blockId);
      const nextPatch: Partial<Block> = { ...patch };
      if (typeof patch.checked === 'boolean' && !('doneAt' in patch)) {
        nextPatch.doneAt = patch.checked ? Date.now() : null;
      }
      if (
        current?.taskId &&
        typeof patch.checked === 'boolean' &&
        onChecklistToggleTask
      ) {
        onChecklistToggleTask(current.taskId, patch.checked);
      }
      if (typeof nextPatch.text === 'string') {
        const currentType = isBlockType(current?.type) ? current?.type : 'paragraph';
        const shortcutMatch =
          currentType === 'paragraph' ? getShortcutMatch(nextPatch.text) : null;

        if (current && shortcutMatch) {
          if (slashState?.blockId === blockId) {
            setSlashState(null);
          }
          if (linkState?.blockId === blockId) {
            setLinkState(null);
            setLinkResults([]);
          }
          let nextFocus: FocusTarget | null = null;
          let insertedBlockId: string | null = null;

          updateBlocks((prev) => {
            const index = prev.findIndex((block) => block.id === blockId);
            if (index === -1) {
              return prev;
            }
            const target = prev[index];
            const nextType = shortcutMatch.type;
            const nextText = shortcutMatch.text;
            const nextBlock: Block = {
              ...target,
              type: nextType,
              text: nextType === 'divider' ? '' : nextText,
            };

            if (nextType === 'checklist') {
              nextBlock.checked = shortcutMatch.checked ?? target.checked ?? false;
              if (!nextBlock.createdAt) {
                nextBlock.createdAt = Date.now();
              }
            } else {
              nextBlock.checked = undefined;
              nextBlock.due = undefined;
              nextBlock.doneAt = undefined;
              nextBlock.priority = undefined;
              nextBlock.tags = undefined;
              nextBlock.createdAt = undefined;
              nextBlock.taskId = undefined;
              nextBlock.meta = undefined;
            }

            if (nextType === 'code') {
              nextBlock.language = target.language;
            } else {
              nextBlock.language = undefined;
            }

            const next = [...prev];
            next[index] = nextBlock;

            if (nextType === 'divider' && index === prev.length - 1) {
              const newBlock = createEmptyBlock();
              insertedBlockId = newBlock.id;
              next.push(newBlock);
            }

            if (nextType === 'divider') {
              const targetId =
                index < prev.length - 1 ? prev[index + 1].id : insertedBlockId ?? target.id;
              nextFocus = { id: targetId, position: 'start' };
            } else {
              nextFocus = { id: target.id, position: 'end' };
            }

            return next;
          }, 'structural');

          if (nextFocus) {
            setFocusTarget(nextFocus);
          }
          return;
        }

        updateSlashState(blockId, nextPatch.text);
        updateLinkState(blockId, nextPatch.text, meta);
      }

      const mode: 'typing' | 'structural' =
        typeof nextPatch.text === 'string' ? 'typing' : 'structural';

      updateBlocks(
        (prev) =>
          prev.map((block) => (block.id === blockId ? { ...block, ...nextPatch } : block)),
        mode,
      );
    },
    [
      linkState,
      onChecklistToggleTask,
      slashState,
      updateBlocks,
      updateLinkState,
      updateSlashState,
    ],
  );

  const handleToggleCollapse = React.useCallback(
    (blockId: string) => {
      updateBlocks(
        (prev) =>
          prev.map((block) => {
            if (block.id !== blockId) {
              return block;
            }
            const type = isBlockType(block.type) ? block.type : 'paragraph';
            if (getHeadingLevel(type) === 0) {
              return block;
            }
            return { ...block, collapsed: !block.collapsed };
          }),
        'structural',
      );
    },
    [updateBlocks],
  );

  const handleBlockPaste = React.useCallback(
    (event: React.ClipboardEvent, blockId: string) => {
      const text = event.clipboardData?.getData('text/plain') ?? '';
      if (!text.trim()) {
        return;
      }
      const parsed = parseMarkdownToBlocks(text);
      if (parsed.length === 0) {
        return;
      }

      const hasNewline = text.includes('\n') || text.includes('\r');
      if (!hasNewline || parsed.length === 1) {
        return;
      }

      const current = blocksRef.current.find((block) => block.id === blockId);
      const currentType = isBlockType(current?.type) ? current?.type : 'paragraph';
      if (!current || !isTextualBlock(currentType)) {
        return;
      }

      event.preventDefault();
      if (slashState) {
        setSlashState(null);
      }
      if (linkState) {
        setLinkState(null);
        setLinkResults([]);
      }

      const target = event.target as HTMLTextAreaElement | HTMLInputElement;
      const selectionStart =
        'selectionStart' in target && typeof target.selectionStart === 'number'
          ? target.selectionStart
          : (current.text ?? '').length;
      const selectionEnd =
        'selectionEnd' in target && typeof target.selectionEnd === 'number'
          ? target.selectionEnd
          : selectionStart;
      const currentText = current.text ?? '';
      const before = currentText.slice(0, selectionStart);
      const after = currentText.slice(selectionEnd);

      const parsedWithIds = parsed.map((block) => ({ ...block, id: uuidv4() }));

      let nextFocus: FocusTarget | null = null;
      updateBlocks((prev) => {
        const index = prev.findIndex((block) => block.id === blockId);
        if (index === -1) {
          return prev;
        }

        const nextBlocks: Block[] = [];

        if (before) {
          nextBlocks.push({ ...current, text: before });
        } else {
          const first = parsedWithIds.shift();
          if (first) {
            nextBlocks.push({ ...first, id: current.id });
          }
        }

        if (parsedWithIds.length > 0) {
          nextBlocks.push(...parsedWithIds);
        }

        let afterBlockId: string | null = null;
        if (after) {
          const afterBlock = createBlockWithType(currentType);
          afterBlock.text = after;
          afterBlockId = afterBlock.id;
          nextBlocks.push(afterBlock);
        }

        if (afterBlockId) {
          nextFocus = { id: afterBlockId, position: 'start' };
        } else {
          const last = nextBlocks[nextBlocks.length - 1];
          if (last) {
            nextFocus = { id: last.id, position: 'end' };
          }
        }

        const next = [...prev];
        next.splice(index, 1, ...nextBlocks);
        return next;
      }, 'structural');

      if (nextFocus) {
        setFocusTarget(nextFocus);
      }
    },
    [linkState, slashState, updateBlocks],
  );

  const handleBlockFocus = React.useCallback(
    (block: Block) => {
      lastFocusedIdRef.current = block.id;
      onFocusBlock?.(block.id);
      if (selectedBlockIds.length > 0) {
        setSelectedBlockIds([]);
        selectionAnchorRef.current = null;
      }
      const text = block.text ?? '';
      if (text.startsWith('/')) {
        updateSlashState(block.id, text);
      } else if (slashState) {
        setSlashState(null);
      }

      if (linkState && linkState.blockId !== block.id) {
        setLinkState(null);
      }
    },
    [onFocusBlock, updateSlashState, slashState, linkState, selectedBlockIds.length],
  );

  const handleBlockBlur = React.useCallback(
    (blockId: string) => {
      if (rawEditBlockId === blockId) {
        setRawEditBlockId(null);
      }
      onBlur?.();
    },
    [onBlur, rawEditBlockId],
  );

  const handleRequestRawEdit = React.useCallback(
    (blockId: string, selection?: { start: number; end: number }) => {
      setRawEditBlockId(blockId);
      if (selection) {
        setFocusTarget({
          id: blockId,
          selectionStart: selection.start,
          selectionEnd: selection.end,
        });
      } else {
        setFocusTarget({ id: blockId, position: 'end' });
      }
    },
    [],
  );

  const handleSlashSelect = React.useCallback(
    (type: BlockType) => {
      if (!slashState) {
        return;
      }

      let nextFocus: FocusTarget | null = null;
      let insertedBlockId: string | null = null;

      updateBlocks((prev) => {
        const index = prev.findIndex((block) => block.id === slashState.blockId);
        if (index === -1) {
          return prev;
        }
        const current = prev[index];
        const text = current.text ?? '';
        const parsed = parseSlashCommand(text);
        const remainder = parsed?.remainder ?? '';
        const nextType = isBlockType(type) ? type : 'paragraph';

        const nextBlock: Block = {
          ...current,
          type: nextType,
          text: nextType === 'divider' ? '' : remainder,
        };

        if (nextType === 'checklist') {
          nextBlock.checked = current.checked ?? false;
          if (!nextBlock.createdAt) {
            nextBlock.createdAt = Date.now();
          }
        } else {
          nextBlock.checked = undefined;
          nextBlock.due = undefined;
          nextBlock.doneAt = undefined;
          nextBlock.priority = undefined;
          nextBlock.tags = undefined;
          nextBlock.createdAt = undefined;
          nextBlock.taskId = undefined;
          nextBlock.meta = undefined;
        }

        if (nextType === 'code') {
          nextBlock.language = current.language;
        } else {
          nextBlock.language = undefined;
        }

        const next = [...prev];
        next[index] = nextBlock;

        if (nextType === 'divider' && index === prev.length - 1) {
          const newBlock = createEmptyBlock();
          insertedBlockId = newBlock.id;
          next.push(newBlock);
        }

        if (nextType === 'divider') {
          const targetId =
            index < prev.length - 1 ? prev[index + 1].id : insertedBlockId ?? current.id;
          nextFocus = { id: targetId, position: 'start' };
        } else {
          nextFocus = { id: current.id, position: 'end' };
        }

        return next;
      }, 'structural');

      if (nextFocus) {
        setFocusTarget(nextFocus);
      }
      setSlashState(null);
    },
    [slashState, updateBlocks],
  );

  const setBlockRef = React.useCallback(
    (id: string) => (element: HTMLElement | null) => {
      blockRefs.current[id] = element;
    },
    [],
  );

  const activeAnchor = slashState
    ? blockRefs.current[slashState.blockId] ?? slashState.anchorEl
    : null;
  const slashQuery = slashState?.query ?? '';

  const linkAnchor = linkState
    ? blockRefs.current[linkState.blockId] ?? linkState.anchorEl
    : null;
  const linkQuery = linkState?.query ?? '';
  const highlightedIndex = linkState?.highlightedIndex ?? 0;

  return (
    <>
      <Stack spacing={2} ref={containerRef}>
        {(() => {
          let numberedCounter = 0;
          return visibleBlocks.map(({ block, index }) => {
            const showDropIndicator =
              Boolean(draggingId && overId === block.id && dropPosition);
            const indicatorPosition = dropPosition === 'above' ? 'top' : 'bottom';
            const blockType = isBlockType(block.type) ? block.type : 'paragraph';
            if (blockType === 'numbered') {
              numberedCounter += 1;
            } else {
              numberedCounter = 0;
            }
            const listNumber = blockType === 'numbered' ? numberedCounter : undefined;
            const isSelected = selectedIdSet.has(block.id);
            const hasChildren = Boolean(headingHasChildren[block.id]);

            return (
              <Box
                key={block.id}
                onDragOver={(event) => handleDragOver(event, block.id)}
                onDrop={(event) => handleDrop(event, block.id)}
                onMouseDown={(event) => handleSelectionStart(event, block.id)}
                data-block-id={block.id}
                sx={{
                  position: 'relative',
                  borderRadius: 1,
                  bgcolor: isSelected ? 'action.selected' : 'transparent',
                  outline: isSelected ? '2px solid' : 'none',
                  outlineColor: isSelected ? 'primary.main' : 'transparent',
                  outlineOffset: 2,
                }}
              >
                {showDropIndicator && (
                  <Box
                    sx={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      height: 2,
                      bgcolor: 'primary.main',
                      borderRadius: 1,
                      [indicatorPosition]: -1,
                    }}
                  />
                )}
                <BlockEditor
                  block={{
                    ...block,
                    type: isBlockType(block.type) ? block.type : 'paragraph',
                    text: block.text ?? '',
                  }}
                  listNumber={listNumber}
                  onChange={(patch, meta) => handleBlockChange(block.id, patch, meta)}
                  onKeyDown={(event) => handleBlockKeyDown(event, index, block)}
                  onPaste={(event) => handleBlockPaste(event, block.id)}
                  onFocus={() => handleBlockFocus(block)}
                  onBlur={() => handleBlockBlur(block.id)}
                  inputRef={setBlockRef(block.id)}
                  onLinkClick={onLinkClick}
                  onRequestRawEdit={handleRequestRawEdit}
                  isRaw={rawEditBlockId === block.id}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  showPromoteChecklist={block.type === 'checklist' && !block.taskId}
                  onPromoteChecklist={
                    block.type === 'checklist' && !block.taskId && onPromoteChecklist
                      ? () => onPromoteChecklist(block.id, block.text ?? '')
                      : undefined
                  }
                  onToggleCollapse={
                    hasChildren ? () => handleToggleCollapse(block.id) : undefined
                  }
                  isCollapsed={Boolean(block.collapsed)}
                  hasChildren={hasChildren}
                />
              </Box>
            );
          });
        })()}
      </Stack>
      <SlashMenu
        open={Boolean(slashState && activeAnchor)}
        anchorEl={activeAnchor ?? null}
        query={slashQuery}
        onClose={() => setSlashState(null)}
        onSelect={handleSlashSelect}
      />
      <WikilinkAutocomplete
        open={Boolean(linkState && linkAnchor)}
        anchorEl={linkAnchor ?? null}
        query={linkQuery}
        results={linkResults}
        highlightedIndex={highlightedIndex}
        onSelect={handleSelectItem}
        onCreateNew={(title) => void handleCreateNew(title)}
        onClose={() => setLinkState(null)}
      />
    </>
  );
}
