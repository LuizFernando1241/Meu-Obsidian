import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';

import { db } from '../data/db';
import type { ItemType } from '../data/types';
import { searchIndexService } from './indexService';

export type SearchHit = {
  id: string;
  title: string;
  type: ItemType;
  updatedAt: number;
  score?: number;
};

export type TypeFilter = 'all' | ItemType;

const normalizeSnippet = (text: string) => text.replace(/\s+/g, ' ').trim();

export const useSearchIndex = () => {
  const items = useLiveQuery(() => db.items.toArray(), []);

  const debounceRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!items) {
      return;
    }
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      if (!searchIndexService.isReady()) {
        searchIndexService.init(items);
      } else {
        searchIndexService.applyDelta(items);
      }
      debounceRef.current = null;
    }, 200);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [items]);

  const search = React.useCallback(
    (query: string, typeFilter: TypeFilter = 'all'): SearchHit[] => {
      if (!query.trim()) {
        return [] as SearchHit[];
      }

      const results = searchIndexService.search(query, typeFilter, 50);
      const hits: SearchHit[] = [];

      results.forEach((result) => {
        const doc = searchIndexService.getDocById(String(result.id));
        if (!doc) {
          return;
        }
        hits.push({
          id: String(result.id),
          title: doc.title,
          type: doc.type,
          updatedAt: doc.updatedAt,
          score: typeof result.score === 'number' ? result.score : undefined,
        });
      });

      return hits;
    },
    [],
  );

  const getSnippet = React.useCallback(
    (id: string, query: string) => {
      const doc = searchIndexService.getDocById(id);
      if (!doc) {
        return '';
      }

      const baseText = doc.contentText || doc.tagsText || doc.title;
      const normalized = normalizeSnippet(baseText);
      if (!normalized) {
        return '';
      }

      const needle = query.trim().toLowerCase();
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
    },
    [],
  );

  return {
    ready: Boolean(items),
    search,
    getSnippet,
  };
};
