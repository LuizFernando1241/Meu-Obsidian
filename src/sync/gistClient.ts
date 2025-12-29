import type { GistResponse, RemoteVaultRead, SyncSettings } from './types';

const GIST_API = 'https://api.github.com/gists';
const DEFAULT_FILENAME = 'vault.json';

const DEFAULT_VAULT_TEXT = JSON.stringify(
  { schema: 1, items: [], tombstones: [], views: [], schemas: [] },
  null,
  2,
);

const buildHeaders = (token: string): HeadersInit => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'Content-Type': 'application/json',
});

const fetchJson = async <T>(
  url: string,
  opts: RequestInit,
): Promise<{ json: T; etag?: string }> => {
  const response = await fetch(url, opts);
  const etag = response.headers.get('etag') ?? undefined;

  if (!response.ok) {
    let message = `Erro HTTP ${response.status}`;
    if (response.status === 401) {
      message = 'Token invalido ou sem permissao para gist';
    } else if (response.status === 404) {
      message = 'Gist nao encontrado (gistId errado?)';
    } else if (response.status === 403) {
      message = 'Acesso negado ou rate limit';
    }

    let detail = '';
    try {
      detail = await response.text();
    } catch {
      detail = '';
    }
    if (detail) {
      message = `${message} (${detail.slice(0, 160)})`;
    }
    throw new Error(message);
  }

  const json = (await response.json()) as T;
  return { json, etag };
};

export const readRemoteVault = async (
  settings: SyncSettings,
): Promise<RemoteVaultRead> => {
  const gistId = settings.gistId?.trim();
  const token = settings.token?.trim();
  if (!gistId || !token) {
    throw new Error('Informe gistId e token antes de sincronizar');
  }

  const filename = settings.filename?.trim() || DEFAULT_FILENAME;
  const { json: gist, etag } = await fetchJson<GistResponse>(
    `${GIST_API}/${gistId}`,
    { headers: buildHeaders(token) },
  );

  const file = gist.files?.[filename];
  if (!file) {
    return {
      contentText: DEFAULT_VAULT_TEXT,
      etag,
      remoteUpdatedAt: gist.updated_at,
    };
  }

  if (file.truncated) {
    const response = await fetch(file.raw_url, {
      headers: buildHeaders(token),
    });
    if (!response.ok) {
      throw new Error(
        `Falha ao baixar conteudo completo do cofre (raw_url). HTTP ${response.status}`,
      );
    }
    const contentText = await response.text();
    return {
      contentText,
      etag,
      remoteUpdatedAt: gist.updated_at,
    };
  }

  return {
    contentText: file.content ?? '',
    etag,
    remoteUpdatedAt: gist.updated_at,
  };
};

export const writeRemoteVault = async (
  settings: SyncSettings,
  contentText: string,
): Promise<void> => {
  const gistId = settings.gistId?.trim();
  const token = settings.token?.trim();
  if (!gistId || !token) {
    throw new Error('Informe gistId e token antes de sincronizar');
  }
  const filename = settings.filename?.trim() || DEFAULT_FILENAME;

  await fetchJson<GistResponse>(`${GIST_API}/${gistId}`, {
    method: 'PATCH',
    headers: buildHeaders(token),
    body: JSON.stringify({
      files: {
        [filename]: { content: contentText },
      },
    }),
  });
};

export const testConnection = async (
  settings: SyncSettings,
): Promise<{ ok: boolean; message: string }> => {
  try {
    await readRemoteVault(settings);
    return { ok: true, message: 'Conectado ao Gist' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message };
  }
};

export { GIST_API, buildHeaders };
