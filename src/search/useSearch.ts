import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';

import { filterActiveNodes } from '../data/deleted';
import { db } from '../data/db';
import type { NodeType, PropertySchema } from '../data/types';
import { searchIndexService } from './indexService';
import { buildPathCache } from '../vault/pathCache';

export type SearchHit = {
  id: string;
  title: string;
  type: NodeType;
  updatedAt: number;
  pathText?: string;
  score?: number;
};

export type TypeFilter = 'all' | NodeType;

const normalizeSnippet = (text: string) => text.replace(/\s+/g, ' ').trim();
const normalizeFilterText = (text: string) =>
  text.replace(/\s+/g, ' ').trim().toLowerCase();

type SearchTokens = {
  text: string;
  path?: string;
  type?: NodeType;
  scope?: 'title' | 'content';
};

const parseSearchTokens = (raw: string): SearchTokens => {
  const tokensRegex = /\b(path|type|in):(?:"([^"]+)"|([^\s]+))/gi;
  let match: RegExpExecArray | null;
  let pathValue: string | undefined;
  let typeValue: NodeType | undefined;
  let scopeValue: 'title' | 'content' | undefined;

  while ((match = tokensRegex.exec(raw)) !== null) {
    const key = match[1]?.toLowerCase();
    const value = match[2] ?? match[3] ?? '';
    if (key === 'path' && value) {
      pathValue = value;
    }
    if (key === 'type') {
      const normalized = value.toLowerCase();
      if (normalized === 'note' || normalized === 'folder') {
        typeValue = normalized as NodeType;
      }
    }
    if (key === 'in') {
      const normalized = value.toLowerCase();
      if (normalized === 'title' || normalized === 'content') {
        scopeValue = normalized as 'title' | 'content';
      }
    }
  }

  const text = raw.replace(tokensRegex, ' ').replace(/\s+/g, ' ').trim();

  return {
    text,
    path: pathValue,
    type: typeValue,
    scope: scopeValue,
  };
};

const getDisplayPath = (pathText?: string) => {
  if (!pathText) {
    return '';
  }
  const parts = pathText.split('/').map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) {
    return 'Raiz';
  }
  return parts.slice(0, -1).join(' / ');
};

export const useSearchIndex = () => {
  const items = useLiveQuery(() => db.items.toArray(), []);
  const schema = useLiveQuery(() => db.schemas.get('global') as Promise<PropertySchema | undefined>, []);
  const activeItems = React.useMemo(
    () => (items ? filterActiveNodes(items) : undefined),
    [items],
  );
  const pathCache = React.useMemo(
    () => (activeItems ? buildPathCache(activeItems) : new Map()),
    [activeItems],
  );
  const indexedKeys = React.useMemo(() => {
    if (!schema || !Array.isArray(schema.properties)) {
      return undefined;
    }
    return schema.properties
      .filter((property) => property.indexed)
      .map((property) => property.key);
  }, [schema]);

  const debounceRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!activeItems) {
      return;
    }
    searchIndexService.setIndexedKeys(indexedKeys);
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      if (!searchIndexService.isReady()) {
        searchIndexService.init(activeItems);
      } else {
        searchIndexService.applyDelta(activeItems);
      }
      debounceRef.current = null;
    }, 200);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [activeItems, indexedKeys]);

  const search = React.useCallback(
    (query: string, typeFilter: TypeFilter = 'all'): SearchHit[] => {
      const parsed = parseSearchTokens(query);
      const textQuery = parsed.text;
      const normalizedText = normalizeFilterText(textQuery);
      const effectiveType = parsed.type ?? (typeFilter === 'all' ? undefined : typeFilter);
      const pathNeedle = parsed.path ? normalizeFilterText(parsed.path) : '';
      const scope = parsed.scope;

      if (!activeItems || (!textQuery && !pathNeedle && !effectiveType)) {
        return [] as SearchHit[];
      }

      let baseResults: Array<{ id: string; score?: number }> = [];

      if (textQuery) {
        baseResults = searchIndexService.search(
          textQuery,
          effectiveType ?? 'all',
          80,
        );
      } else {
        baseResults = activeItems
          .filter((item) => (effectiveType ? item.nodeType === effectiveType : true))
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .map((item) => ({ id: item.id }));
      }

      const hits: SearchHit[] = [];

      baseResults.forEach((result) => {
        const doc = searchIndexService.getDocById(String(result.id));
        if (!doc) {
          return;
        }
        if (effectiveType && doc.type !== effectiveType) {
          return;
        }

        if (normalizedText) {
          const titleMatch = normalizeFilterText(doc.title).includes(normalizedText);
          const contentMatch = normalizeFilterText(doc.contentText).includes(normalizedText);
          if (scope === 'title' && !titleMatch) {
            return;
          }
          if (scope === 'content' && !contentMatch) {
            return;
          }
          if (!scope && !titleMatch && !contentMatch) {
            return;
          }
        }

        if (pathNeedle) {
          const pathInfo = pathCache.get(String(result.id));
          const normalizedPath = normalizeFilterText(pathInfo?.pathText ?? '');
          if (!normalizedPath.includes(pathNeedle)) {
            return;
          }
        }

        const pathInfo = pathCache.get(String(result.id));

        hits.push({
          id: String(result.id),
          title: doc.title,
          type: doc.type,
          updatedAt: doc.updatedAt,
          pathText: getDisplayPath(pathInfo?.pathText),
          score: typeof result.score === 'number' ? result.score : undefined,
        });
      });

      return hits.slice(0, 50);
    },
    [activeItems, pathCache],
  );

  const getSnippet = React.useCallback((id: string, query: string) => {
    const doc = searchIndexService.getDocById(id);
    if (!doc) {
      return '';
    }

    const parsed = parseSearchTokens(query);
    const needle = normalizeFilterText(parsed.text);
    const baseText = doc.contentText || doc.tagsText || doc.title;
    const normalized = normalizeSnippet(baseText);
    if (!normalized) {
      return '';
    }

    if (!needle) {
      return normalized.slice(0, 120);
    }

    const haystack = normalized.toLowerCase();
    const indexOf = haystack.indexOf(needle);
    if (indexOf === -1) {
      return normalized.slice(0, 120);
    }

    const start = Math.max(0, indexOf - 40);
    const end = Math.min(normalized.length, indexOf + needle.length + 60);
    const prefix = start > 0 ? '...' : '';
    const suffix = end < normalized.length ? '...' : '';
    return `${prefix}${normalized.slice(start, end)}${suffix}`;
  }, []);

  return {
    ready: Boolean(activeItems),
    search,
    getSnippet,
  };
};
