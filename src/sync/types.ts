export type { Tombstone } from '../data/types';

export type SyncSettings = {
  gistId: string;
  token: string;
  filename?: string;
};

export type GistFile = {
  filename: string;
  raw_url: string;
  size: number;
  truncated?: boolean;
  content?: string;
};

export type GistResponse = {
  id: string;
  files: Record<string, GistFile>;
  updated_at?: string;
};

export type RemoteVaultRead = {
  contentText: string;
  etag?: string;
  remoteUpdatedAt?: string;
};
