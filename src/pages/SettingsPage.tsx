import React from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';

import { BUILD_TIME, GIT_SHA, MODE } from '../app/buildInfo';
import { computeVaultStats } from '../app/vaultStats';
import ConfirmDialog from '../components/ConfirmDialog';
import SchemaEditorDialog from '../components/dialogs/SchemaEditorDialog';
import { useNotifier } from '../components/Notifier';
import {
  exportVaultJson,
  importVaultJson,
  resetLocalData,
  validateVaultBackup,
} from '../data/backup';
import {
  deleteAutoBackup,
  downloadAutoBackup,
  getAutoBackupPrefs,
  getLastAutoBackupAt,
  restoreAutoBackup,
  runAutoBackupNow,
  setAutoBackupPrefs,
} from '../data/autoBackup';
import { db } from '../data/db';
import { filterActiveNodes } from '../data/deleted';
import { deleteSchema, listSchemas, upsertSchema } from '../data/repo';
import { readRemoteVault, testConnection } from '../sync/gistClient';
import { syncNowManual, setAutoSyncEnabled, setIntervalMin } from '../sync/syncService';
import { getSyncPrefs, getSyncState, subscribeSyncState } from '../sync/syncState';
import type { SyncSettings } from '../sync/types';
import type { NoteNode, PropertySchema } from '../data/types';
import { buildTaskIndex } from '../tasks/taskIndex';
import { getTodayISO } from '../tasks/date';

type ImportMode = 'replace' | 'merge';
type FileSummary = {
  nodeCount: number;
};

const SYNC_SETTINGS_KEY = 'mf_sync_settings';
const LARGE_VAULT_BYTES = 2 * 1024 * 1024;

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
};

const readStoredSyncSettings = (): SyncSettings => {
  if (typeof window === 'undefined') {
    return { gistId: '', token: '', filename: '' };
  }
  const raw = window.localStorage.getItem(SYNC_SETTINGS_KEY);
  if (!raw) {
    return { gistId: '', token: '', filename: '' };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<SyncSettings>;
    return {
      gistId: parsed.gistId ?? '',
      token: parsed.token ?? '',
      filename: parsed.filename ?? '',
    };
  } catch {
    return { gistId: '', token: '', filename: '' };
  }
};

export default function SettingsPage() {
  const notifier = useNotifier();
  const navigate = useNavigate();
  const [importMode, setImportMode] = React.useState<ImportMode>('replace');
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [fileInfo, setFileInfo] = React.useState<FileSummary | null>(null);
  const [fileName, setFileName] = React.useState('');
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [confirmImportOpen, setConfirmImportOpen] = React.useState(false);
  const [isBusy, setIsBusy] = React.useState(false);
  const [resetBusy, setResetBusy] = React.useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = React.useState(false);
  const [confirmResetDownloadOpen, setConfirmResetDownloadOpen] = React.useState(false);
  const [syncBusy, setSyncBusy] = React.useState(false);
  const [syncSettings, setSyncSettings] = React.useState<SyncSettings>(
    readStoredSyncSettings,
  );
  const [syncPrefs, setSyncPrefsState] = React.useState(() => getSyncPrefs());
  const [syncRuntime, setSyncRuntime] = React.useState(getSyncState());
  const [autoBackupPrefs, setAutoBackupPrefsState] = React.useState(() => getAutoBackupPrefs());
  const [autoBackupBusy, setAutoBackupBusy] = React.useState(false);
  const [autoBackupRestore, setAutoBackupRestore] = React.useState<string | null>(null);
  const [autoBackupDelete, setAutoBackupDelete] = React.useState<string | null>(null);
  const schemas = useLiveQuery(() => listSchemas(), []) ?? [];
  const views = useLiveQuery(() => db.views.toArray(), []) ?? [];
  const autoBackups = useLiveQuery(
    () => db.autoBackups.orderBy('createdAt').reverse().toArray(),
    [],
  ) ?? [];
  const allNodes = useLiveQuery(() => db.items.toArray(), []) ?? [];
  const nodes = React.useMemo(() => filterActiveNodes(allNodes), [allNodes]);
  const notes = React.useMemo(
    () => nodes.filter((node): node is NoteNode => node.nodeType === 'note'),
    [nodes],
  );
  const tasks = React.useMemo(
    () => buildTaskIndex(notes, getTodayISO()),
    [notes],
  );
  const vaultStats = React.useMemo(
    () => computeVaultStats(nodes, tasks, views, schemas),
    [nodes, tasks, views, schemas],
  );
  const approxBytes = vaultStats.approxBytes;
  const largeVault = approxBytes > LARGE_VAULT_BYTES;
  const schemaUsage = React.useMemo(() => {
    const usage = new Map<string, number>();
    nodes.forEach((node) => {
      if (node.nodeType !== 'folder') {
        return;
      }
      const schemaId =
        node.props && typeof node.props === 'object'
          ? typeof (node.props as Record<string, unknown>).schemaId === 'string'
            ? String((node.props as Record<string, unknown>).schemaId)
            : ''
          : '';
      if (!schemaId) {
        return;
      }
      usage.set(schemaId, (usage.get(schemaId) ?? 0) + 1);
    });
    return usage;
  }, [nodes]);
  const [schemaDialogOpen, setSchemaDialogOpen] = React.useState(false);
  const [schemaDialogMode, setSchemaDialogMode] = React.useState<
    'create' | 'edit' | 'duplicate'
  >('create');
  const [schemaEditing, setSchemaEditing] = React.useState<PropertySchema | null>(null);
  const [schemaDeleteTarget, setSchemaDeleteTarget] =
    React.useState<PropertySchema | null>(null);

  React.useEffect(() => {
    window.localStorage.setItem(SYNC_SETTINGS_KEY, JSON.stringify(syncSettings));
  }, [syncSettings]);

  React.useEffect(() => subscribeSyncState(setSyncRuntime), []);

  const handleExport = async () => {
    setIsBusy(true);
    try {
      await exportVaultJson();
      notifier.success('Backup exportado');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao exportar: ${message}`);
    } finally {
      setIsBusy(false);
    }
  };

  const resetFileState = () => {
    setSelectedFile(null);
    setFileInfo(null);
    setFileName('');
    setFileError(null);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      resetFileState();
      return;
    }

    setSelectedFile(file);
    setFileName(file.name);
    setFileError(null);
    setFileInfo(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const validation = validateVaultBackup(parsed);
      if (!validation.ok) {
        setFileError(validation.error ?? 'Backup invalido.');
        return;
      }
      setFileInfo({ nodeCount: validation.nodeCount });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFileError(`Falha ao ler arquivo: ${message}`);
    }
  };

  const handleImportClick = () => {
    if (!selectedFile || !fileInfo || fileError) {
      return;
    }
    if (importMode === 'replace') {
      setConfirmImportOpen(true);
      return;
    }
    void handleConfirmImport();
  };

  const handleConfirmImport = async () => {
    if (!selectedFile) {
      return;
    }
    setIsBusy(true);
    try {
      const result = await importVaultJson(selectedFile, importMode);
      if (result.mode === 'replace') {
        notifier.success('Import concluido');
      } else {
        notifier.success(
          `Importado: ${result.added} novos, ${result.updated} atualizados`,
        );
      }
      resetFileState();
      navigate('/');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao importar: ${message}`);
    } finally {
      setIsBusy(false);
      setConfirmImportOpen(false);
    }
  };

  const handleReset = async () => {
    setResetBusy(true);
    try {
      await resetLocalData();
      notifier.success('Dados locais apagados');
      navigate('/');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao resetar: ${message}`);
    } finally {
      setResetBusy(false);
      setConfirmResetOpen(false);
    }
  };

  const handleResetAndDownload = async () => {
    if (!canSync) {
      notifier.error('Sync nao configurado.');
      setConfirmResetDownloadOpen(false);
      return;
    }
    setResetBusy(true);
    try {
      await resetLocalData();
      await syncNowManual();
      const latest = getSyncState();
      const message =
        latest.status === 'error'
          ? latest.lastError?.message ?? 'Erro ao sincronizar'
          : 'Sync ok';
      if (latest.status === 'error') {
        notifier.error(message);
      } else {
        notifier.success(message);
      }
      navigate('/');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao baixar do remoto: ${message}`);
    } finally {
      setResetBusy(false);
      setConfirmResetDownloadOpen(false);
    }
  };

  const handleTestConnection = async () => {
    setSyncBusy(true);
    try {
      const result = await testConnection(syncSettings);
      if (result.ok) {
        notifier.success(result.message);
      } else {
        notifier.error(result.message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(message);
    } finally {
      setSyncBusy(false);
    }
  };

  const handleDownloadVault = async () => {
    setSyncBusy(true);
    try {
      const result = await readRemoteVault(syncSettings);
      notifier.info(`Baixado: ${result.contentText.length} caracteres`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(message);
    } finally {
      setSyncBusy(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncBusy(true);
    try {
      await syncNowManual();
      const latest = getSyncState();
      const message =
        latest.status === 'error'
          ? latest.lastError?.message ?? 'Erro ao sincronizar'
          : 'Sync ok';
      if (latest.status === 'error') {
        notifier.error(message);
      } else {
        notifier.success(message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(message);
    } finally {
      setSyncBusy(false);
    }
  };

  const handleAutoSyncToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const enabled = event.target.checked;
    setSyncPrefsState((prev) => ({ ...prev, autoSync: enabled }));
    setAutoSyncEnabled(enabled);
  };

  const handleIntervalChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = Number(event.target.value);
    const next = Number.isFinite(raw)
      ? Math.min(60, Math.max(1, Math.floor(raw)))
      : syncPrefs.intervalMin;
    setSyncPrefsState((prev) => ({ ...prev, intervalMin: next }));
    setIntervalMin(next);
  };

  const handleAutoBackupToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const enabled = event.target.checked;
    const next = { ...autoBackupPrefs, enabled };
    setAutoBackupPrefsState(next);
    setAutoBackupPrefs(next);
  };

  const handleAutoBackupInterval = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = Number(event.target.value);
    const nextValue = Number.isFinite(raw)
      ? Math.min(168, Math.max(1, Math.floor(raw)))
      : autoBackupPrefs.intervalHours;
    const next = { ...autoBackupPrefs, intervalHours: nextValue };
    setAutoBackupPrefsState(next);
    setAutoBackupPrefs(next);
  };

  const handleAutoBackupRetention = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = Number(event.target.value);
    const nextValue = Number.isFinite(raw)
      ? Math.min(50, Math.max(1, Math.floor(raw)))
      : autoBackupPrefs.retention;
    const next = { ...autoBackupPrefs, retention: nextValue };
    setAutoBackupPrefsState(next);
    setAutoBackupPrefs(next);
  };

  const handleRunAutoBackup = async () => {
    setAutoBackupBusy(true);
    try {
      await runAutoBackupNow();
      notifier.success('Auto-backup criado');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao criar auto-backup: ${message}`);
    } finally {
      setAutoBackupBusy(false);
    }
  };

  const handleDownloadAutoBackup = (id: string) => {
    const backup = autoBackups.find((entry) => entry.id === id);
    if (!backup) {
      return;
    }
    try {
      downloadAutoBackup(backup);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao baixar backup: ${message}`);
    }
  };

  const handleConfirmRestoreBackup = async () => {
    if (!autoBackupRestore) {
      return;
    }
    const backup = autoBackups.find((entry) => entry.id === autoBackupRestore);
    if (!backup) {
      setAutoBackupRestore(null);
      return;
    }
    setAutoBackupBusy(true);
    try {
      await restoreAutoBackup(backup);
      notifier.success('Backup restaurado');
      navigate('/');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao restaurar backup: ${message}`);
    } finally {
      setAutoBackupBusy(false);
      setAutoBackupRestore(null);
    }
  };

  const handleConfirmDeleteBackup = async () => {
    if (!autoBackupDelete) {
      return;
    }
    setAutoBackupBusy(true);
    try {
      await deleteAutoBackup(autoBackupDelete);
      notifier.success('Backup apagado');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao apagar backup: ${message}`);
    } finally {
      setAutoBackupBusy(false);
      setAutoBackupDelete(null);
    }
  };

  const itemCount = fileInfo?.nodeCount ?? 0;
  const canSync = Boolean(syncSettings.gistId.trim() && syncSettings.token.trim());
  const syncStatusLabel =
    syncRuntime.status === 'syncing'
      ? 'Sincronizando'
      : syncRuntime.status === 'synced'
        ? 'Sincronizado'
        : syncRuntime.status === 'offline'
          ? 'Offline'
          : syncRuntime.status === 'error'
            ? 'Erro'
            : 'Aguardando';
  const buildDate = new Date(BUILD_TIME);
  const buildTimeLabel = Number.isFinite(buildDate.getTime())
    ? format(buildDate, 'yyyy-MM-dd HH:mm')
    : BUILD_TIME;
  const hostLabel = typeof window !== 'undefined' ? window.location.host : '-';
  const versionLabel = `v-${GIT_SHA}`;
  const lastAutoBackupAt = getLastAutoBackupAt();

  const handleReload = () => {
    if (typeof window === 'undefined') {
      return;
    }
    window.location.reload();
  };

  const handleForceReload = async () => {
    if (typeof window === 'undefined') {
      return;
    }
    if ('serviceWorker' in navigator) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((registration) => registration.unregister()));
      } catch {
        // ignore
      }
    }
    const url = new URL(window.location.href);
    url.searchParams.set('v', Date.now().toString());
    window.location.replace(url.toString());
  };

  const handleCreateSchema = () => {
    setSchemaEditing(null);
    setSchemaDialogMode('create');
    setSchemaDialogOpen(true);
  };

  const handleEditSchema = (schema: PropertySchema) => {
    setSchemaEditing(schema);
    setSchemaDialogMode('edit');
    setSchemaDialogOpen(true);
  };

  const handleDuplicateSchema = (schema: PropertySchema) => {
    setSchemaEditing(schema);
    setSchemaDialogMode('duplicate');
    setSchemaDialogOpen(true);
  };

  const handleSaveSchema = async (schema: PropertySchema) => {
    try {
      await upsertSchema(schema);
      notifier.success('Schema salvo');
      setSchemaDialogOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao salvar schema: ${message}`);
    }
  };

  const handleDeleteSchemaRequest = (schema: PropertySchema) => {
    if (schema.id === 'global') {
      notifier.error('O schema global nao pode ser removido.');
      return;
    }
    const usageCount = schemaUsage.get(schema.id) ?? 0;
    if (usageCount > 0) {
      notifier.error(`Schema em uso por ${usageCount} pasta(s).`);
      return;
    }
    setSchemaDeleteTarget(schema);
  };

  const handleConfirmDeleteSchema = async () => {
    if (!schemaDeleteTarget) {
      return;
    }
    try {
      await deleteSchema(schemaDeleteTarget.id);
      notifier.success('Schema removido');
      setSchemaDeleteTarget(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao remover schema: ${message}`);
    }
  };

  return (
    <Stack spacing={3}>
      <Typography variant="h4" component="h1">
        Configuracoes / Backup
      </Typography>

      <Card>
        <CardHeader title="Backup" />
        <CardContent>
          <Stack spacing={2}>
            <Typography color="text.secondary" variant="body2">
              Exporta o vault completo em JSON (sem token de sync).
            </Typography>
            <Button variant="contained" onClick={handleExport} disabled={isBusy || resetBusy}>
              Exportar backup (JSON)
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Saude do vault" />
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="body2" color="text.secondary">
              {vaultStats.noteCount} notas, {vaultStats.folderCount} pastas, {vaultStats.openTasks} tarefas abertas.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Tamanho aproximado: {formatBytes(approxBytes)}
            </Typography>
            {largeVault && (
              <Alert severity="warning">
                Vault grande: sincronizacao e buscas podem ficar mais lentas.
              </Alert>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Auto-backup local" />
        <CardContent>
          <Stack spacing={2}>
            <Typography color="text.secondary" variant="body2">
              O auto-backup roda apenas com o app aberto, respeitando o intervalo.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
              <FormControlLabel
                control={
                  <Switch
                    checked={autoBackupPrefs.enabled}
                    onChange={handleAutoBackupToggle}
                  />
                }
                label="Auto-backup habilitado"
              />
              <TextField
                label="Intervalo (horas)"
                type="number"
                size="small"
                value={autoBackupPrefs.intervalHours}
                onChange={handleAutoBackupInterval}
                inputProps={{ min: 1, max: 168 }}
                sx={{ width: 160 }}
                disabled={!autoBackupPrefs.enabled}
              />
              <TextField
                label="Retencao"
                type="number"
                size="small"
                value={autoBackupPrefs.retention}
                onChange={handleAutoBackupRetention}
                inputProps={{ min: 1, max: 50 }}
                sx={{ width: 140 }}
                disabled={!autoBackupPrefs.enabled}
              />
              <Button
                variant="outlined"
                onClick={handleRunAutoBackup}
                disabled={autoBackupBusy}
              >
                Criar agora
              </Button>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Ultimo auto-backup:{' '}
              {lastAutoBackupAt
                ? format(new Date(lastAutoBackupAt), 'yyyy-MM-dd HH:mm')
                : 'Nunca'}
            </Typography>
            {autoBackups.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Nenhum auto-backup armazenado ainda.
              </Typography>
            ) : (
              <Stack spacing={1}>
                {autoBackups.map((backup) => (
                  <Stack
                    key={backup.id}
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1}
                    alignItems={{ sm: 'center' }}
                    sx={{ border: '1px solid', borderColor: 'divider', p: 1.5, borderRadius: 1 }}
                  >
                    <Stack spacing={0.5}>
                      <Typography variant="subtitle2">
                        {format(new Date(backup.createdAt), 'yyyy-MM-dd HH:mm')}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {formatBytes(backup.bytes)}
                      </Typography>
                    </Stack>
                    <Stack direction="row" spacing={1} sx={{ ml: { sm: 'auto' } }}>
                      <Button size="small" onClick={() => handleDownloadAutoBackup(backup.id)}>
                        Baixar
                      </Button>
                      <Button
                        size="small"
                        color="warning"
                        onClick={() => setAutoBackupRestore(backup.id)}
                        disabled={autoBackupBusy}
                      >
                        Restaurar
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        onClick={() => setAutoBackupDelete(backup.id)}
                        disabled={autoBackupBusy}
                      >
                        Apagar
                      </Button>
                    </Stack>
                  </Stack>
                ))}
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Card id="schemas">
        <CardHeader
          title="Schemas"
          action={
            <Button variant="outlined" onClick={handleCreateSchema}>
              Novo schema
            </Button>
          }
        />
        <CardContent>
          <Stack spacing={2}>
            <Typography color="text.secondary" variant="body2">
              Defina propriedades e defaults por pasta. O schema global sempre existe.
            </Typography>
            {schemas.length === 0 ? (
              <Typography color="text.secondary" variant="body2">
                Nenhum schema adicional criado.
              </Typography>
            ) : (
              <Stack spacing={2}>
                {schemas.map((schema) => {
                  const usageCount = schemaUsage.get(schema.id) ?? 0;
                  const propCount = Array.isArray(schema.properties)
                    ? schema.properties.length
                    : 0;
                  return (
                    <Stack
                      key={schema.id}
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={2}
                      alignItems={{ sm: 'center' }}
                      sx={{ border: '1px solid', borderColor: 'divider', p: 2, borderRadius: 1 }}
                    >
                      <Stack spacing={0.5}>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <Typography variant="subtitle1">
                            {schema.name || schema.id}
                          </Typography>
                          {schema.id === 'global' && <Chip size="small" label="Global" />}
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                          {propCount} propriedade(s)
                        </Typography>
                        {usageCount > 0 && (
                          <Typography variant="body2" color="text.secondary">
                            Usado por {usageCount} pasta(s)
                          </Typography>
                        )}
                      </Stack>
                      <Stack direction="row" spacing={1} sx={{ ml: { sm: 'auto' } }}>
                        <Button size="small" onClick={() => handleEditSchema(schema)}>
                          Editar
                        </Button>
                        <Button size="small" onClick={() => handleDuplicateSchema(schema)}>
                          Duplicar
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          onClick={() => handleDeleteSchemaRequest(schema)}
                        >
                          Excluir
                        </Button>
                      </Stack>
                    </Stack>
                  );
                })}
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Sincronizacao (Gist)" />
        <CardContent>
          <Stack spacing={2}>
            <Typography color="text.secondary" variant="body2">
              Informe o Gist ID e o token pessoal para acessar o vault remoto.
            </Typography>
            <TextField
              label="Gist ID"
              value={syncSettings.gistId}
              onChange={(event) =>
                setSyncSettings((prev) => ({ ...prev, gistId: event.target.value }))
              }
              fullWidth
            />
            <TextField
              label="Token"
              type="password"
              value={syncSettings.token}
              onChange={(event) =>
                setSyncSettings((prev) => ({ ...prev, token: event.target.value }))
              }
              fullWidth
            />
            <TextField
              label="Arquivo"
              placeholder="vault.json"
              value={syncSettings.filename ?? ''}
              onChange={(event) =>
                setSyncSettings((prev) => ({
                  ...prev,
                  filename: event.target.value,
                }))
              }
              helperText="Opcional: padrao e vault.json"
              fullWidth
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
              <FormControlLabel
                control={
                  <Switch
                    checked={syncPrefs.autoSync}
                    onChange={handleAutoSyncToggle}
                  />
                }
                label="Auto-sync"
              />
              <TextField
                label="Intervalo (min)"
                type="number"
                size="small"
                value={syncPrefs.intervalMin}
                onChange={handleIntervalChange}
                inputProps={{ min: 1, max: 60 }}
                sx={{ width: 140 }}
                disabled={!syncPrefs.autoSync}
              />
            </Stack>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" onClick={handleTestConnection} disabled={syncBusy}>
                Testar conexao
              </Button>
              <Button variant="contained" onClick={handleDownloadVault} disabled={syncBusy}>
                Baixar vault agora
              </Button>
              <Button variant="contained" color="primary" onClick={handleSyncNow} disabled={syncBusy}>
                Sync agora
              </Button>
            </Stack>
            <Typography color="text.secondary" variant="body2">
              Status: {syncStatusLabel} | Ultimo sync:{' '}
              {syncRuntime.lastSyncAt
                ? format(new Date(syncRuntime.lastSyncAt), 'yyyy-MM-dd HH:mm')
                : 'Nunca'}
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Importar backup" />
        <CardContent>
          <Stack spacing={2}>
            <Typography color="text.secondary" variant="body2">
              Selecione um arquivo .json para restaurar seus dados.
            </Typography>
            <Button variant="outlined" component="label" disabled={isBusy || resetBusy}>
              Selecionar arquivo .json
              <input type="file" accept=".json" hidden onChange={handleFileChange} />
            </Button>
            {fileName && (
              <Typography variant="body2">Arquivo: {fileName}</Typography>
            )}
            {fileError && <Alert severity="error">{fileError}</Alert>}
            {fileInfo && !fileError && (
              <Alert severity="info">
                Backup valido com {itemCount} item{itemCount === 1 ? '' : 's'}.
              </Alert>
            )}
            <FormControl>
              <RadioGroup
                row
                value={importMode}
                onChange={(event) => setImportMode(event.target.value as ImportMode)}
              >
                <FormControlLabel
                  value="replace"
                  control={<Radio />}
                  label="Substituir tudo (REPLACE)"
                />
                <FormControlLabel
                  value="merge"
                  control={<Radio />}
                  label="Mesclar (MERGE)"
                />
              </RadioGroup>
            </FormControl>
            <Button
              variant="contained"
              color="primary"
              disabled={!selectedFile || !fileInfo || Boolean(fileError) || isBusy || resetBusy}
              onClick={handleImportClick}
            >
              Importar
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Ferramentas" />
        <CardContent>
          <Stack spacing={2}>
            <Typography color="text.secondary" variant="body2">
              Use com cuidado: estas acoes apagam dados locais.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button
                variant="outlined"
                color="error"
                onClick={() => setConfirmResetOpen(true)}
                disabled={isBusy || resetBusy}
              >
                Resetar dados locais
              </Button>
              <Button
                variant="contained"
                color="error"
                onClick={() => setConfirmResetDownloadOpen(true)}
                disabled={isBusy || resetBusy || !canSync}
              >
                Resetar e baixar do remoto
              </Button>
            </Stack>
            {!canSync && (
              <Typography color="text.secondary" variant="body2">
                Configure o sync para habilitar o reset com download remoto.
              </Typography>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Sobre" />
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="body2" color="text.secondary">
              Versao: {versionLabel}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Build: {buildTimeLabel}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Ambiente: {MODE}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Host: {hostLabel}
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button variant="outlined" onClick={handleReload}>
                Recarregar
              </Button>
              <Button variant="contained" onClick={handleForceReload}>
                Forcar atualizacao
              </Button>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Se o celular estiver mostrando uma versao antiga, use "Forcar atualizacao" e
              reinstale o atalho se necessario.
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmImportOpen}
        title="Confirmar importacao"
        description={
          <>
            Isso apaga seus dados locais e substitui pelo arquivo. Continuar?
            <br />
            Itens no arquivo: {itemCount}
          </>
        }
        confirmLabel="Importar"
        onConfirm={handleConfirmImport}
        onClose={() => setConfirmImportOpen(false)}
        isLoading={isBusy}
      />
      <ConfirmDialog
        open={confirmResetOpen}
        title="Confirmar reset local"
        description="Isso apaga seus dados locais e nao pode ser desfeito."
        confirmLabel="Resetar dados"
        confirmColor="error"
        onConfirm={handleReset}
        onClose={() => setConfirmResetOpen(false)}
        isLoading={resetBusy}
      />
      <ConfirmDialog
        open={confirmResetDownloadOpen}
        title="Resetar e baixar do remoto?"
        description="Isso apaga dados locais e baixa o vault do remoto."
        confirmLabel="Resetar e baixar"
        confirmColor="error"
        onConfirm={handleResetAndDownload}
        onClose={() => setConfirmResetDownloadOpen(false)}
        isLoading={resetBusy}
      />
      <ConfirmDialog
        open={Boolean(autoBackupRestore)}
        title="Restaurar backup local?"
        description="Isso substitui seus dados locais pelo backup selecionado."
        confirmLabel="Restaurar"
        confirmColor="warning"
        onConfirm={handleConfirmRestoreBackup}
        onClose={() => setAutoBackupRestore(null)}
        isLoading={autoBackupBusy}
      />
      <ConfirmDialog
        open={Boolean(autoBackupDelete)}
        title="Apagar backup local?"
        description="Essa acao remove o backup salvo localmente."
        confirmLabel="Apagar"
        confirmColor="error"
        onConfirm={handleConfirmDeleteBackup}
        onClose={() => setAutoBackupDelete(null)}
        isLoading={autoBackupBusy}
      />
      <SchemaEditorDialog
        open={schemaDialogOpen}
        mode={schemaDialogMode}
        initialSchema={schemaEditing}
        onClose={() => setSchemaDialogOpen(false)}
        onSave={handleSaveSchema}
      />
      <ConfirmDialog
        open={Boolean(schemaDeleteTarget)}
        title="Excluir schema?"
        description="Essa acao remove o schema localmente."
        confirmLabel="Excluir"
        confirmColor="error"
        onConfirm={handleConfirmDeleteSchema}
        onClose={() => setSchemaDeleteTarget(null)}
      />
    </Stack>
  );
}
