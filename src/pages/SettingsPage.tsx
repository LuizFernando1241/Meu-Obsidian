import React from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
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

import ConfirmDialog from '../components/ConfirmDialog';
import { useNotifier } from '../components/Notifier';
import {
  downloadJson,
  exportAll,
  importMerge,
  importReplaceAll,
  validateBackup,
  type BackupPayload,
} from '../data/backup';
import { wipeAll } from '../data/repo';
import { readRemoteVault, testConnection } from '../sync/gistClient';
import { syncNowManual, setAutoSyncEnabled, setIntervalMin } from '../sync/syncService';
import { getSyncPrefs, getSyncState, subscribeSyncState } from '../sync/syncState';
import type { SyncSettings } from '../sync/types';

type ImportMode = 'replace' | 'merge';

const SYNC_SETTINGS_KEY = 'mf_sync_settings';

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
  const [importMode, setImportMode] = React.useState<ImportMode>('replace');
  const [payload, setPayload] = React.useState<BackupPayload | null>(null);
  const [fileName, setFileName] = React.useState('');
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [confirmImportOpen, setConfirmImportOpen] = React.useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = React.useState(false);
  const [isBusy, setIsBusy] = React.useState(false);
  const [syncBusy, setSyncBusy] = React.useState(false);
  const [syncSettings, setSyncSettings] = React.useState<SyncSettings>(
    readStoredSyncSettings,
  );
  const [syncPrefs, setSyncPrefsState] = React.useState(() => getSyncPrefs());
  const [syncRuntime, setSyncRuntime] = React.useState(getSyncState());

  React.useEffect(() => {
    window.localStorage.setItem(SYNC_SETTINGS_KEY, JSON.stringify(syncSettings));
  }, [syncSettings]);

  React.useEffect(() => subscribeSyncState(setSyncRuntime), []);

  const handleExport = async () => {
    setIsBusy(true);
    try {
      const data = await exportAll();
      const timestamp = format(new Date(), 'yyyyMMdd-HHmm');
      const filename = `mecflux-personal-os-backup-${timestamp}.json`;
      downloadJson(data, filename);
      notifier.success('Backup exportado');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao exportar: ${message}`);
    } finally {
      setIsBusy(false);
    }
  };

  const resetFileState = () => {
    setPayload(null);
    setFileName('');
    setFileError(null);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      resetFileState();
      return;
    }

    setFileName(file.name);
    setFileError(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BackupPayload;
      const validation = validateBackup(parsed);
      if (!validation.ok) {
        setPayload(null);
        setFileError(validation.error ?? 'Backup invalido.');
        return;
      }
      setPayload(parsed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPayload(null);
      setFileError(`Falha ao ler arquivo: ${message}`);
    }
  };

  const handleConfirmImport = async () => {
    if (!payload) {
      return;
    }
    setIsBusy(true);
    try {
      if (importMode === 'replace') {
        await importReplaceAll(payload);
        notifier.success('Backup restaurado');
      } else {
        const result = await importMerge(payload);
        notifier.success(
          `Importado: ${result.added} novos, ${result.updated} atualizados`,
        );
      }
      resetFileState();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao importar: ${message}`);
    } finally {
      setIsBusy(false);
      setConfirmImportOpen(false);
    }
  };

  const handleReset = async () => {
    setIsBusy(true);
    try {
      await wipeAll();
      notifier.success('Banco resetado');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao resetar: ${message}`);
    } finally {
      setIsBusy(false);
      setConfirmResetOpen(false);
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
          ? latest.lastError ?? 'Erro ao sincronizar'
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
    const next = Number.isFinite(raw) ? Math.min(60, Math.max(1, Math.floor(raw))) : syncPrefs.intervalMin;
    setSyncPrefsState((prev) => ({ ...prev, intervalMin: next }));
    setIntervalMin(next);
  };

  const itemCount = payload?.items.length ?? 0;
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
              Exporta todos os itens (notas, tarefas, projetos, tags e links).
            </Typography>
            <Button variant="contained" onClick={handleExport} disabled={isBusy}>
              Exportar JSON
            </Button>
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
              {syncRuntime.lastSyncAt ? format(new Date(syncRuntime.lastSyncAt), 'yyyy-MM-dd HH:mm') : 'Nunca'}
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Restaurar" />
        <CardContent>
          <Stack spacing={2}>
            <Typography color="text.secondary" variant="body2">
              Selecione um arquivo .json para restaurar seus dados.
            </Typography>
            <Button variant="outlined" component="label" disabled={isBusy}>
              Selecionar arquivo
              <input type="file" accept=".json" hidden onChange={handleFileChange} />
            </Button>
            {fileName && (
              <Typography variant="body2">Arquivo: {fileName}</Typography>
            )}
            {fileError && <Alert severity="error">{fileError}</Alert>}
            {payload && !fileError && (
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
                  label="Substituir tudo (recomendado)"
                />
                <FormControlLabel
                  value="merge"
                  control={<Radio />}
                  label="Mesclar (manter existentes)"
                />
              </RadioGroup>
            </FormControl>
            <Button
              variant="contained"
              color="primary"
              disabled={!payload || Boolean(fileError) || isBusy}
              onClick={() => setConfirmImportOpen(true)}
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
              Use com cuidado: esta acao apaga todos os dados locais.
            </Typography>
            <Button
              variant="outlined"
              color="error"
              onClick={() => setConfirmResetOpen(true)}
              disabled={isBusy}
            >
              Resetar banco
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmImportOpen}
        title="Confirmar importacao"
        description={
          <>
            {importMode === 'replace'
              ? 'Isso vai substituir todos os itens atuais.'
              : 'Isso vai mesclar os itens com base no updatedAt.'}
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
        title="Confirmar reset"
        description="Esta acao nao pode ser desfeita."
        confirmLabel="Resetar"
        confirmColor="error"
        onConfirm={handleReset}
        onClose={() => setConfirmResetOpen(false)}
        isLoading={isBusy}
      />
    </Stack>
  );
}
