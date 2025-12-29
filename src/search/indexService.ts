import MiniSearch from 'minisearch';

import type { Node } from '../data/types';
import { buildIndex, itemToDoc, type SearchDoc } from './searchIndex';

export class SearchIndexService {
  private index: MiniSearch<SearchDoc> | null = null;
  private docsById = new Map<string, SearchDoc>();
  private revById = new Map<string, number>();
  private ready = false;
  private indexedKeys: string[] | undefined = undefined;

  setIndexedKeys(keys?: string[]) {
    const next = keys ? [...keys] : undefined;
    const prev = this.indexedKeys;
    const isSame =
      (!prev && !next) ||
      (prev &&
        next &&
        prev.length === next.length &&
        prev.every((value, index) => value === next[index]));
    if (isSame) {
      return;
    }
    this.indexedKeys = next;
    this.ready = false;
  }

  init(items: Node[]) {
    const docs = items.map((item) => itemToDoc(item, this.indexedKeys));
    this.index = buildIndex(docs);
    this.docsById = new Map(docs.map((doc) => [doc.id, doc]));
    this.revById = new Map(items.map((item) => [item.id, item.rev ?? 1]));
    this.ready = true;
  }

  applyDelta(items: Node[]) {
    if (!this.index || !this.ready) {
      this.init(items);
      return;
    }

    const incomingById = new Map(items.map((item) => [item.id, item]));
    const removedIds: string[] = [];
    const newItems: Node[] = [];
    const changedItems: Node[] = [];

    this.revById.forEach((_, id) => {
      if (!incomingById.has(id)) {
        removedIds.push(id);
      }
    });

    items.forEach((item) => {
      const prevRev = this.revById.get(item.id);
      if (prevRev === undefined) {
        newItems.push(item);
        return;
      }
      const nextRev = item.rev ?? 1;
      if (prevRev !== nextRev) {
        changedItems.push(item);
      }
    });

    try {
      removedIds.forEach((id) => {
        const doc = this.docsById.get(id);
        if (doc) {
          this.index?.remove(doc);
        } else {
          this.index?.remove({ id } as SearchDoc);
        }
        this.docsById.delete(id);
        this.revById.delete(id);
      });

      newItems.forEach((item) => {
        const doc = itemToDoc(item, this.indexedKeys);
        this.index?.add(doc);
        this.docsById.set(doc.id, doc);
        this.revById.set(item.id, item.rev ?? 1);
      });

      changedItems.forEach((item) => {
        const prevDoc = this.docsById.get(item.id);
        if (prevDoc) {
          this.index?.remove(prevDoc);
        } else {
          this.index?.remove({ id: item.id } as SearchDoc);
        }
        const doc = itemToDoc(item, this.indexedKeys);
        this.index?.add(doc);
        this.docsById.set(doc.id, doc);
        this.revById.set(item.id, item.rev ?? 1);
      });
    } catch (error) {
      console.warn('search index delta failed, rebuilding', error);
      this.init(items);
    }
  }

  search(query: string, typeFilter: 'all' | Node['nodeType'], limit = 50) {
    if (!this.index || !this.ready) {
      return [] as Array<{ id: string; score?: number }>;
    }
    const normalized = query.trim();
    if (!normalized) {
      return [];
    }
    const results = this.index.search(normalized, { prefix: true });
    if (typeFilter === 'all') {
      return results.slice(0, limit);
    }
    const filtered = results.filter((result) => {
      const doc = this.docsById.get(String(result.id));
      return doc?.type === typeFilter;
    });
    return filtered.slice(0, limit);
  }

  getDocById(id: string) {
    return this.docsById.get(id);
  }

  isReady() {
    return this.ready;
  }

  getCount() {
    return this.docsById.size;
  }
}

export const searchIndexService = new SearchIndexService();
