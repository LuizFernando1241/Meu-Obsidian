import Dexie, { type Table } from 'dexie';

import type {
  AutoBackup,
  AppMetaRow,
  InboxItemRow,
  IndexJobRow,
  Item,
  NoteSnapshot,
  PropertySchema,
  SavedView,
  TaskIndexRow,
  Tombstone,
  UserStateRow,
} from './types';

export class AppDB extends Dexie {
  items!: Table<Item, string>;
  tombstones!: Table<Tombstone, string>;
  views!: Table<SavedView, string>;
  snapshots!: Table<NoteSnapshot, string>;
  schemas!: Table<PropertySchema, string>;
  autoBackups!: Table<AutoBackup, string>;
  tasks_index!: Table<TaskIndexRow, string>;
  user_state!: Table<UserStateRow, [string, UserStateRow['space']]>;
  inbox_items!: Table<InboxItemRow, string>;
  app_meta!: Table<AppMetaRow, string>;
  index_jobs!: Table<IndexJobRow, string>;

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

    this.version(7)
      .stores({
        items:
          'id, nodeType, parentId, updatedAt, createdAt, title, favorite, rev, *tags, *linksTo',
        tombstones: 'id, deletedAt, rev',
      })
      .upgrade((tx) =>
        tx
          .table('items')
          .toCollection()
          .modify((item) => {
            const legacyType = item.legacyType ?? item.type;
            if (legacyType) {
              item.legacyType = legacyType;
            }

            const resolvedNodeType =
              item.nodeType === 'folder' || item.nodeType === 'note'
                ? item.nodeType
                : legacyType === 'area' || legacyType === 'project'
                  ? 'folder'
                  : 'note';
            item.nodeType = resolvedNodeType;

            if (!item.rev || item.rev < 1) {
              item.rev = 1;
            }
            if (!Array.isArray(item.tags)) {
              item.tags = [];
            }
            if (!Array.isArray(item.linksTo)) {
              item.linksTo = [];
            }
            if (typeof item.favorite !== 'boolean') {
              item.favorite = false;
            }
            if (!item.createdAt) {
              item.createdAt = Date.now();
            }
            if (!item.updatedAt) {
              item.updatedAt = item.createdAt;
            }
            if (typeof item.title !== 'string' || !item.title.trim()) {
              item.title = 'Sem titulo';
            }

            const props =
              item.props && typeof item.props === 'object' ? item.props : {};

            if (typeof item.parentId !== 'string' || !item.parentId.trim()) {
              if (legacyType === 'task' && typeof item.projectId === 'string') {
                item.parentId = item.projectId;
              } else {
                item.parentId = undefined;
              }
            }

            if (resolvedNodeType === 'note') {
              if (!Array.isArray(item.content) || item.content.length === 0) {
                item.content = [
                  {
                    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
                    type: 'paragraph',
                    text: '',
                  },
                ];
              }
            } else {
              if (Array.isArray(item.content) && item.content.length > 0) {
                props.legacyContent = item.content;
              }
              delete item.content;
            }

            if (legacyType === 'task') {
              const legacyTask = {
                status: item.status,
                dueDate: item.dueDate,
                doneAt: item.doneAt,
                recurrence: item.recurrence,
                projectId: typeof item.projectId === 'string' ? item.projectId : undefined,
                originItemId: typeof item.originItemId === 'string' ? item.originItemId : undefined,
                originBlockId:
                  typeof item.originBlockId === 'string' ? item.originBlockId : undefined,
                originType: typeof item.originType === 'string' ? item.originType : undefined,
              };

              const checklistText = item.title?.trim() || 'Tarefa';
              const checklistBlock = {
                id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
                type: 'checklist',
                text: checklistText,
                checked: legacyTask.status === 'done',
              };

              const existing = Array.isArray(item.content) ? item.content : [];
              const first = existing[0];
              const hasChecklist =
                first &&
                first.type === 'checklist' &&
                String(first.text ?? '').trim() === checklistText;
              item.content = hasChecklist
                ? existing
                : [checklistBlock, ...existing].filter(Boolean);

              item.nodeType = 'note';
              props.legacyTask = legacyTask;
            }

            if (legacyType === 'project') {
              props.legacyProject = {
                nextActionId:
                  typeof item.nextActionId === 'string' ? item.nextActionId : undefined,
              };
            }

            item.props = props;

            delete item.type;
            delete item.status;
            delete item.dueDate;
            delete item.doneAt;
            delete item.recurrence;
            delete item.projectId;
            delete item.originItemId;
            delete item.originBlockId;
            delete item.originType;
            delete item.nextActionId;
          }),
      );

    this.version(8).stores({
      items:
        'id, nodeType, parentId, updatedAt, createdAt, title, favorite, rev, *tags, *linksTo',
      tombstones: 'id, deletedAt, rev',
      views: 'id, name, updatedAt, createdAt',
    });

    this.version(9).stores({
      items:
        'id, nodeType, parentId, updatedAt, createdAt, title, favorite, rev, *tags, *linksTo',
      tombstones: 'id, deletedAt, rev',
      views: 'id, name, updatedAt, createdAt',
      snapshots: 'id, nodeId, createdAt',
    });

    this.version(10).stores({
      items:
        'id, nodeType, parentId, updatedAt, createdAt, title, favorite, rev, *tags, *linksTo',
      tombstones: 'id, deletedAt, rev',
      views: 'id, name, updatedAt, createdAt',
      snapshots: 'id, nodeId, createdAt',
      schemas: 'id, updatedAt, version',
    });

    this.version(11).stores({
      items:
        'id, nodeType, parentId, updatedAt, createdAt, title, favorite, rev, *tags, *linksTo',
      tombstones: 'id, deletedAt, rev',
      views: 'id, name, updatedAt, createdAt',
      snapshots: 'id, nodeId, createdAt',
      schemas: 'id, updatedAt, version',
      autoBackups: 'id, createdAt, bytes',
    });

    this.version(12)
      .stores({
        items:
          'id, nodeType, parentId, updatedAt, createdAt, title, favorite, rev, *tags, *linksTo',
        tombstones: 'id, deletedAt, rev',
        views: 'id, name, updatedAt, createdAt',
        snapshots: 'id, nodeId, createdAt',
        schemas: 'id, updatedAt, version',
        autoBackups: 'id, createdAt, bytes',
        tasks_index:
          'taskId, userId, space, status, priority, scheduledDay, dueDay, projectId, areaId, noteId, folderId, updatedAt,' +
          '[space+status], [space+scheduledDay], [space+dueDay], [space+projectId], [space+projectId+isNextAction]',
        user_state: '[userId+space], userId, space, updatedAt',
        inbox_items: 'id, userId, space, status, createdAt, [space+status]',
        app_meta: 'key',
        index_jobs: 'id, type, status, updatedAt',
      })
      .upgrade(async (tx) => {
        const now = Date.now();
        await tx.table('app_meta').put({
          key: 'needsTaskIndexBuild',
          value: true,
          updatedAt: now,
        });
        await tx.table('app_meta').put({
          key: 'lastTaskIndexBuildAt',
          value: null,
          updatedAt: now,
        });
        await tx.table('app_meta').put({
          key: 'taskIndexBuildCheckpoint',
          value: null,
          updatedAt: now,
        });
        await tx.table('app_meta').put({
          key: 'taskIndexBuildMode',
          value: 'rebuild',
          updatedAt: now,
        });
      });
  }
}

export const db = new AppDB();
