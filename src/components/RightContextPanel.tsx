import React from 'react';
import { Close, Delete, Star, StarBorder } from '@mui/icons-material';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import { format } from 'date-fns';
import { useMatch, useNavigate } from 'react-router-dom';

import LocalGraph from './graph/LocalGraph';
import { parseWikilinks } from '../app/wikilinks';
import { useBacklinks, useItem, useOutgoingLinks } from '../data/hooks';
import { deleteNode, resolveTitleToId, updateItemProps } from '../data/repo';
import type { NodeType } from '../data/types';
import ConfirmDialog from './ConfirmDialog';

type RightContextPanelProps = {
  isMobile: boolean;
  open: boolean;
  onClose: () => void;
  width: number;
};

const TYPE_ROUTES: Record<NodeType, string> = {
  note: '/notes',
  folder: '/notes',
};

const normalizeTag = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');

export default function RightContextPanel({
  isMobile,
  open,
  onClose,
  width,
}: RightContextPanelProps) {
  const match = useMatch('/item/:id');
  const navigate = useNavigate();
  const itemId = match?.params.id ?? '';
  const item = useItem(itemId);
  const outgoingLinks = useOutgoingLinks(itemId);
  const backlinks = useBacklinks(itemId);
  const [tagInput, setTagInput] = React.useState('');
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pendingLinksCount, setPendingLinksCount] = React.useState(0);
  const prevItemIdRef = React.useRef(itemId);

  React.useEffect(() => {
    setTagInput('');
    setConfirmOpen(false);
  }, [itemId]);

  React.useEffect(() => {
    if (!isMobile) {
      prevItemIdRef.current = itemId;
      return;
    }
    if (open && prevItemIdRef.current && prevItemIdRef.current !== itemId) {
      onClose();
    }
    if (open && prevItemIdRef.current && !itemId) {
      onClose();
    }
    prevItemIdRef.current = itemId;
  }, [itemId, isMobile, onClose, open]);

  React.useEffect(() => {
    if (!item) {
      setPendingLinksCount(0);
      return;
    }

    let active = true;

    const run = async () => {
      const titles = new Set<string>();
      const blocks = item.nodeType === 'note' && Array.isArray(item.content) ? item.content : [];
      blocks.forEach((block) => {
        const links = parseWikilinks(block.text ?? '');
        links.forEach((link) => {
          if (link.kind === 'title' && link.title) {
            titles.add(link.title);
          }
        });
      });

      if (titles.size === 0) {
        if (active) {
          setPendingLinksCount(0);
        }
        return;
      }

      let pending = 0;
      for (const title of titles) {
        const resolved = await resolveTitleToId(title);
        if (resolved.status !== 'ok') {
          pending += 1;
        }
      }

      if (active) {
        setPendingLinksCount(pending);
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [item?.id, item?.rev, item?.nodeType]);

  const handleToggleFavorite = async () => {
    if (!item || !itemId) {
      return;
    }
    try {
      await updateItemProps(itemId, { favorite: !item.favorite });
    } catch (error) {
      console.error(error);
    }
  };

  const handleAddTag = async () => {
    if (!item || !itemId) {
      return;
    }
    const normalized = normalizeTag(tagInput);
    if (!normalized) {
      return;
    }
    const currentTags = Array.isArray(item.tags) ? item.tags : [];
    if (currentTags.includes(normalized)) {
      setTagInput('');
      return;
    }
    const nextTags = [...currentTags, normalized];
    try {
      await updateItemProps(itemId, { tags: nextTags });
      setTagInput('');
    } catch (error) {
      console.error(error);
    }
  };

  const handleRemoveTag = async (tag: string) => {
    if (!item || !itemId) {
      return;
    }
    const currentTags = Array.isArray(item.tags) ? item.tags : [];
    const nextTags = currentTags.filter((entry) => entry !== tag);
    try {
      await updateItemProps(itemId, { tags: nextTags });
    } catch (error) {
      console.error(error);
    }
  };

  const handleTagKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void handleAddTag();
    }
  };

  const handleDeleteItem = async () => {
    if (!item || !itemId) {
      return;
    }
    try {
      await deleteNode(itemId);
      setConfirmOpen(false);
      onClose();
      navigate(TYPE_ROUTES[item.nodeType]);
    } catch (error) {
      console.error(error);
    }
  };

  const tagList = Array.isArray(item?.tags) ? item?.tags : [];
  const formatDateTime = (value?: number) =>
    typeof value === 'number' && Number.isFinite(value)
      ? format(new Date(value), 'yyyy-MM-dd HH:mm')
      : '-';

  return (
    <Drawer
      anchor="right"
      variant={isMobile ? 'temporary' : 'persistent'}
      open={open}
      onClose={onClose}
      ModalProps={{ keepMounted: true }}
      PaperProps={{ sx: { width } }}
    >
      <Toolbar />
      <Box sx={{ px: 2, pb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="h6">Propriedades</Typography>
          {isMobile && (
            <IconButton aria-label="Fechar painel" onClick={onClose} size="small">
              <Close />
            </IconButton>
          )}
        </Box>
        {!itemId && (
          <Typography color="text.secondary">Selecione um item para ver detalhes.</Typography>
        )}
        {itemId && !item && (
          <Stack spacing={1} alignItems="flex-start">
            <CircularProgress size={20} />
            <Typography color="text.secondary">Carregando item...</Typography>
          </Stack>
        )}
        {item && (
          <Stack spacing={2}>
            <Typography variant="subtitle2" color="text.secondary">
              {item.title || 'Sem titulo'}
            </Typography>
            <Divider />
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="subtitle2">Favorito</Typography>
              <IconButton
                size="small"
                color={item.favorite ? 'warning' : 'default'}
                onClick={handleToggleFavorite}
                aria-label="Alternar favorito"
              >
                {item.favorite ? <Star /> : <StarBorder />}
              </IconButton>
            </Stack>
            <Divider />
            <Stack spacing={1}>
              <Typography variant="subtitle2">Tags</Typography>
              {tagList.length > 0 ? (
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  {tagList.map((tag) => (
                    <Chip key={tag} size="small" label={tag} onDelete={() => handleRemoveTag(tag)} />
                  ))}
                </Stack>
              ) : (
                <Typography color="text.secondary" variant="body2">
                  Nenhuma tag adicionada.
                </Typography>
              )}
              <TextField
                size="small"
                label="Adicionar tag"
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={handleTagKeyDown}
              />
            </Stack>
            <Divider />
            <Stack spacing={0.5}>
              <Typography variant="subtitle2">Metadados</Typography>
              <Typography variant="body2" color="text.secondary">
                Revisao {item.rev}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Criado em {formatDateTime(item.createdAt)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Atualizado em {formatDateTime(item.updatedAt)}
              </Typography>
            </Stack>
            <Divider />
            <Stack spacing={1}>
              <Typography variant="subtitle2">Links de saida</Typography>
              {outgoingLinks.length === 0 ? (
                <Typography color="text.secondary" variant="body2">
                  Nenhum link.
                </Typography>
              ) : (
                <List dense disablePadding>
                  {outgoingLinks.map((link) => (
                    <ListItemButton
                      key={link.id}
                      onClick={() => navigate(`/item/${link.id}`)}
                    >
                      <ListItemText primary={link.title || 'Sem titulo'} />
                    </ListItemButton>
                  ))}
                </List>
              )}
            </Stack>
            {pendingLinksCount > 0 && (
              <>
                <Divider />
                <Stack spacing={0.5}>
                  <Typography variant="subtitle2">Links pendentes</Typography>
                  <Typography color="text.secondary" variant="body2">
                    {pendingLinksCount} link(s) ambiguo(s) ou ausente(s).
                  </Typography>
                </Stack>
              </>
            )}
            <Divider />
            <Stack spacing={1}>
              <Typography variant="subtitle2">Backlinks</Typography>
              {backlinks.length === 0 ? (
                <Typography color="text.secondary" variant="body2">
                  Nenhum backlink.
                </Typography>
              ) : (
                <List dense disablePadding>
                  {backlinks.map((link) => (
                    <ListItemButton
                      key={link.id}
                      onClick={() => navigate(`/item/${link.id}`)}
                    >
                      <ListItemText primary={link.title || 'Sem titulo'} />
                    </ListItemButton>
                  ))}
                </List>
              )}
            </Stack>
            <Divider />
            <Stack spacing={1}>
              <Typography variant="subtitle2">Grafo local</Typography>
              <LocalGraph
                centerId={itemId}
                height={240}
                onNodeClick={(id) => navigate(`/item/${id}`)}
              />
            </Stack>
            <Divider />
            <Button
              variant="outlined"
              color="error"
              startIcon={<Delete />}
              onClick={() => setConfirmOpen(true)}
            >
              Excluir item
            </Button>
          </Stack>
        )}
      </Box>
      <ConfirmDialog
        open={confirmOpen}
        title="Excluir item?"
        description="Esta acao nao pode ser desfeita."
        confirmLabel="Excluir"
        confirmColor="error"
        onConfirm={handleDeleteItem}
        onClose={() => setConfirmOpen(false)}
      />
    </Drawer>
  );
}
