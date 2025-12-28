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
import { useNavigate } from 'react-router-dom';

import { BUILD_TIME, GIT_SHA, MODE } from '../app/buildInfo';
import ConfirmDialog from '../components/ConfirmDialog';
import { useNotifier } from '../components/Notifier';
import {
  exportVaultJson,
  importVaultJson,
  resetLocalData,
  validateVaultBackup,
} from '../data/backup';
import { readRemoteVault, testConnection } from '../sync/gistClient';
import { syncNowManual, setAutoSyncEnabled, setIntervalMin } from '../sync/syncService';
import { getSyncPrefs, getSyncState, subscribeSyncState } from '../sync/syncState';
import type { SyncSettings } from '../sync/types';

type ImportMode = 'replace' | 'merge';
type FileSummary = {
  nodeCount: number;
};

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
          ? latest.lastError ?? 'Erro ao sincronizar'
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
    const next = Number.isFinite(raw)
      ? Math.min(60, Math.max(1, Math.floor(raw)))
      : syncPrefs.intervalMin;
    setSyncPrefsState((prev) => ({ ...prev, intervalMin: next }));
    setIntervalMin(next);
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
    </Stack>
  );
}
