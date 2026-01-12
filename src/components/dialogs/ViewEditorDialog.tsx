import React from 'react';
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';

import { db } from '../../data/db';
import { filterActiveNodes } from '../../data/deleted';
import { resolveSchemaIdForNode } from '../../data/schemaResolve';
import { buildDefaultSchema } from '../../data/schemaDefaults';
import type { FolderNode, SavedView } from '../../data/types';
import { buildPathCache } from '../../vault/pathCache';
import { useIsMobile } from '../../app/useIsMobile';
import DateField from '../DateField';

type ViewEditorDialogProps = {
  open: boolean;
  mode: 'create' | 'edit';
  initialView?: SavedView | null;
  onClose: () => void;
  onSave: (view: SavedView) => void;
};

const TYPE_OPTIONS = [
  { value: 'any', label: 'Qualquer' },
  { value: 'note', label: 'Notas' },
  { value: 'folder', label: 'Pastas' },
];

const STATUS_LABELS: Record<string, string> = {
  idea: 'Ideia',
  active: 'Ativo',
  waiting: 'Aguardando',
  done: 'Concluido',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baixa',
  medium: 'Media',
  high: 'Alta',
};

const formatStatusLabel = (value: string) => STATUS_LABELS[value] ?? value;
const formatPriorityLabel = (value: string) => PRIORITY_LABELS[value] ?? value;

const parseList = (raw: string) =>
  raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const joinList = (value?: string[]) => (value && value.length > 0 ? value.join(', ') : '');

export default function ViewEditorDialog({
  open,
  mode,
  initialView,
  onClose,
  onSave,
}: ViewEditorDialogProps) {
  const isMobile = useIsMobile();
  const allItems = useLiveQuery(() => db.items.toArray(), []) ?? [];
  const items = React.useMemo(() => filterActiveNodes(allItems), [allItems]);
  const schemas = useLiveQuery(() => db.schemas.toArray(), []) ?? [];
  const nodesById = React.useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );
  const schemasById = React.useMemo(
    () => new Map(schemas.map((schema) => [schema.id, schema])),
    [schemas],
  );
  const fallbackSchema = React.useMemo(() => buildDefaultSchema(Date.now()), []);
  const folders = React.useMemo(
    () => items.filter((item): item is FolderNode => item.nodeType === 'folder'),
    [items],
  );
  const pathCache = React.useMemo(() => buildPathCache(items), [items]);

  const [name, setName] = React.useState('');
  const [text, setText] = React.useState('');
  const [type, setType] = React.useState<'any' | 'note' | 'folder'>('any');
  const [rootId, setRootId] = React.useState('');
  const [pathPrefix, setPathPrefix] = React.useState('');
  const [tagsInput, setTagsInput] = React.useState('');
  const [status, setStatus] = React.useState<string[]>([]);
  const [priority, setPriority] = React.useState<string[]>([]);
  const [favoritesOnly, setFavoritesOnly] = React.useState(false);
  const [dueFrom, setDueFrom] = React.useState('');
  const [dueTo, setDueTo] = React.useState('');
  const [dueMissing, setDueMissing] = React.useState(false);
  const [updatedSinceDays, setUpdatedSinceDays] = React.useState('');
  const [sortBy, setSortBy] = React.useState('');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc');

  const effectiveSchema = React.useMemo(() => {
    const schemaId = rootId ? resolveSchemaIdForNode(rootId, nodesById) : 'global';
    return schemasById.get(schemaId) ?? schemasById.get('global') ?? fallbackSchema;
  }, [fallbackSchema, nodesById, rootId, schemasById]);
  const statusOptions = React.useMemo(() => {
    const prop = effectiveSchema.properties.find((entry) => entry.key === 'status');
    return prop?.options ?? [];
  }, [effectiveSchema]);
  const priorityOptions = React.useMemo(() => {
    const prop = effectiveSchema.properties.find((entry) => entry.key === 'priority');
    return prop?.options ?? [];
  }, [effectiveSchema]);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    const view = initialView;
    setName(view?.name ?? '');
    setText(view?.query.text ?? '');
    setType((view?.query.type as 'any' | 'note' | 'folder') ?? 'any');
    setRootId(view?.query.rootId ?? '');
    setPathPrefix(view?.query.pathPrefix ?? '');
    setTagsInput(joinList(view?.query.tags));
    setStatus(view?.query.status ?? []);
    setPriority(view?.query.priority ?? []);
    setFavoritesOnly(Boolean(view?.query.favoritesOnly));
    setDueFrom(view?.query.due?.from ?? '');
    setDueTo(view?.query.due?.to ?? '');
    setDueMissing(Boolean(view?.query.due?.missing));
    setUpdatedSinceDays(
      typeof view?.query.updatedSinceDays === 'number'
        ? String(view.query.updatedSinceDays)
        : '',
    );
    setSortBy(view?.sort?.by ?? '');
    setSortDir((view?.sort?.dir as 'asc' | 'desc') ?? 'desc');
  }, [initialView, open]);

  const handleMultiChange =
    (setter: React.Dispatch<React.SetStateAction<string[]>>) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      if (typeof value === 'string') {
        setter(value.split(',').map((entry) => entry.trim()).filter(Boolean));
        return;
      }
      setter((value as string[]).filter(Boolean));
    };

  const handleSave = () => {
    const trimmedName = name.trim() || 'Nova visao';
    const tags = parseList(tagsInput);
    const updatedDaysValue = Number(updatedSinceDays);
    const updatedDays =
      Number.isFinite(updatedDaysValue) && updatedDaysValue > 0
        ? Math.floor(updatedDaysValue)
        : undefined;
    const due =
      dueFrom || dueTo || dueMissing
        ? {
            from: dueFrom || undefined,
            to: dueTo || undefined,
            missing: dueMissing || undefined,
          }
        : undefined;
    const query = {
      text: text.trim() || undefined,
      type: type || undefined,
      rootId: rootId || undefined,
      pathPrefix: pathPrefix.trim() || undefined,
      tags: tags.length > 0 ? tags : undefined,
      status: status.length > 0 ? status : undefined,
      priority: priority.length > 0 ? priority : undefined,
      favoritesOnly: favoritesOnly || undefined,
      due,
      updatedSinceDays: updatedDays,
    };
    const sort =
      sortBy && sortDir
        ? {
            by: sortBy as
              | 'updatedAt'
              | 'title'
              | 'type'
              | 'path'
              | 'status'
              | 'due'
              | 'priority',
            dir: sortDir,
          }
        : undefined;
    const now = Date.now();
    const view: SavedView = {
      id: initialView?.id ?? uuidv4(),
      name: trimmedName,
      query,
      sort,
      displayMode: initialView?.displayMode,
      table: initialView?.table,
      kanban: initialView?.kanban,
      calendar: initialView?.calendar,
      createdAt: initialView?.createdAt ?? now,
      updatedAt: now,
    };
    onSave(view);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={isMobile}>
      <DialogTitle>{mode === 'edit' ? 'Editar visao' : 'Criar visao'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Nome"
            value={name}
            onChange={(event) => setName(event.target.value)}
            fullWidth
          />
          <TextField
            label="Texto"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Busca livre"
            fullWidth
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField
              label="Tipo"
              select
              value={type}
              onChange={(event) => setType(event.target.value as 'any' | 'note' | 'folder')}
              fullWidth
            >
              {TYPE_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Pasta raiz"
              select
              value={rootId}
              onChange={(event) => setRootId(event.target.value)}
              fullWidth
            >
              <MenuItem value="">Qualquer pasta</MenuItem>
              {folders.map((folder) => (
                <MenuItem key={folder.id} value={folder.id}>
                  {pathCache.get(folder.id)?.pathText || folder.title || 'Sem titulo'}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <TextField
            label="Prefixo do caminho"
            value={pathPrefix}
            onChange={(event) => setPathPrefix(event.target.value)}
            placeholder="Ex: Trabalho/Projetos"
            fullWidth
          />
          <TextField
            label="Tags"
            value={tagsInput}
            onChange={(event) => setTagsInput(event.target.value)}
            placeholder="Separar por virgula"
            fullWidth
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField
              label="Status"
              select
              SelectProps={{ multiple: true }}
              value={status}
              onChange={handleMultiChange(setStatus)}
              fullWidth
            >
              {statusOptions.map((option) => (
                <MenuItem key={option} value={option}>
                  {formatStatusLabel(option)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Prioridade"
              select
              SelectProps={{ multiple: true }}
              value={priority}
              onChange={handleMultiChange(setPriority)}
              fullWidth
            >
              {priorityOptions.map((option) => (
                <MenuItem key={option} value={option}>
                  {formatPriorityLabel(option)}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <FormControlLabel
            control={
              <Checkbox
                checked={favoritesOnly}
                onChange={(event) => setFavoritesOnly(event.target.checked)}
              />
            }
            label="Somente favoritos"
          />
          <Stack spacing={1}>
            <Typography variant="subtitle2">Prazo</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <DateField
                label="De"
                value={dueFrom}
                onCommit={(next) => setDueFrom(next ?? '')}
                fullWidth
              />
              <DateField
                label="Ate"
                value={dueTo}
                onCommit={(next) => setDueTo(next ?? '')}
                fullWidth
              />
            </Stack>
            <FormControlLabel
              control={
                <Checkbox
                  checked={dueMissing}
                  onChange={(event) => setDueMissing(event.target.checked)}
                />
              }
              label="Sem prazo"
            />
          </Stack>
          <TextField
            label="Atualizadas nos ultimos dias"
            type="number"
            value={updatedSinceDays}
            onChange={(event) => setUpdatedSinceDays(event.target.value)}
            inputProps={{ min: 1 }}
            fullWidth
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField
              label="Ordenar por"
              select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              fullWidth
            >
              <MenuItem value="">Sem ordenacao</MenuItem>
              <MenuItem value="updatedAt">Atualizacao</MenuItem>
              <MenuItem value="title">Titulo</MenuItem>
              <MenuItem value="type">Tipo</MenuItem>
              <MenuItem value="path">Caminho</MenuItem>
              <MenuItem value="status">Status</MenuItem>
              <MenuItem value="due">Prazo</MenuItem>
              <MenuItem value="priority">Prioridade</MenuItem>
            </TextField>
            <TextField
              label="Direcao"
              select
              value={sortDir}
              onChange={(event) => setSortDir(event.target.value as 'asc' | 'desc')}
              fullWidth
              disabled={!sortBy}
            >
              <MenuItem value="asc">Crescente</MenuItem>
              <MenuItem value="desc">Decrescente</MenuItem>
            </TextField>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions
        sx={{ flexDirection: isMobile ? 'column' : 'row', alignItems: 'stretch' }}
      >
        <Button onClick={onClose} sx={{ width: isMobile ? '100%' : 'auto' }}>
          Cancelar
        </Button>
        <Button onClick={handleSave} variant="contained" sx={{ width: isMobile ? '100%' : 'auto' }}>
          {mode === 'edit' ? 'Salvar' : 'Criar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
