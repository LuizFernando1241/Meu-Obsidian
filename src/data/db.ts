import Dexie, { type Table } from 'dexie';

import type { Item, Tombstone } from './types';

export class AppDB extends Dexie {
  items!: Table<Item, string>;
  tombstones!: Table<Tombstone, string>;

  constructor() {
    super('mecflux_personal_os');
    this.version(1).stores({
      items: 'id, type, updatedAt, createdAt, favorite, status, dueDate, *tags',
    });

    this.version(2)
      .stores({
        items: 'id, type, updatedAt, createdAt, title, favorite, status, dueDate, *tags, *linksTo',
      })
      .upgrade((tx) =>
        tx
          .table('items')
          .toCollection()
          .modify((item) => {
            if (!item.linksTo) {
              item.linksTo = [];
            }
          }),
      );

    this.version(3)
      .stores({
        items: 'id, type, updatedAt, createdAt, title, favorite, status, dueDate, rev, *tags, *linksTo',
      })
      .upgrade((tx) =>
        tx
          .table('items')
          .toCollection()
          .modify((item) => {
            if (!item.rev) {
              item.rev = 1;
            }
            if (!item.tags) {
              item.tags = [];
            }
            if (!item.linksTo) {
              item.linksTo = [];
            }
            if (typeof item.favorite !== 'boolean') {
              item.favorite = false;
            }
            if (!item.content || item.content.length === 0) {
              item.content = [
                {
                  id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
                  type: 'paragraph',
                  text: '',
                },
              ];
            }
          }),
      );

    this.version(4)
      .stores({
        items: 'id, type, updatedAt, createdAt, title, favorite, status, dueDate, rev, *tags, *linksTo',
      })
      .upgrade((tx) =>
        tx
          .table('items')
          .toCollection()
          .modify((item) => {
            if (!item.rev) {
              item.rev = 1;
            }
            if (!item.tags) {
              item.tags = [];
            }
            if (!item.linksTo) {
              item.linksTo = [];
            }
            if (typeof item.favorite !== 'boolean') {
              item.favorite = false;
            }
            if (!item.content || item.content.length === 0) {
              item.content = [
                {
                  id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
                  type: 'paragraph',
                  text: '',
                },
              ];
            }
            if (item.recurrence) {
              const freq = item.recurrence.freq;
              const valid =
                freq === 'daily' || freq === 'weekly' || freq === 'monthly';
              if (!valid) {
                item.recurrence = undefined;
              } else {
                const interval =
                  typeof item.recurrence.interval === 'number' &&
                  item.recurrence.interval > 0
                    ? Math.floor(item.recurrence.interval)
                    : 1;
                item.recurrence = { freq, interval };
              }
            }
          }),
      );

    this.version(5)
      .stores({
        items: 'id, type, updatedAt, createdAt, title, favorite, status, dueDate, rev, *tags, *linksTo',
      })
      .upgrade((tx) =>
        tx
          .table('items')
          .toCollection()
          .modify((item) => {
            if (!item.rev) {
              item.rev = 1;
            }
            if (!item.tags) {
              item.tags = [];
            }
            if (!item.linksTo) {
              item.linksTo = [];
            }
            if (typeof item.favorite !== 'boolean') {
              item.favorite = false;
            }
            if (!item.content || item.content.length === 0) {
              item.content = [
                {
                  id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
                  type: 'paragraph',
                  text: '',
                },
              ];
            }
            if (item.recurrence) {
              const freq = item.recurrence.freq;
              const valid =
                freq === 'daily' || freq === 'weekly' || freq === 'monthly';
              if (!valid) {
                item.recurrence = undefined;
              } else {
                const interval =
                  typeof item.recurrence.interval === 'number' &&
                  item.recurrence.interval > 0
                    ? Math.floor(item.recurrence.interval)
                    : 1;
                item.recurrence = { freq, interval };
              }
            }
          }),
      );

    this.version(6)
      .stores({
        items: 'id, type, updatedAt, createdAt, title, favorite, status, dueDate, rev, *tags, *linksTo',
        tombstones: 'id, deletedAt, rev',
      });
  }
}

export const db = new AppDB();
