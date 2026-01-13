import React from 'react';
import { Close, Delete, Star, StarBorder } from '@mui/icons-material';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import { format } from 'date-fns';
import { useMatch, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';

import LocalGraph from './graph/LocalGraph';
import PropertiesEditor from './PropertiesEditor';
import {
  findWikilinkSnippets,
  isExternalLinkTarget,
  parseWikilinks,
  splitTitleAndAnchor,
} from '../app/wikilinks';
import { db } from '../data/db';
import { filterActiveNodes } from '../data/deleted';
import { useBacklinks, useItem, useOutgoingLinks } from '../data/hooks';
import { resolveSchemaIdForNode } from '../data/schemaResolve';
import { buildDefaultSchema } from '../data/schemaDefaults';
import { blocksToMarkdown, parseMarkdownToBlocks } from '../editor/markdownToBlocks';
import { deleteNode, resolveTitleToId, updateItemProps } from '../data/repo';
import type { Block, Node, NodeType } from '../data/types';
import ConfirmDialog from './ConfirmDialog';
import { useNotifier } from './Notifier';

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
  const notifier = useNotifier();
  const match = useMatch('/item/:id');
  const navigate = useNavigate();
  const itemId = match?.params.id ?? '';
  const item = useItem(itemId);
  const outgoingLinks = useOutgoingLinks(itemId);
  const backlinks = useBacklinks(itemId);
  const allNodes = useLiveQuery(() => db.items.toArray(), []) ?? [];
  const nodes = React.useMemo(() => filterActiveNodes(allNodes), [allNodes]);
  const nodesById = React.useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );
  const schemas = useLiveQuery(() => db.schemas.toArray(), []) ?? [];
  const schemasById = React.useMemo(
    () => new Map(schemas.map((schema) => [schema.id, schema])),
    [schemas],
  );
  const fallbackSchema = React.useMemo(() => buildDefaultSchema(Date.now()), []);
  const effectiveSchema = React.useMemo(() => {
    if (!item) {
      return fallbackSchema;
    }
    const schemaId = resolveSchemaIdForNode(item.id, nodesById);
    return schemasById.get(schemaId) ?? schemasById.get('global') ?? fallbackSchema;
  }, [fallbackSchema, item, nodesById, schemasById]);
  const schemaOptions = React.useMemo(
    () =>
      [...schemas].sort((left, right) => {
        const leftName = left.name?.trim() ? left.name : left.id;
        const rightName = right.name?.trim() ? right.name : right.id;
        return leftName.localeCompare(rightName);
      }),
    [schemas],
  );
  const folderSchemaId =
    item?.nodeType === 'folder' &&
    item.props &&
    typeof (item.props as Record<string, unknown>).schemaId === 'string'
      ? String((item.props as Record<string, unknown>).schemaId)
      : '';
  const folderTemplateBlocks =
    item?.nodeType === 'folder' &&
    item.props &&
    Array.isArray((item.props as Record<string, unknown>).templateBlocks)
      ? ((item.props as Record<string, unknown>).templateBlocks as Block[])
      : [];
  const folderTemplateMarkdown =
    item?.nodeType === 'folder' &&
    item.props &&
    typeof (item.props as Record<string, unknown>).templateMarkdown === 'string'
      ? String((item.props as Record<string, unknown>).templateMarkdown)
      : '';
  const [tagInput, setTagInput] = React.useState('');
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pendingLinksCount, setPendingLinksCount] = React.useState(0);
  const prevItemIdRef = React.useRef(itemId);
  const [templateDialogOpen, setTemplateDialogOpen] = React.useState(false);
  const [templateDraft, setTemplateDraft] = React.useState('');

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
            const { title } = splitTitleAndAnchor(link.title);
            if (title) {
              titles.add(title);
            }
          }
          if (link.kind === 'target' && link.target) {
            const target = link.target.trim();
            if (!target) {
              return;
            }
            if (target.toLowerCase().startsWith('id:')) {
              return;
            }
            if (isExternalLinkTarget(target)) {
              return;
            }
            const { title } = splitTitleAndAnchor(target);
            if (title) {
              titles.add(title);
            }
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
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao atualizar favorito: ${message}`);
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
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao adicionar tag: ${message}`);
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
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao remover tag: ${message}`);
    }
  };

  const handlePropsChange = async (nextProps: Record<string, unknown>) => {
    if (!item || !itemId) {
      return;
    }
    try {
      await updateItemProps(itemId, { props: nextProps });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao atualizar propriedades: ${message}`);
    }
  };

  const handleFolderSchemaChange = async (schemaId: string) => {
    if (!item || item.nodeType !== 'folder' || !itemId) {
      return;
    }
    const currentProps =
      item.props && typeof item.props === 'object'
        ? (item.props as Record<string, unknown>)
        : {};
    const nextProps: Record<string, unknown> = { ...currentProps };
    if (!schemaId) {
      delete nextProps.schemaId;
    } else {
      nextProps.schemaId = schemaId;
    }
    try {
      await updateItemProps(itemId, { props: nextProps });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao atualizar schema da pasta: ${message}`);
    }
  };

  const handleOpenTemplateDialog = () => {
    if (!item || item.nodeType !== 'folder') {
      return;
    }
    const text =
      folderTemplateMarkdown ||
      (Array.isArray(folderTemplateBlocks) && folderTemplateBlocks.length > 0
        ? blocksToMarkdown(folderTemplateBlocks)
        : '');
    setTemplateDraft(text);
    setTemplateDialogOpen(true);
  };

  const handleSaveTemplate = async () => {
    if (!item || item.nodeType !== 'folder' || !itemId) {
      return;
    }
    const currentProps =
      item.props && typeof item.props === 'object'
        ? (item.props as Record<string, unknown>)
        : {};
    const nextProps: Record<string, unknown> = { ...currentProps };
    if (!templateDraft.trim()) {
      delete nextProps.templateMarkdown;
      delete nextProps.templateBlocks;
    } else {
      const parsedBlocks = parseMarkdownToBlocks(templateDraft);
      nextProps.templateMarkdown = templateDraft;
      nextProps.templateBlocks = parsedBlocks;
    }
    try {
      await updateItemProps(itemId, { props: nextProps });
      setTemplateDialogOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao salvar template: ${message}`);
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
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao excluir item: ${message}`);
    }
  };

  const getBacklinkSnippet = React.useCallback(
    (source: Node) => {
      if (!item || source.nodeType !== 'note' || !Array.isArray(source.content)) {
        return '';
      }
      const target = { id: item.id, title: item.title ?? '' };
      for (const block of source.content) {
        const text = block.text ?? '';
        const snippets = findWikilinkSnippets(text, target);
        if (snippets.length > 0) {
          return snippets[0].snippet;
        }
      }
      return '';
    },
    [item],
  );

  const tagList = Array.isArray(item?.tags) ? item?.tags : [];
  const formatDateTime = (value?: number) =>
    typeof value === 'number' && Number.isFinite(value)
      ? format(new Date(value), 'yyyy-MM-dd HH:mm')
      : '-';
  const drawerAnchor = isMobile ? 'bottom' : 'right';
  const drawerVariant = isMobile ? 'temporary' : 'persistent';
  const paperSx = isMobile
    ? {
        width: '100%',
        height: '70vh',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
      }
    : { width };

  return (
    <Drawer
      anchor={drawerAnchor}
      variant={drawerVariant}
      open={open}
      onClose={onClose}
      ModalProps={{ keepMounted: true }}
      PaperProps={{ sx: paperSx }}
    >
      {!isMobile && <Toolbar />}
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
            {item.nodeType === 'folder' && (
              <>
                <Stack spacing={1}>
                  <Typography variant="subtitle2">Schema da pasta</Typography>
                  <TextField
                    select
                    size="small"
                    label="Schema"
                    value={folderSchemaId}
                    onChange={(event) => handleFolderSchemaChange(event.target.value)}
                    fullWidth
                  >
                    <MenuItem value="">Herdar do pai (padrao)</MenuItem>
                    {schemaOptions.map((schema) => (
                      <MenuItem key={schema.id} value={schema.id}>
                        {schema.name?.trim() ? schema.name : schema.id}
                        {schema.id === 'global' ? ' (Global)' : ''}
                      </MenuItem>
                    ))}
                  </TextField>
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => navigate('/settings#schemas')}
                    sx={{ alignSelf: 'flex-start' }}
                  >
                    Gerenciar schemas
                  </Button>
                </Stack>
                <Divider />
                <Stack spacing={1}>
                  <Typography variant="subtitle2">Template da pasta</Typography>
                  {folderTemplateMarkdown || folderTemplateBlocks.length > 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      {folderTemplateBlocks.length} bloco(s) no template.
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Nenhum template definido.
                    </Typography>
                  )}
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={handleOpenTemplateDialog}
                    sx={{ alignSelf: 'flex-start' }}
                  >
                    Editar template da pasta
                  </Button>
                </Stack>
                <Divider />
              </>
            )}
            <Stack spacing={1}>
              <Typography variant="subtitle2">Propriedades</Typography>
              <PropertiesEditor
                node={item}
                onChange={handlePropsChange}
                schema={effectiveSchema}
              />
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
                      <ListItemText
                        primary={link.title || 'Sem titulo'}
                        secondary={getBacklinkSnippet(link) || undefined}
                      />
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
        description="O item sera movido para a lixeira."
        confirmLabel="Excluir"
        confirmColor="error"
        onConfirm={handleDeleteItem}
        onClose={() => setConfirmOpen(false)}
      />
      <Dialog
        open={templateDialogOpen}
        onClose={() => setTemplateDialogOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Template da pasta</DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Use markdown simples. O texto sera convertido em blocos ao salvar.
            </Typography>
            <TextField
              value={templateDraft}
              onChange={(event) => setTemplateDraft(event.target.value)}
              multiline
              minRows={8}
              placeholder="Ex: # Resumo\n\n- [ ] Primeira tarefa"
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTemplateDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleSaveTemplate}>
            Salvar template
          </Button>
        </DialogActions>
      </Dialog>
    </Drawer>
  );
}
