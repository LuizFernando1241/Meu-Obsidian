import React from 'react';
import { Add, ArrowForward, Edit, Visibility } from '@mui/icons-material';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  IconButton,
  Link,
  Paper,
  List,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { useNavigate, useParams } from 'react-router-dom';

import { useDebouncedCallback } from '../app/useDebouncedCallback';
import { upgradeLegacyLinksInText } from '../app/upgradeLinks';
import { parseWikilinks } from '../app/wikilinks';
import LoadingState from '../components/LoadingState';
import ItemRow from '../components/ItemRow';
import Editor from '../components/editor/Editor';
import { useEditorHistory } from '../components/editor/useEditorHistory';
import { useItem, useTasksByProject } from '../data/hooks';
import {
  completeTask,
  createItem,
  getItem,
  getItemsByIds,
  recomputeLinksToFromBlocks,
  resolveTitleToId,
  updateItemContent,
  updateItemProps,
} from '../data/repo';
import type { Block, BlockType, Item, ItemType, TaskStatus } from '../data/types';

const TYPE_LABELS: Record<ItemType, string> = {
  note: 'Nota',
  task: 'Tarefa',
  project: 'Projeto',
  area: 'Area',
};

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'A Fazer',
  doing: 'Fazendo',
  done: 'Feito',
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

const makeBlock = (text = ''): Block => ({
  id: uuidv4(),
  type: 'paragraph',
  text,
});

const normalizeBlock = (block: Block): Block => {
  const type = isBlockType(block.type) ? block.type : 'paragraph';
  const normalized: Block = {
    ...block,
    type,
    text: block.text ?? '',
  };

  if (type === 'divider') {
    normalized.text = '';
    normalized.checked = undefined;
    normalized.language = undefined;
    normalized.taskId = undefined;
    return normalized;
  }

  if (type === 'checklist') {
    normalized.checked = normalized.checked ?? false;
  } else {
    normalized.checked = undefined;
    normalized.taskId = undefined;
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
      (a.taskId ?? '') !== (b.taskId ?? '')
    ) {
      return false;
    }
  }
  return true;
};

export default function ItemPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const itemId = id ?? '';
  const liveItem = useItem(itemId);
  const projectTasks = useTasksByProject(itemId);

  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);
  const [itemType, setItemType] = React.useState<ItemType | null>(null);
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
  const [linkItemsById, setLinkItemsById] = React.useState<Record<string, Item>>({});
  const [titleResolutions, setTitleResolutions] = React.useState<
    Record<string, { status: 'ok' | 'ambiguous' | 'not_found'; id?: string }>
  >({});
  const resolvedType = liveItem?.type ?? itemType;
  const isProject = resolvedType === 'project';
  const projectTaskItems = isProject ? projectTasks : [];

  const [isDirty, setIsDirty] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [lastSavedAt, setLastSavedAt] = React.useState<number | null>(null);

  const skipAutosaveRef = React.useRef(true);
  const changeCounterRef = React.useRef(0);
  const lastSavedRef = React.useRef<{ title: string; blocks: Block[] } | null>(null);

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
          ids.add(link.id);
        }
        if (link.kind === 'title' && link.title) {
          titles.add(link.title);
        }
      }
    }

    return { ids: Array.from(ids), titles: Array.from(titles) };
  }, [presentBlocks]);

  const linkTargetsKey = `${linkTargets.ids.join('|')}::${linkTargets.titles.join('|')}`;

  React.useEffect(() => {
    if (!isPreview) {
      return;
    }
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
      const byId: Record<string, Item> = {};
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
  }, [isPreview, linkTargetsKey]);

  const saveDraft = React.useCallback(
    async (changeId: number) => {
      if (!itemId) {
        return;
      }

      setIsSaving(true);

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
        }
      } catch (error) {
        console.error(error);
        setIsSaving(false);
      }
    },
    [itemId],
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

        const rawContent = Array.isArray(result.content) ? result.content : [];
        const content = rawContent.length > 0 ? rawContent : [makeBlock('')];
        setItemType(result.type);
        const normalized = content.map(normalizeBlock);
        reset({
          title: result.title ?? '',
          blocks: normalized,
        });
        setLastFocusedBlockId(normalized[0]?.id ?? null);
        lastSavedRef.current = {
          title: result.title ?? '',
          blocks: cloneBlocks(normalized),
        };
        setIsDirty(false);
        setIsSaving(false);
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
  }, [itemId, reset]);

  React.useEffect(() => {
    if (loading || notFound) {
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
  }, [presentTitle, presentBlocks, cancelDebouncedSave, debouncedSave, loading, notFound]);

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

  const upgradeLegacyLinks = React.useCallback(async () => {
    const currentBlocks = blocksRef.current;
    let changed = false;
    let hadAmbiguity = false;
    const nextBlocks: Block[] = [];

    for (const block of currentBlocks) {
      if (!block.text) {
        nextBlocks.push(block);
        continue;
      }
      const result = await upgradeLegacyLinksInText(block.text, resolveTitleToId);
      if (result.hadAmbiguity) {
        hadAmbiguity = true;
      }
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

    return { changed, hadAmbiguity };
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

  const handleChecklistToggleTask = React.useCallback(
    async (taskId: string, checked: boolean) => {
      try {
        if (checked) {
          await completeTask(taskId);
        } else {
          await updateItemProps(taskId, { status: 'todo', doneAt: undefined });
        }
      } catch (error) {
        console.error(error);
      }
    },
    [],
  );

  const handlePromoteChecklist = React.useCallback(
    async (blockId: string, text: string) => {
      if (!itemId || !liveItem) {
        return;
      }
      const title = text.trim() || 'Sem titulo';
      const projectId = liveItem.type === 'project' ? itemId : undefined;
      try {
        const created = await createItem({
          type: 'task',
          title,
          status: 'todo',
          projectId,
          tags: liveItem.tags ?? [],
          originItemId: itemId,
          originBlockId: blockId,
          originType: liveItem.type,
        });
        const nextBlocks = blocksRef.current.map((block) =>
          block.id === blockId ? { ...block, taskId: created.id } : block,
        );
        setPresent({ title: draftTitleRef.current, blocks: nextBlocks }, 'structural');
      } catch (error) {
        console.error(error);
      }
    },
    [itemId, liveItem, setPresent],
  );

  const getNextTaskStatus = React.useCallback((status: TaskStatus) => {
    if (status === 'todo') {
      return 'doing';
    }
    if (status === 'doing') {
      return 'done';
    }
    return 'done';
  }, []);

  const handleAdvanceProjectTask = React.useCallback(
    async (task: Item) => {
      const status = (task.status ?? 'todo') as TaskStatus;
      const nextStatus = getNextTaskStatus(status);
      try {
        if (nextStatus === 'done') {
          await completeTask(task.id);
        } else {
          await updateItemProps(task.id, {
            status: nextStatus,
            doneAt: undefined,
          });
        }
      } catch (error) {
        console.error(error);
      }
    },
    [getNextTaskStatus],
  );

  const handleCreateProjectTask = React.useCallback(async () => {
    if (!itemId || resolvedType !== 'project') {
      return;
    }
    try {
      const created = await createItem({
        type: 'task',
        title: 'Nova tarefa',
        status: 'todo',
        projectId: itemId,
      });
      navigate(`/item/${created.id}`);
    } catch (error) {
      console.error(error);
    }
  }, [itemId, navigate, resolvedType]);

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
          const target = linkItemsById[link.id];
          const label = target?.title || link.display || link.id;
          nodes.push(
            <Link
              key={`${link.id}-${index}`}
              component="button"
              onClick={() => navigate(`/item/${link.id}`)}
              sx={{ mx: 0.5 }}
            >
              {label}
            </Link>,
          );
        } else if (link.kind === 'title' && link.title) {
          const resolution = titleResolutions[link.title];
          if (resolution?.status === 'ok' && resolution.id) {
            const target = linkItemsById[resolution.id];
            const label = target?.title || link.title;
            nodes.push(
              <Link
                key={`${link.title}-${index}`}
                component="button"
                onClick={() => navigate(`/item/${resolution.id}`)}
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
            nodes.push(link.title);
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
    [linkItemsById, navigate, titleResolutions],
  );

  const renderBlockPreview = React.useCallback(
    (block: Block, index: number) => {
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
              {type === 'bullet' ? '*' : `${index + 1}.`}
            </Typography>
            <Typography variant="body1">{content}</Typography>
          </Stack>
        );
      }

      if (type === 'h1' || type === 'h2' || type === 'h3') {
        const variant = type === 'h1' ? 'h4' : type === 'h2' ? 'h5' : 'h6';
        return (
          <Typography variant={variant} sx={{ fontWeight: 600 }}>
            {content}
          </Typography>
        );
      }

      return <Typography variant="body1">{content}</Typography>;
    },
    [renderTextWithLinks],
  );

  const formatTaskDueDate = (timestamp?: number) => {
    if (!timestamp) {
      return '';
    }
    return format(new Date(timestamp), 'dd/MM');
  };

  const getTaskStatusColor = (status: TaskStatus) => {
    if (status === 'done') {
      return 'success';
    }
    if (status === 'doing') {
      return 'warning';
    }
    return 'default';
  };

  if (loading) {
    return <LoadingState message="Carregando item..." />;
  }

  const tagList = Array.isArray(liveItem?.tags) ? liveItem?.tags : [];

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

  const saveLabel = isSaving
    ? 'Salvando...'
    : !isDirty && typeof lastSavedAt === 'number' && Number.isFinite(lastSavedAt)
      ? `Salvo ${format(new Date(lastSavedAt), 'HH:mm')}`
      : '';

  return (
    <Box ref={editorContainerRef} sx={{ width: '100%', maxWidth: 1000, mx: 'auto' }}>
      <Stack spacing={3}>
      <Stack spacing={1}>
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
        />
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
            {saveLabel && (
              <Typography color="text.secondary">
                {saveLabel}
              </Typography>
            )}
            <IconButton
              size="small"
              onClick={handleTogglePreview}
              aria-label={isPreview ? 'Editar' : 'Preview'}
            >
              {isPreview ? <Edit /> : <Visibility />}
            </IconButton>
          </Stack>
        </Stack>
      </Stack>

      {isProject && (
        <Stack spacing={1}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="h6">Tarefas do projeto</Typography>
            <Button
              size="small"
              startIcon={<Add fontSize="small" />}
              onClick={handleCreateProjectTask}
            >
              Criar tarefa
            </Button>
          </Stack>
          {projectTaskItems.length === 0 ? (
            <Typography color="text.secondary">Nenhuma tarefa vinculada.</Typography>
          ) : (
            <List dense disablePadding>
              {projectTaskItems.map((task) => {
                const status = (task.status ?? 'todo') as TaskStatus;
                const dueLabel = formatTaskDueDate(task.dueDate);
                const secondary = (
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Chip
                      size="small"
                      label={TASK_STATUS_LABELS[status]}
                      color={getTaskStatusColor(status)}
                    />
                    {dueLabel && (
                      <Chip
                        size="small"
                        label={`Vence ${dueLabel}`}
                        color={status === 'done' ? 'default' : 'warning'}
                        variant={status === 'done' ? 'outlined' : 'filled'}
                      />
                    )}
                  </Stack>
                );
                const rightActions = (
                  <IconButton
                    size="small"
                    aria-label="Avancar status"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleAdvanceProjectTask(task);
                    }}
                    disabled={status === 'done'}
                  >
                    <ArrowForward fontSize="small" />
                  </IconButton>
                );

                return (
                  <ItemRow
                    key={task.id}
                    item={task}
                    onOpen={(id) => navigate(`/item/${id}`)}
                    secondary={secondary}
                    rightActions={rightActions}
                  />
                );
              })}
            </List>
          )}
        </Stack>
      )}

      <Stack spacing={2}>
        {isPreview ? (
          <Stack spacing={2}>
            {presentBlocks.map((block, index) => (
              <Box key={block.id}>{renderBlockPreview(block, index)}</Box>
            ))}
          </Stack>
        ) : (
          <Editor
            blocks={presentBlocks}
            onBlocksChangeTyping={handleBlocksChangeTyping}
            onBlocksChangeStructural={handleBlocksChangeStructural}
            onBlur={handleCommitTyping}
            focusRequest={focusRequest ?? undefined}
            onFocusBlock={setLastFocusedBlockId}
            onPromoteChecklist={handlePromoteChecklist}
            onChecklistToggleTask={handleChecklistToggleTask}
          />
        )}
      </Stack>
      </Stack>
    </Box>
  );
}


