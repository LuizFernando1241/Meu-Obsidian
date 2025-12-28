import type { PathInfo } from '../vault/pathCache';

const normalizeSegment = (value: string) => value.replace(/\s+/g, ' ').trim();

export const getTaskNotePath = (pathInfo?: PathInfo): string => {
  if (!pathInfo?.pathText) {
    return 'Raiz';
  }
  const parts = pathInfo.pathText
    .split('/')
    .map((part) => normalizeSegment(part))
    .filter(Boolean);
  if (parts.length <= 1) {
    return 'Raiz';
  }
  return parts.slice(0, -1).join(' / ');
};
