import React from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListItem,
  Typography,
} from '@mui/material';
import { FolderOutlined, HomeOutlined } from '@mui/icons-material';

import type { Node as DataNode, NodeType } from '../../data/types';

type MoveToDialogProps = {
  open: boolean;
  nodeId: string;
  nodeType: NodeType;
  currentParentId?: string;
  nodes: DataNode[];
  onClose: () => void;
  onConfirm: (parentId?: string) => void;
};

const ROOT_ID = '__root__';

const normalizeTitle = (title?: string) => (title?.trim() ? title.trim() : 'Sem titulo');

const isDescendant = (
  ancestorId: string,
  targetId: string,
  parentMap: Map<string, string | undefined>,
) => {
  const visited = new Set<string>();
  let current: string | undefined = targetId;
  while (current) {
    if (current === ancestorId) {
      return true;
    }
    if (visited.has(current)) {
      return true;
    }
    visited.add(current);
    current = parentMap.get(current);
  }
  return false;
};

export default function MoveToDialog({
  open,
  nodeId,
  nodeType,
  currentParentId,
  nodes,
  onClose,
  onConfirm,
}: MoveToDialogProps) {
  const [selected, setSelected] = React.useState(ROOT_ID);

  const folders = React.useMemo(
    () =>
      nodes
        .filter((item) => item.nodeType === 'folder')
        .sort((a, b) => normalizeTitle(a.title).localeCompare(normalizeTitle(b.title))),
    [nodes],
  );

  const parentMap = React.useMemo(() => {
    const map = new Map<string, string | undefined>();
    nodes.forEach((node) => {
      map.set(node.id, node.parentId);
    });
    return map;
  }, [nodes]);

  React.useEffect(() => {
    if (open) {
      setSelected(currentParentId ?? ROOT_ID);
    }
  }, [currentParentId, open]);

  const isDisabledTarget = (targetId?: string) => {
    if (nodeType !== 'folder') {
      return false;
    }
    if (!targetId) {
      return false;
    }
    if (targetId === nodeId) {
      return true;
    }
    return isDescendant(nodeId, targetId, parentMap);
  };

  const selectedTarget = selected === ROOT_ID ? undefined : selected;
  const canConfirm = !isDisabledTarget(selectedTarget);

  const handleConfirm = () => {
    if (!canConfirm) {
      return;
    }
    onConfirm(selectedTarget);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Mover para...</DialogTitle>
      <DialogContent>
        <Typography color="text.secondary" sx={{ mb: 1 }}>
          Escolha a pasta de destino.
        </Typography>
        <List dense disablePadding>
          <ListItemButton
            selected={selected === ROOT_ID}
            onClick={() => setSelected(ROOT_ID)}
          >
            <ListItemIcon>
              <HomeOutlined fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Raiz (Vault)" />
          </ListItemButton>
          {folders.length === 0 ? (
            <ListItem>
              <ListItemText primary="Nenhuma pasta criada." />
            </ListItem>
          ) : (
            folders.map((folder) => {
              const disabled = isDisabledTarget(folder.id);
              return (
                <ListItemButton
                  key={folder.id}
                  selected={selected === folder.id}
                  disabled={disabled}
                  onClick={() => setSelected(folder.id)}
                >
                  <ListItemIcon>
                    <FolderOutlined fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary={normalizeTitle(folder.title)} />
                </ListItemButton>
              );
            })
          )}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button onClick={handleConfirm} disabled={!canConfirm} variant="contained">
          Mover
        </Button>
      </DialogActions>
    </Dialog>
  );
}
