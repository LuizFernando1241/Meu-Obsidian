import React from 'react';
import {
  Box,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from '@mui/material';
import {
  Add,
  ChevronRight,
  DescriptionOutlined,
  ExpandMore,
  FolderOutlined,
  MoreVert,
} from '@mui/icons-material';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMatch, useNavigate } from 'react-router-dom';

import { db } from '../data/db';
import { filterActiveNodes } from '../data/deleted';
import {
  createFolder,
  createNote,
  deleteNode,
  moveNode,
  renameNode,
  reorderNodesInParent,
} from '../data/repo';
import type { NodeType } from '../data/types';
import { buildTree, type TreeNode } from '../vault/tree';
import { sortNodes } from '../vault/sortNodes';
import ConfirmDialog from './ConfirmDialog';
import { useNotifier } from './Notifier';
import MoveToDialog from './dialogs/MoveToDialog';
import RenameDialog from './dialogs/RenameDialog';

type VaultExplorerProps = {
  isMobile: boolean;
  onNavigate?: () => void;
};

const STORAGE_KEY = 'vault_expanded_folders';

const readExpandedFromStorage = () => {
  if (typeof window === 'undefined') {
    return [] as string[];
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [] as string[];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [] as string[];
    }
    return parsed.filter((entry): entry is string => typeof entry === 'string');
  } catch {
    return [] as string[];
  }
};

export default function VaultExplorer({ isMobile, onNavigate }: VaultExplorerProps) {
  const navigate = useNavigate();
  const notifier = useNotifier();
  const match = useMatch('/item/:id');
  const activeId = match?.params?.id;
  const listDense = !isMobile;

  const allNodes = useLiveQuery(() => db.items.toArray(), []) ?? [];
  const nodes = React.useMemo(() => filterActiveNodes(allNodes), [allNodes]);
  const { roots } = React.useMemo(() => buildTree(nodes), [nodes]);
  const nodesById = React.useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );

  const [expandedIds, setExpandedIds] = React.useState<string[]>(readExpandedFromStorage);
  const [menuAnchor, setMenuAnchor] = React.useState<null | HTMLElement>(null);
  const [menuNodeId, setMenuNodeId] = React.useState<string | null>(null);
  const [rootMenuAnchor, setRootMenuAnchor] = React.useState<null | HTMLElement>(null);
  const [renameNodeId, setRenameNodeId] = React.useState<string | null>(null);
  const [moveNodeId, setMoveNodeId] = React.useState<string | null>(null);
  const [deleteNodeId, setDeleteNodeId] = React.useState<string | null>(null);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = React.useState<string | null>(null);
  const [dropPosition, setDropPosition] = React.useState<'above' | 'below' | 'inside' | null>(
    null,
  );

  const expandedSet = React.useMemo(() => new Set(expandedIds), [expandedIds]);
  const menuNode = menuNodeId ? nodesById.get(menuNodeId) : undefined;
  const renameNodeItem = renameNodeId ? nodesById.get(renameNodeId) : undefined;
  const moveNodeItem = moveNodeId ? nodesById.get(moveNodeId) : undefined;
  const deleteNodeItem = deleteNodeId ? nodesById.get(deleteNodeId) : undefined;

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expandedIds));
  }, [expandedIds]);

  React.useEffect(() => {
    const folderIds = new Set(nodes.filter((item) => item.nodeType === 'folder').map((item) => item.id));
    setExpandedIds((prev) => {
      const next = prev.filter((id) => folderIds.has(id));
      if (next.length === prev.length && next.every((id, index) => id === prev[index])) {
        return prev;
      }
      return next;
    });
  }, [nodes]);

  const handleNavigate = React.useCallback(
    (id: string) => {
      navigate(`/item/${id}`);
      if (onNavigate) {
        onNavigate();
      }
    },
    [navigate, onNavigate],
  );

  const ensureExpanded = (folderId?: string) => {
    if (!folderId) {
      return;
    }
    setExpandedIds((prev) => (prev.includes(folderId) ? prev : [...prev, folderId]));
  };

  const handleCreate = async (type: NodeType, parentId?: string) => {
    try {
      const created =
        type === 'folder'
          ? await createFolder({ parentId })
          : await createNote({ parentId });
      if (type === 'folder') {
        notifier.success('Pasta criada');
      } else {
        notifier.success('Nota criada');
      }
      ensureExpanded(parentId);
      handleNavigate(created.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao criar: ${message}`);
    }
  };

  const toggleExpanded = (event: React.MouseEvent<HTMLButtonElement>, id: string) => {
    event.stopPropagation();
    setExpandedIds((prev) =>
      prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id],
    );
  };

  const handleOpenMenu = (event: React.MouseEvent<HTMLButtonElement>, nodeId: string) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
    setMenuNodeId(nodeId);
  };

  const handleCloseMenu = () => {
    setMenuAnchor(null);
    setMenuNodeId(null);
  };

  const handleRequestRename = () => {
    if (!menuNodeId) {
      return;
    }
    setRenameNodeId(menuNodeId);
    handleCloseMenu();
  };

  const handleConfirmRename = async (value: string) => {
    if (!renameNodeId) {
      return;
    }
    try {
      await renameNode(renameNodeId, value);
      notifier.success('Item renomeado');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao renomear: ${message}`);
    } finally {
      setRenameNodeId(null);
    }
  };

  const handleRequestMove = () => {
    if (!menuNodeId) {
      return;
    }
    setMoveNodeId(menuNodeId);
    handleCloseMenu();
  };

  const handleCreateInsideMenu = (type: NodeType) => {
    if (!menuNode || menuNode.nodeType !== 'folder') {
      return;
    }
    handleCloseMenu();
    void handleCreate(type, menuNode.id);
  };

  const handleConfirmMove = async (parentId?: string) => {
    if (!moveNodeId) {
      return;
    }
    try {
      await moveNode(moveNodeId, parentId);
      notifier.success('Item movido');
      ensureExpanded(parentId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao mover: ${message}`);
    } finally {
      setMoveNodeId(null);
    }
  };

  const handleRequestDelete = () => {
    if (!menuNodeId) {
      return;
    }
    setDeleteNodeId(menuNodeId);
    handleCloseMenu();
  };

  const handleConfirmDelete = async () => {
    if (!deleteNodeId) {
      return;
    }
    try {
      await deleteNode(deleteNodeId);
      notifier.success('Item excluido');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao excluir: ${message}`);
    } finally {
      setDeleteNodeId(null);
    }
  };

  const clearDragState = React.useCallback(() => {
    setDraggingId(null);
    setDropTargetId(null);
    setDropPosition(null);
  }, []);

  const getSiblings = React.useCallback(
    (parentId?: string) => {
      const siblings = nodes.filter((node) =>
        parentId ? node.parentId === parentId : !node.parentId,
      );
      return sortNodes([...siblings]);
    },
    [nodes],
  );

  const isValidParentTarget = React.useCallback(
    (nodeId: string, parentId?: string) => {
      if (!parentId) {
        return true;
      }
      if (parentId === nodeId) {
        return false;
      }
      const visited = new Set<string>([nodeId]);
      let current: string | undefined = parentId;
      while (current) {
        if (visited.has(current)) {
          return false;
        }
        visited.add(current);
        const next = nodesById.get(current);
        if (!next) {
          return true;
        }
        current = next.parentId;
      }
      return true;
    },
    [nodesById],
  );

  const handleDragStart = React.useCallback(
    (event: React.DragEvent, nodeId: string) => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', nodeId);
      event.dataTransfer.setData('application/x-node-id', nodeId);
      setDraggingId(nodeId);
      setDropTargetId(nodeId);
      setDropPosition(null);
    },
    [],
  );

  const getDragId = React.useCallback(
    (event: React.DragEvent) =>
      draggingId ||
      event.dataTransfer.getData('application/x-node-id') ||
      event.dataTransfer.getData('text/plain') ||
      '',
    [draggingId],
  );

  const handleDragOverNode = React.useCallback(
    (event: React.DragEvent, node: TreeNode) => {
      const activeId = getDragId(event);
      if (!activeId || activeId === node.id) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';

      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const offset = event.clientY - rect.top;
      const ratio = rect.height > 0 ? offset / rect.height : 0.5;
      let nextPosition: 'above' | 'below' | 'inside' = ratio < 0.5 ? 'above' : 'below';
      if (node.nodeType === 'folder' && ratio > 0.25 && ratio < 0.75) {
        nextPosition = 'inside';
      }

      setDraggingId(activeId);
      setDropTargetId(node.id);
      setDropPosition(nextPosition);
    },
    [getDragId],
  );

  const handleDropOnNode = React.useCallback(
    async (event: React.DragEvent, node: TreeNode) => {
      const activeId = getDragId(event);
      event.preventDefault();
      event.stopPropagation();
      clearDragState();
      if (!activeId || activeId === node.id) {
        return;
      }
      const dragged = nodesById.get(activeId);
      if (!dragged) {
        return;
      }

      const position = dropPosition ?? 'below';
      const targetParentId =
        position === 'inside' && node.nodeType === 'folder' ? node.id : node.parentId;

      if (!isValidParentTarget(activeId, targetParentId)) {
        notifier.error('Nao e possivel mover para dentro de si mesma.');
        return;
      }

      const siblings = getSiblings(targetParentId).filter((item) => item.id !== activeId);
      if (position === 'inside' && node.nodeType === 'folder') {
        siblings.push(dragged);
      } else {
        const targetIndex = siblings.findIndex((item) => item.id === node.id);
        const insertIndex = targetIndex >= 0 ? targetIndex + (position === 'below' ? 1 : 0) : siblings.length;
        siblings.splice(insertIndex, 0, dragged);
      }

      try {
        await reorderNodesInParent(
          targetParentId,
          siblings.map((item) => item.id),
        );
        ensureExpanded(targetParentId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        notifier.error(`Erro ao mover: ${message}`);
      }
    },
    [
      clearDragState,
      dropPosition,
      ensureExpanded,
      getDragId,
      getSiblings,
      isValidParentTarget,
      nodesById,
      notifier,
    ],
  );

  const handleDropIntoParent = React.useCallback(
    async (event: React.DragEvent, parentId?: string) => {
      const activeId = getDragId(event);
      event.preventDefault();
      event.stopPropagation();
      clearDragState();
      if (!activeId) {
        return;
      }
      const dragged = nodesById.get(activeId);
      if (!dragged) {
        return;
      }
      if (!isValidParentTarget(activeId, parentId)) {
        notifier.error('Nao e possivel mover para dentro de si mesma.');
        return;
      }
      const siblings = getSiblings(parentId).filter((item) => item.id !== activeId);
      siblings.push(dragged);
      try {
        await reorderNodesInParent(
          parentId,
          siblings.map((item) => item.id),
        );
        ensureExpanded(parentId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        notifier.error(`Erro ao mover: ${message}`);
      }
    },
    [clearDragState, ensureExpanded, getDragId, getSiblings, isValidParentTarget, nodesById, notifier],
  );

  const renderNode = (node: TreeNode, depth: number) => {
    const isFolder = node.nodeType === 'folder';
    const expanded = isFolder && expandedSet.has(node.id);
    const hasChildren = Boolean(node.children && node.children.length > 0);
    const isDropTarget = dropTargetId === node.id;
    const isInsideDrop = isDropTarget && dropPosition === 'inside';
    const showIndicator =
      isDropTarget && (dropPosition === 'above' || dropPosition === 'below');
    const indicatorPosition = dropPosition === 'below' ? 'bottom' : 'top';

    return (
      <React.Fragment key={node.id}>
        <ListItem
          disablePadding
          sx={{ position: 'relative' }}
          secondaryAction={
            <IconButton
              edge="end"
              aria-label="Acoes"
              size="small"
              onClick={(event) => handleOpenMenu(event, node.id)}
            >
              <MoreVert fontSize="small" />
            </IconButton>
          }
        >
          {showIndicator && (
            <Box
              sx={{
                position: 'absolute',
                left: 8 + depth * 16,
                right: 12,
                height: 2,
                bgcolor: 'primary.main',
                borderRadius: 1,
                [indicatorPosition]: 0,
              }}
            />
          )}
          <ListItemButton
            dense={listDense}
            selected={activeId === node.id}
            onClick={() => handleNavigate(node.id)}
            draggable
            onDragStart={(event) => handleDragStart(event, node.id)}
            onDragEnd={clearDragState}
            onDragOver={(event) => handleDragOverNode(event, node)}
            onDrop={(event) => handleDropOnNode(event, node)}
            sx={{
              pl: 1 + depth * 2,
              pr: 6,
              ...(isInsideDrop ? { bgcolor: 'action.hover' } : null),
            }}
          >
            {isFolder ? (
              <IconButton
                size="small"
                onClick={(event) => toggleExpanded(event, node.id)}
                disabled={!hasChildren}
                aria-label={expanded ? 'Recolher pasta' : 'Expandir pasta'}
                sx={{ mr: 0.5 }}
              >
                {expanded ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />}
              </IconButton>
            ) : (
              <Box sx={{ width: 32 }} />
            )}
            <ListItemIcon sx={{ minWidth: 0, mr: 1 }}>
              {isFolder ? (
                <FolderOutlined fontSize="small" />
              ) : (
                <DescriptionOutlined fontSize="small" />
              )}
            </ListItemIcon>
            <ListItemText
              primary={node.title || 'Sem titulo'}
              primaryTypographyProps={{ noWrap: true }}
            />
          </ListItemButton>
        </ListItem>
        {isFolder && expanded && hasChildren && (
          <List
            dense={listDense}
            disablePadding
            onDragOver={(event) => {
              if (!draggingId) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
            }}
            onDrop={(event) => handleDropIntoParent(event, node.id)}
          >
            {node.children?.map((child) => renderNode(child, depth + 1))}
          </List>
        )}
      </React.Fragment>
    );
  };

  return (
    <Box>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2, pt: 1.5, pb: 1 }}
      >
        <Typography variant="overline" color="text.secondary">
          Cofre
        </Typography>
        <IconButton
          size="small"
          aria-label="Criar"
          onClick={(event) => setRootMenuAnchor(event.currentTarget)}
        >
          <Add fontSize="small" />
        </IconButton>
      </Stack>

      <List
        dense={listDense}
        disablePadding
        onDragOver={(event) => {
          if (!draggingId) {
            return;
          }
          event.preventDefault();
        }}
        onDrop={(event) => handleDropIntoParent(event, undefined)}
      >
        {roots.length === 0 ? (
          <ListItem>
            <ListItemText primary="Nenhum item ainda." />
          </ListItem>
        ) : (
          roots.map((node) => renderNode(node, 0))
        )}
      </List>

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={handleCloseMenu}>
        {menuNode?.nodeType === 'folder' && (
          <>
            <MenuItem onClick={() => handleCreateInsideMenu('note')}>
              Criar nota aqui
            </MenuItem>
            <MenuItem onClick={() => handleCreateInsideMenu('folder')}>
              Criar pasta aqui
            </MenuItem>
          </>
        )}
        <MenuItem onClick={handleRequestRename}>Renomear</MenuItem>
        <MenuItem onClick={handleRequestMove}>Mover para...</MenuItem>
        <MenuItem onClick={handleRequestDelete}>Excluir</MenuItem>
      </Menu>

      <Menu
        anchorEl={rootMenuAnchor}
        open={Boolean(rootMenuAnchor)}
        onClose={() => setRootMenuAnchor(null)}
      >
        <MenuItem
          onClick={() => {
            setRootMenuAnchor(null);
            void handleCreate('note');
          }}
        >
          Criar nota
        </MenuItem>
        <MenuItem
          onClick={() => {
            setRootMenuAnchor(null);
            void handleCreate('folder');
          }}
        >
          Criar pasta
        </MenuItem>
      </Menu>

      <RenameDialog
        open={Boolean(renameNodeId)}
        initialValue={renameNodeItem?.title ?? ''}
        onClose={() => setRenameNodeId(null)}
        onConfirm={handleConfirmRename}
      />

      <MoveToDialog
        open={Boolean(moveNodeId && moveNodeItem)}
        nodeId={moveNodeId ?? ''}
        nodeType={moveNodeItem?.nodeType ?? 'note'}
        currentParentId={moveNodeItem?.parentId}
        nodes={nodes}
        onClose={() => setMoveNodeId(null)}
        onConfirm={handleConfirmMove}
      />

      <ConfirmDialog
        open={Boolean(deleteNodeId && deleteNodeItem)}
        title="Excluir item?"
        description="O item sera movido para a lixeira."
        confirmLabel="Excluir"
        confirmColor="error"
        onConfirm={handleConfirmDelete}
        onClose={() => setDeleteNodeId(null)}
      />
    </Box>
  );
}
