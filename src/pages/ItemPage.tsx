import React from 'react';
import { Edit, ExpandMore, Visibility } from '@mui/icons-material';
import {
  Breadcrumbs,
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  IconButton,
  Link,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { useDebouncedCallback } from '../app/useDebouncedCallback';
import { upgradeLegacyLinksInText } from '../app/upgradeLinks';
import type { ParsedWikilink } from '../app/wikilinks';
import {
  isExternalLinkTarget,
  parseWikilinks,
  splitTitleAndAnchor,
} from '../app/wikilinks';
import LoadingState from '../components/LoadingState';
import MoveToDialog from '../components/dialogs/MoveToDialog';
import RenameDialog from '../components/dialogs/RenameDialog';
import SnapshotsDialog from '../components/dialogs/SnapshotsDialog';
import Editor from '../components/editor/Editor';
import { useEditorHistory } from '../components/editor/useEditorHistory';
import { useNotifier } from '../components/Notifier';
import ConfirmDialog from '../components/ConfirmDialog';
import { useItem } from '../data/hooks';
import { filterActiveNodes } from '../data/deleted';
import {
  createNote,
  getItem,
  getItemsByIds,
  moveNode,
  recomputeLinksToFromBlocks,
  renameNode,
  resolveTitleToId,
  updateItemContent,
  updateItemProps,
} from '../data/repo';
import type { Block, BlockType, Node as DataNode, NodeType } from '../data/types';
import { db } from '../data/db';
import { useLiveQuery } from 'dexie-react-hooks';
import FolderPage from './FolderPage';
import { getPath } from '../vault/path';

const TYPE_LABELS: Record<NodeType, string> = {
  note: 'Nota',
  folder: 'Pasta',
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

const isBlockType = (value: string | undefined): value is BlockType =>
  !!value && BLOCK_TYPES.includes(value as BlockType);

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

const normalizeTaskMeta = (value: Block['meta'] | undefined): Block['meta'] | undefined => {
  const meta = value && typeof value === 'object' ? value : undefined;
  const rawRecurrence = meta?.recurrence;
  const recurrence =
    rawRecurrence === 'weekly' || rawRecurrence === 'monthly'
      ? rawRecurrence
      : undefined;

  if (!recurrence) {
    return undefined;
  }

  return { recurrence };
};

const makeBlock = (text = ''): Block => ({
  id: uuidv4(),
  type: 'paragraph',
  text,
});

const normalizeExternalTarget = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.toLowerCase().startsWith('www.')) {
    return `https://${trimmed}`;
  }
  return trimmed;
};

const findHeadingBlockId = (node: DataNode | undefined, anchor?: string) => {
  if (!node || node.nodeType !== 'note' || !anchor) {
    return undefined;
  }
  const normalized = anchor.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  const content = Array.isArray(node.content) ? node.content : [];
  const heading = content.find(
    (block) =>
      (block.type === 'h1' || block.type === 'h2' || block.type === 'h3') &&
      (block.text ?? '').trim().toLowerCase() === normalized,
  );
  return heading?.id;
};

const normalizeBlock = (block: Block): Block => {
  const type = isBlockType(block.type) ? block.type : 'paragraph';
  const normalized: Block = {
    ...block,
    type,
    text: block.text ?? '',
    collapsed:
      typeof (block as { collapsed?: unknown }).collapsed === 'boolean'
        ? (block as { collapsed?: boolean }).collapsed
        : undefined,
  };

  if (type === 'divider') {
    normalized.text = '';
    normalized.checked = undefined;
    normalized.language = undefined;
    normalized.taskId = undefined;
    normalized.due = undefined;
    normalized.snoozedUntil = undefined;
    normalized.originalDue = undefined;
    normalized.doneAt = undefined;
    normalized.priority = undefined;
    normalized.tags = undefined;
    normalized.createdAt = undefined;
    normalized.meta = undefined;
    return normalized;
  }

  if (type === 'checklist') {
    normalized.checked = normalized.checked ?? false;
    normalized.meta = normalizeTaskMeta(normalized.meta);
    normalized.snoozedUntil = normalized.snoozedUntil ?? null;
    normalized.originalDue = normalized.originalDue ?? null;
  } else {
    normalized.checked = undefined;
    normalized.taskId = undefined;
    normalized.due = undefined;
    normalized.snoozedUntil = undefined;
    normalized.originalDue = undefined;
    normalized.doneAt = undefined;
    normalized.priority = undefined;
    normalized.tags = undefined;
    normalized.createdAt = undefined;
    normalized.meta = undefined;
  }

  if (type !== 'code') {
    normalized.language = undefined;
  }

  return normalized;
};

const cloneBlocks = (value: Block[]) => value.map((block) => ({ ...block }));

const areBlocksEqual = (left: Block[], right: Block[]) => {
  if (left.length !== right.length) {
    return false;
  }
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i];
    const b = right[i];
      if (
        a.id !== b.id ||
        a.type !== b.type ||
        (a.text ?? '') !== (b.text ?? '') ||
        (a.checked ?? false) !== (b.checked ?? false) ||
        (a.language ?? '') !== (b.language ?? '') ||
        (a.taskId ?? '') !== (b.taskId ?? '') ||
        (a.collapsed ?? false) !== (b.collapsed ?? false) ||
          (a.meta?.recurrence ?? '') !== (b.meta?.recurrence ?? '')
        ) {
          return false;
        }
  }
  return true;
};

export default function ItemPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const notifier = useNotifier();
  const itemId = id ?? '';
  const liveItem = useItem(itemId);
  const allNodes = useLiveQuery(() => db.items.toArray(), []) ?? [];
  const nodes = React.useMemo(() => filterActiveNodes(allNodes), [allNodes]);
  const nodesById = React.useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );
  const breadcrumbNodes = React.useMemo(
    () => (itemId ? getPath(itemId, nodesById) : []),
    [itemId, nodesById],
  );
  const locationState = location.state as
    | { focusEditor?: boolean; highlightBlockId?: string }
    | null;

  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);
  const [nodeType, setNodeType] = React.useState<NodeType | null>(null);
  const emptySnapshot = React.useMemo(
    () => ({ title: '', blocks: [makeBlock('')] }),
    [],
  );
  const history = useEditorHistory(emptySnapshot);
  const {
    present,
    setPresent,
    commitTyping,
    undo,
    redo,
    reset,
  } = history;
  const presentTitle = present.title;
  const presentBlocks = present.blocks;
  const [isPreview, setIsPreview] = React.useState(false);
  const { hiddenIds: previewHiddenIds, headingHasChildren: previewHeadingHasChildren } =
    React.useMemo(() => computeHeadingState(presentBlocks), [presentBlocks]);
  const visiblePreviewBlocks = React.useMemo(
    () =>
      presentBlocks
        .map((block, index) => ({ block, index }))
        .filter(({ block }) => !previewHiddenIds.has(block.id)),
    [presentBlocks, previewHiddenIds],
  );
  const [linkItemsById, setLinkItemsById] = React.useState<Record<string, DataNode>>({});
  const [titleResolutions, setTitleResolutions] = React.useState<
    Record<string, { status: 'ok' | 'ambiguous' | 'not_found'; id?: string }>
  >({});
  const resolvedType = liveItem?.nodeType ?? nodeType;

  const [isDirty, setIsDirty] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = React.useState<number | null>(null);
  const [moveOpen, setMoveOpen] = React.useState(false);
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [snapshotsOpen, setSnapshotsOpen] = React.useState(false);
  const [pendingLinkTitle, setPendingLinkTitle] = React.useState<string | null>(null);
  const [creatingLink, setCreatingLink] = React.useState(false);

  const skipAutosaveRef = React.useRef(true);
  const changeCounterRef = React.useRef(0);
  const lastSavedRef = React.useRef<{ title: string; blocks: Block[] } | null>(null);
  const lastSaveErrorAtRef = React.useRef(0);

  const draftTitleRef = React.useRef(presentTitle);
  const blocksRef = React.useRef(presentBlocks);

  const [lastFocusedBlockId, setLastFocusedBlockId] = React.useState<string | null>(null);
  const [focusRequest, setFocusRequest] = React.useState<{
    id: string;
    position?: 'start' | 'end';
    nonce: number;
  } | null>(null);
  const focusNonceRef = React.useRef(0);
  const editorContainerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    draftTitleRef.current = presentTitle;
  }, [presentTitle]);

  React.useEffect(() => {
    blocksRef.current = presentBlocks;
  }, [presentBlocks]);

  const linkTargets = React.useMemo(() => {
    const ids = new Set<string>();
    const titles = new Set<string>();

    for (const block of presentBlocks) {
      const links = parseWikilinks(block.text ?? '');
      for (const link of links) {
        if (link.kind === 'id' && link.id) {
          const { title: id } = splitTitleAndAnchor(link.id);
          if (id) {
            ids.add(id);
          }
        }
        if (link.kind === 'title' && link.title) {
          const { title } = splitTitleAndAnchor(link.title);
          if (title) {
            titles.add(title);
          }
        }
        if (link.kind === 'target' && link.target) {
          const target = link.target.trim();
          if (!target) {
            continue;
          }
          if (target.toLowerCase().startsWith('id:')) {
            const rawId = target.slice(3).trim();
            const { title: id } = splitTitleAndAnchor(rawId);
            if (id) {
              ids.add(id);
            }
            continue;
          }
          if (isExternalLinkTarget(target)) {
            continue;
          }
          const { title } = splitTitleAndAnchor(target);
          if (title) {
            titles.add(title);
          }
        }
      }
    }

    return { ids: Array.from(ids), titles: Array.from(titles) };
  }, [presentBlocks]);

  const linkTargetsKey = `${linkTargets.ids.join('|')}::${linkTargets.titles.join('|')}`;

  React.useEffect(() => {
    let active = true;

    const run = async () => {
      const resolutions: Record<
        string,
        { status: 'ok' | 'ambiguous' | 'not_found'; id?: string }
      > = {};

      for (const title of linkTargets.titles) {
        resolutions[title] = await resolveTitleToId(title);
      }

      const ids = new Set<string>(linkTargets.ids);
      Object.values(resolutions).forEach((entry) => {
        if (entry.status === 'ok' && entry.id) {
          ids.add(entry.id);
        }
      });

      const items = await getItemsByIds(Array.from(ids));
      const byId: Record<string, DataNode> = {};
      items.forEach((item) => {
        byId[item.id] = item;
      });

      if (active) {
        setTitleResolutions(resolutions);
        setLinkItemsById(byId);
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [linkTargetsKey]);

  const saveDraft = React.useCallback(
    async (changeId: number) => {
      if (!itemId) {
        return;
      }

      setIsSaving(true);
      setSaveError(null);

      try {
        const linksTo = await recomputeLinksToFromBlocks(blocksRef.current);
        const patch = {
          title: draftTitleRef.current,
          content: blocksRef.current,
          linksTo,
        };
        await updateItemContent(itemId, patch);
        if (changeId === changeCounterRef.current) {
          lastSavedRef.current = {
            title: draftTitleRef.current,
            blocks: cloneBlocks(blocksRef.current),
          };
          setIsDirty(false);
          setIsSaving(false);
          setLastSavedAt(Date.now());
          setSaveError(null);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const now = Date.now();
        if (now - lastSaveErrorAtRef.current > 10000) {
          lastSaveErrorAtRef.current = now;
          notifier.error(`Erro ao salvar: ${message}`);
        }
        setSaveError('Erro ao salvar');
        setIsSaving(false);
      }
    },
    [itemId, notifier],
  );

  const { debounced: debouncedSave, cancel: cancelDebouncedSave } = useDebouncedCallback(
    saveDraft,
    600,
  );

  React.useEffect(() => cancelDebouncedSave, [cancelDebouncedSave]);

  const flushSave = React.useCallback(() => {
    if (!itemId) {
      return;
    }
    const changeId = changeCounterRef.current;
    cancelDebouncedSave();
    void saveDraft(changeId);
  }, [cancelDebouncedSave, saveDraft, itemId]);

  React.useEffect(() => {
    if (!itemId) {
      setLoading(false);
      setNotFound(true);
      return;
    }

    let active = true;
    skipAutosaveRef.current = true;
    setLoading(true);
    setNotFound(false);

    getItem(itemId)
      .then((result) => {
        if (!active) {
          return;
        }
        if (!result) {
          setNotFound(true);
          return;
        }

        setNodeType(result.nodeType);
        if (result.nodeType === 'folder') {
          setIsDirty(false);
          setIsSaving(false);
          setSaveError(null);
          setLastSavedAt(result.updatedAt);
          return;
        }

        const rawContent = Array.isArray(result.content) ? result.content : [];
        const content = rawContent.length > 0 ? rawContent : [makeBlock('')];
        const normalized = content.map(normalizeBlock);
        reset({
          title: result.title ?? '',
          blocks: normalized,
        });
        const highlightBlockId = locationState?.highlightBlockId;
        const focusEditor = locationState?.focusEditor;
        const focusTarget =
          (highlightBlockId &&
            normalized.find((block) => block.id === highlightBlockId)?.id) ||
          (focusEditor ? normalized[0]?.id : null);

        setLastFocusedBlockId(focusTarget ?? normalized[0]?.id ?? null);
        if (focusTarget) {
          focusNonceRef.current += 1;
          setFocusRequest({
            id: focusTarget,
            position: 'end',
            nonce: focusNonceRef.current,
          });
        }
        lastSavedRef.current = {
          title: result.title ?? '',
          blocks: cloneBlocks(normalized),
        };
        setIsDirty(false);
        setIsSaving(false);
        setSaveError(null);
        setLastSavedAt(result.updatedAt);
      })
      .catch(() => {
        if (active) {
          setNotFound(true);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [itemId, locationState?.focusEditor, locationState?.highlightBlockId, reset]);

  React.useEffect(() => {
    if (loading || notFound || resolvedType !== 'note') {
      return;
    }
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false;
      return;
    }

    if (
      lastSavedRef.current &&
      lastSavedRef.current.title === presentTitle &&
      areBlocksEqual(lastSavedRef.current.blocks, presentBlocks)
    ) {
      cancelDebouncedSave();
      setIsDirty(false);
      setIsSaving(false);
      return;
    }

    changeCounterRef.current += 1;
    setIsDirty(true);
    setIsSaving(true);
    debouncedSave(changeCounterRef.current);
  }, [
    presentTitle,
    presentBlocks,
    cancelDebouncedSave,
    debouncedSave,
    loading,
    notFound,
    resolvedType,
  ]);

  const handleTitleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setPresent(
      { title: event.target.value, blocks: blocksRef.current },
      'typing',
    );
  };

  const handleBlocksChangeTyping = React.useCallback(
    (nextBlocks: Block[]) => {
      setPresent({ title: draftTitleRef.current, blocks: nextBlocks }, 'typing');
    },
    [setPresent],
  );

  const handleBlocksChangeStructural = React.useCallback(
    (nextBlocks: Block[]) => {
      setPresent({ title: draftTitleRef.current, blocks: nextBlocks }, 'structural');
    },
    [setPresent],
  );

  const handleToggleHeadingCollapse = React.useCallback(
    (blockId: string) => {
      setPresent(
        {
          title: draftTitleRef.current,
          blocks: blocksRef.current.map((block) => {
            if (block.id !== blockId) {
              return block;
            }
            const type = isBlockType(block.type) ? block.type : 'paragraph';
            if (getHeadingLevel(type) === 0) {
              return block;
            }
            return { ...block, collapsed: !block.collapsed };
          }),
        },
        'structural',
      );
    },
    [setPresent],
  );

  const upgradeLegacyLinks = React.useCallback(async () => {
    const currentBlocks = blocksRef.current;
    let changed = false;
    const nextBlocks: Block[] = [];

    for (const block of currentBlocks) {
      if (!block.text) {
        nextBlocks.push(block);
        continue;
      }
      const result = await upgradeLegacyLinksInText(block.text, resolveTitleToId);
      if (result.changed) {
        changed = true;
        nextBlocks.push({ ...block, text: result.text });
      } else {
        nextBlocks.push(block);
      }
    }

    if (changed) {
      setPresent({ title: draftTitleRef.current, blocks: nextBlocks }, 'structural');
    }

    return { changed };
  }, [setPresent, resolveTitleToId]);

  const handleCommitTyping = React.useCallback(() => {
    commitTyping();
    void (async () => {
      const result = await upgradeLegacyLinks();
      if (!result.changed) {
        flushSave();
      }
    })();
  }, [commitTyping, flushSave, upgradeLegacyLinks]);

  const handleTogglePreview = React.useCallback(() => {
    if (!isPreview) {
      void upgradeLegacyLinks();
    }
    setIsPreview((prev) => !prev);
  }, [isPreview, upgradeLegacyLinks]);

  const requestFocus = React.useCallback(
    (blocksSnapshot: Block[]) => {
      const targetId =
        (lastFocusedBlockId &&
          blocksSnapshot.some((block) => block.id === lastFocusedBlockId) &&
          lastFocusedBlockId) ||
        blocksSnapshot[0]?.id;
      if (!targetId) {
        return;
      }
      focusNonceRef.current += 1;
      setFocusRequest({
        id: targetId,
        position: 'end',
        nonce: focusNonceRef.current,
      });
    },
    [lastFocusedBlockId],
  );

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isModifier = event.ctrlKey || event.metaKey;
      if (!isModifier) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key !== 'z' && key !== 'y') {
        return;
      }

      const target = event.target as Node | null;
      if (!target || !editorContainerRef.current?.contains(target)) {
        return;
      }

      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        const snapshot = undo();
        if (snapshot) {
          requestFocus(snapshot.blocks);
        }
        return;
      }

      if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault();
        const snapshot = redo();
        if (snapshot) {
          requestFocus(snapshot.blocks);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [redo, requestFocus, undo]);

  const handleRequestCreateLink = React.useCallback((title: string) => {
    if (!title.trim()) {
      return;
    }
    setPendingLinkTitle(title.trim());
  }, []);

  const handleOpenLinkFromEditor = React.useCallback(
    async (link: ParsedWikilink) => {
      if (link.kind === 'id' && link.id) {
        const { title: id, anchor } = splitTitleAndAnchor(link.id);
        if (!id) {
          return;
        }
        const target = nodesById.get(id);
        const headingId = findHeadingBlockId(target, anchor);
        navigate(`/item/${id}`, {
          state: headingId ? { highlightBlockId: headingId } : undefined,
        });
        return;
      }

      if (link.kind === 'title' && link.title) {
        const { title, anchor } = splitTitleAndAnchor(link.title);
        if (!title) {
          return;
        }
        const resolution = await resolveTitleToId(title);
        if (resolution.status === 'ok') {
          const target = nodesById.get(resolution.id);
          const headingId = findHeadingBlockId(target, anchor);
          navigate(`/item/${resolution.id}`, {
            state: headingId ? { highlightBlockId: headingId } : undefined,
          });
          return;
        }
        if (resolution.status === 'ambiguous') {
          notifier.info('Link ambiguo. Renomeie para abrir o item correto.');
          return;
        }
        handleRequestCreateLink(title);
        return;
      }

      if (link.kind === 'target' && link.target) {
        const rawTarget = link.target.trim();
        if (!rawTarget) {
          return;
        }
        if (isExternalLinkTarget(rawTarget)) {
          const href = normalizeExternalTarget(rawTarget);
          if (href) {
            window.open(href, '_blank', 'noopener,noreferrer');
          }
          return;
        }
        if (rawTarget.toLowerCase().startsWith('id:')) {
          const rawId = rawTarget.slice(3).trim();
          const { title: id, anchor } = splitTitleAndAnchor(rawId);
          if (!id) {
            return;
          }
          const target = nodesById.get(id);
          const headingId = findHeadingBlockId(target, anchor);
          navigate(`/item/${id}`, {
            state: headingId ? { highlightBlockId: headingId } : undefined,
          });
          return;
        }
        const { title, anchor } = splitTitleAndAnchor(rawTarget);
        if (!title) {
          return;
        }
        const resolution = await resolveTitleToId(title);
        if (resolution.status === 'ok') {
          const target = nodesById.get(resolution.id);
          const headingId = findHeadingBlockId(target, anchor);
          navigate(`/item/${resolution.id}`, {
            state: headingId ? { highlightBlockId: headingId } : undefined,
          });
          return;
        }
        if (resolution.status === 'ambiguous') {
          notifier.info('Link ambiguo. Renomeie para abrir o item correto.');
          return;
        }
        handleRequestCreateLink(title);
      }
    },
    [handleRequestCreateLink, navigate, nodesById, notifier],
  );

  const renderTextWithLinks = React.useCallback(
    (text: string) => {
      if (!text) {
        return text;
      }
      const links = parseWikilinks(text);
      if (links.length === 0) {
        return text;
      }

      const nodes: React.ReactNode[] = [];
      let lastIndex = 0;

      links.forEach((link, index) => {
        if (link.start > lastIndex) {
          nodes.push(text.slice(lastIndex, link.start));
        }

        if (link.kind === 'id' && link.id) {
          const { title: id, anchor } = splitTitleAndAnchor(link.id);
          if (!id) {
            nodes.push(link.raw);
            lastIndex = link.end;
            return;
          }
          const target = linkItemsById[id];
          const label = target?.title || link.display || id;
          const headingId = findHeadingBlockId(target, anchor);
          nodes.push(
            <Link
              key={`${id}-${index}`}
              component="button"
              underline="always"
              onClick={() =>
                navigate(`/item/${id}`, {
                  state: headingId ? { highlightBlockId: headingId } : undefined,
                })
              }
              sx={{ mx: 0.5 }}
            >
              {label}
            </Link>,
          );
        } else if (link.kind === 'title' && link.title) {
          const { title, anchor } = splitTitleAndAnchor(link.title);
          if (!title) {
            nodes.push(link.raw);
            lastIndex = link.end;
            return;
          }
          const resolution = titleResolutions[title];
          if (resolution?.status === 'ok' && resolution.id) {
            const target = linkItemsById[resolution.id];
            const label = target?.title
              ? anchor
                ? `${target.title}#${anchor}`
                : target.title
              : link.title;
            const headingId = findHeadingBlockId(target, anchor);
            nodes.push(
              <Link
                key={`${link.title}-${index}`}
                component="button"
                underline="always"
                onClick={() =>
                  navigate(`/item/${resolution.id}`, {
                    state: headingId ? { highlightBlockId: headingId } : undefined,
                  })
                }
                sx={{ mx: 0.5 }}
              >
                {label}
              </Link>,
            );
          } else if (resolution?.status === 'ambiguous') {
            nodes.push(
              <Box
                key={`${link.title}-${index}`}
                component="span"
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mx: 0.5 }}
              >
                <span>{link.title}</span>
                <Chip size="small" label="Ambiguo" variant="outlined" />
              </Box>,
            );
          } else {
            const linkTitle = title;
            if (!linkTitle) {
              nodes.push(link.raw);
            } else {
              nodes.push(
                <Link
                  key={`${linkTitle}-${index}`}
                  component="button"
                  underline="always"
                  onClick={() => handleRequestCreateLink(linkTitle)}
                  sx={{ mx: 0.5 }}
                >
                  {anchor ? `${linkTitle}#${anchor}` : linkTitle}
                </Link>,
              );
            }
          }
        } else if (link.kind === 'target' && link.target) {
          const targetValue = link.target.trim();
          const label = link.display || targetValue;
          if (!targetValue) {
            nodes.push(link.raw);
          } else if (isExternalLinkTarget(targetValue)) {
            const href = normalizeExternalTarget(targetValue);
            nodes.push(
              <Link
                key={`${targetValue}-${index}`}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                underline="always"
                sx={{ mx: 0.5 }}
              >
                {label}
              </Link>,
            );
          } else if (targetValue.toLowerCase().startsWith('id:')) {
            const rawId = targetValue.slice(3).trim();
            const { title: id, anchor } = splitTitleAndAnchor(rawId);
            if (!id) {
              nodes.push(link.raw);
            } else {
              const target = linkItemsById[id];
              const resolvedLabel = link.display
                ? label
                : target?.title
                  ? anchor
                    ? `${target.title}#${anchor}`
                    : target.title
                  : label || id;
              const headingId = findHeadingBlockId(target, anchor);
              nodes.push(
                <Link
                  key={`${id}-${index}`}
                  component="button"
                  underline="always"
                  onClick={() =>
                    navigate(`/item/${id}`, {
                      state: headingId ? { highlightBlockId: headingId } : undefined,
                    })
                  }
                  sx={{ mx: 0.5 }}
                >
                  {resolvedLabel}
                </Link>,
              );
            }
          } else {
            const { title, anchor } = splitTitleAndAnchor(targetValue);
            if (!title) {
              nodes.push(link.raw);
              lastIndex = link.end;
              return;
            }
            const resolution = titleResolutions[title];
            if (resolution?.status === 'ok' && resolution.id) {
              const target = linkItemsById[resolution.id];
              const resolvedLabel = link.display
                ? label
                : target?.title
                  ? anchor
                    ? `${target.title}#${anchor}`
                    : target.title
                  : label;
              const headingId = findHeadingBlockId(target, anchor);
              nodes.push(
                <Link
                  key={`${targetValue}-${index}`}
                  component="button"
                  underline="always"
                  onClick={() =>
                    navigate(`/item/${resolution.id}`, {
                      state: headingId ? { highlightBlockId: headingId } : undefined,
                    })
                  }
                  sx={{ mx: 0.5 }}
                >
                  {resolvedLabel}
                </Link>,
              );
            } else if (resolution?.status === 'ambiguous') {
              nodes.push(
                <Box
                  key={`${targetValue}-${index}`}
                  component="span"
                  sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mx: 0.5 }}
                >
                  <span>{label}</span>
                  <Chip size="small" label="Ambiguo" variant="outlined" />
                </Box>,
              );
            } else {
              nodes.push(
                <Link
                  key={`${targetValue}-${index}`}
                  component="button"
                  underline="always"
                  onClick={() => handleRequestCreateLink(title)}
                  sx={{ mx: 0.5 }}
                >
                  {label}
                </Link>,
              );
            }
          }
        } else {
          nodes.push(link.raw);
        }

        lastIndex = link.end;
      });

      if (lastIndex < text.length) {
        nodes.push(text.slice(lastIndex));
      }

      return nodes;
    },
    [handleRequestCreateLink, linkItemsById, navigate, titleResolutions],
  );

  const renderBlockPreview = React.useCallback(
    (block: Block, listNumber?: number) => {
      const type = isBlockType(block.type) ? block.type : 'paragraph';
      const text = block.text ?? '';
      const content = renderTextWithLinks(text);

      if (type === 'divider') {
        return <Divider sx={{ my: 2 }} />;
      }

      if (type === 'checklist') {
        return (
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <Checkbox size="small" checked={block.checked ?? false} disabled />
            <Typography variant="body1">{content}</Typography>
          </Stack>
        );
      }

      if (type === 'callout') {
        return (
          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Typography variant="body1">{content}</Typography>
          </Paper>
        );
      }

      if (type === 'code') {
        return (
          <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'action.hover' }}>
            <Typography
              component="pre"
              sx={{
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                fontSize: '0.95rem',
                whiteSpace: 'pre-wrap',
                m: 0,
              }}
            >
              {text}
            </Typography>
          </Paper>
        );
      }

      if (type === 'bullet' || type === 'numbered') {
        return (
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <Typography component="span" sx={{ color: 'text.secondary' }}>
              {type === 'bullet' ? '*' : `${listNumber ?? 1}.`}
            </Typography>
            <Typography variant="body1">{content}</Typography>
          </Stack>
        );
      }

      if (type === 'h1' || type === 'h2' || type === 'h3') {
        const variant = type === 'h1' ? 'h4' : type === 'h2' ? 'h5' : 'h6';
        const hasChildren = Boolean(previewHeadingHasChildren[block.id]);
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {hasChildren && (
              <IconButton
                size="small"
                aria-label={block.collapsed ? 'Expandir seção' : 'Recolher seção'}
                onClick={() => handleToggleHeadingCollapse(block.id)}
                sx={{
                  transition: 'transform 0.15s ease',
                  transform: block.collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                }}
              >
                <ExpandMore fontSize="small" />
              </IconButton>
            )}
            <Typography variant={variant} sx={{ fontWeight: 600 }}>
              {content}
            </Typography>
          </Box>
        );
      }

      return <Typography variant="body1">{content}</Typography>;
    },
    [handleToggleHeadingCollapse, previewHeadingHasChildren, renderTextWithLinks],
  );

  const handleConfirmRename = async (value: string) => {
    if (!itemId) {
      return;
    }
    try {
      await renameNode(itemId, value);
      notifier.success('Nota renomeada');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao renomear: ${message}`);
    } finally {
      setRenameOpen(false);
    }
  };

  const handleConfirmMove = async (parentId?: string) => {
    if (!itemId) {
      return;
    }
    try {
      await moveNode(itemId, parentId);
      notifier.success('Nota movida');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao mover: ${message}`);
    } finally {
      setMoveOpen(false);
    }
  };

  const handleConfirmCreateLink = async () => {
    if (!pendingLinkTitle) {
      return;
    }
    const title = pendingLinkTitle.trim();
    if (!title) {
      setPendingLinkTitle(null);
      return;
    }
    setCreatingLink(true);
    try {
      const created = await createNote({
        title,
        parentId: liveItem?.parentId,
      });
      if (itemId && liveItem && resolvedType === 'note') {
        const linksTo = await recomputeLinksToFromBlocks(blocksRef.current);
        await updateItemProps(itemId, { linksTo });
      }
      setPendingLinkTitle(null);
      navigate(`/item/${created.id}`, { state: { focusEditor: true } });
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao criar nota: ${message}`);
    } finally {
      setCreatingLink(false);
    }
  };

  if (loading) {
    return <LoadingState message="Carregando item..." />;
  }

  if (notFound || !resolvedType) {
    return (
      <Stack spacing={2}>
        <Typography variant="h4" component="h1">
          Item nao encontrado
        </Typography>
        <Typography color="text.secondary">
          O item solicitado nao existe ou foi removido.
        </Typography>
        <Button variant="contained" onClick={() => navigate('/notes')}>
          Voltar para Notas
        </Button>
      </Stack>
    );
  }

  if (resolvedType === 'folder') {
    return <FolderPage folderId={itemId} />;
  }

  const tagList = Array.isArray(liveItem?.tags) ? liveItem?.tags : [];

  const saveLabel = isSaving
    ? 'Salvando...'
    : saveError
      ? 'Erro ao salvar'
      : isDirty
        ? 'Alteracoes pendentes'
        : typeof lastSavedAt === 'number' && Number.isFinite(lastSavedAt)
          ? `Salvo ${format(new Date(lastSavedAt), 'HH:mm')}`
          : '';
  const saveLabelColor = saveError ? 'error' : 'text.secondary';

  return (
    <Box ref={editorContainerRef} sx={{ width: '100%', maxWidth: 1000, mx: 'auto' }}>
      <Stack spacing={3}>
        <Stack spacing={1}>
          {breadcrumbNodes.length > 0 && (
            <Breadcrumbs>
              {breadcrumbNodes.map((node, index) => {
                const isLast = index === breadcrumbNodes.length - 1;
                if (isLast) {
                  return (
                    <Typography key={node.id} color="text.primary">
                      {node.title || 'Sem titulo'}
                    </Typography>
                  );
                }
                return (
                  <Button
                    key={node.id}
                    size="small"
                    onClick={() => navigate(`/item/${node.id}`)}
                    sx={{ textTransform: 'none', minWidth: 0 }}
                  >
                    {node.title || 'Sem titulo'}
                  </Button>
                );
              })}
            </Breadcrumbs>
          )}
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            alignItems={{ sm: 'center' }}
          >
            <Box sx={{ flex: 1 }}>
              <TextField
                variant="standard"
                fullWidth
                placeholder="Titulo"
                value={presentTitle}
                onChange={handleTitleChange}
                onBlur={handleCommitTyping}
                InputProps={{
                  disableUnderline: true,
                  sx: { fontSize: '2rem', fontWeight: 600 },
                }}
                inputProps={{ 'aria-label': 'Titulo da nota' }}
              />
            </Box>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" onClick={() => setSnapshotsOpen(true)}>
                Historico
              </Button>
              <Button variant="outlined" onClick={() => setMoveOpen(true)}>
                Mover
              </Button>
              <Button variant="outlined" onClick={() => setRenameOpen(true)}>
                Renomear
              </Button>
            </Stack>
          </Stack>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            alignItems={{ sm: 'center' }}
          >
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Chip size="small" label={TYPE_LABELS[resolvedType]} />
              {tagList.map((tag) => (
                <Chip key={tag} size="small" label={tag} variant="outlined" />
              ))}
            </Stack>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ ml: { sm: 'auto' } }}>
            {saveLabel && <Typography color={saveLabelColor}>{saveLabel}</Typography>}
            <IconButton
              size="small"
              onClick={handleTogglePreview}
              aria-label={isPreview ? 'Editar' : 'Visualizar'}
            >
              {isPreview ? <Edit /> : <Visibility />}
            </IconButton>
          </Stack>
        </Stack>
      </Stack>

        <Stack spacing={2}>
          {isPreview ? (
            <Stack spacing={2}>
              {(() => {
                let numberedCounter = 0;
                return visiblePreviewBlocks.map(({ block }) => {
                  const type = isBlockType(block.type) ? block.type : 'paragraph';
                  if (type === 'numbered') {
                    numberedCounter += 1;
                  } else {
                    numberedCounter = 0;
                  }
                  const listNumber = type === 'numbered' ? numberedCounter : undefined;
                  return (
                    <Box key={block.id}>{renderBlockPreview(block, listNumber)}</Box>
                  );
                });
              })()}
            </Stack>
          ) : (
            <Editor
              blocks={presentBlocks}
              onBlocksChangeTyping={handleBlocksChangeTyping}
              onBlocksChangeStructural={handleBlocksChangeStructural}
              onBlur={handleCommitTyping}
              focusRequest={focusRequest ?? undefined}
              onFocusBlock={setLastFocusedBlockId}
              onLinkClick={handleOpenLinkFromEditor}
            />
          )}
        </Stack>
      </Stack>

      <MoveToDialog
        open={moveOpen}
        nodeId={itemId}
        nodeType="note"
        currentParentId={liveItem?.parentId}
        nodes={nodes as DataNode[]}
        onClose={() => setMoveOpen(false)}
        onConfirm={handleConfirmMove}
      />

      <RenameDialog
        open={renameOpen}
        initialValue={liveItem?.title ?? ''}
        title="Renomear nota"
        onClose={() => setRenameOpen(false)}
        onConfirm={handleConfirmRename}
      />
      <SnapshotsDialog
        open={snapshotsOpen}
        nodeId={itemId}
        onClose={() => setSnapshotsOpen(false)}
      />
      <ConfirmDialog
        open={Boolean(pendingLinkTitle)}
        title="Criar nota?"
        description={`Criar nota "${pendingLinkTitle ?? ''}" agora?`}
        confirmLabel="Criar nota"
        onConfirm={handleConfirmCreateLink}
        onClose={() => setPendingLinkTitle(null)}
        isLoading={creatingLink}
      />
    </Box>
  );
}
