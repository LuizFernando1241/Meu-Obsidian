import React from 'react';
import {
  Chip,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';

import { db } from '../data/db';
import { filterActiveNodes } from '../data/deleted';
import type { Node, PropertySchema, TaskIndexRow } from '../data/types';
import { useSpaceStore } from '../store/useSpaceStore';

const getSchemaIdFromProps = (props?: Record<string, unknown>) => {
  const raw = typeof props?.schemaId === 'string' ? props.schemaId.trim() : '';
  return raw ? raw : undefined;
};

const isProjectSchema = (schemaId?: string, schemaName?: string) => {
  const haystack = `${schemaId ?? ''} ${schemaName ?? ''}`.toLowerCase();
  return haystack.includes('project') || haystack.includes('projeto');
};

const isProjectActive = (node: Node) => {
  const props = node.props as Record<string, unknown> | undefined;
  const statusRaw =
    (typeof props?.projectStatus === 'string' && props.projectStatus) ||
    (typeof props?.status === 'string' && props.status) ||
    '';
  const status = statusRaw.toLowerCase();
  if (!status) {
    return true;
  }
  return !['done', 'paused', 'archived', 'inactive', 'cancelled'].includes(status);
};

export default function ProjectsPage() {
  const navigate = useNavigate();
  const space = useSpaceStore((state) => state.space);
  const allItems = useLiveQuery(() => db.items.toArray(), []) ?? [];
  const items = React.useMemo(() => filterActiveNodes(allItems), [allItems]);
  const schemas = useLiveQuery(() => db.schemas.toArray(), []) ?? [];
  const schemasById = React.useMemo(
    () => new Map(schemas.map((schema) => [schema.id, schema])),
    [schemas],
  );
  const tasksIndex =
    useLiveQuery(
      () => db.tasks_index.where('space').equals(space).toArray(),
      [space],
    ) ?? [];

  const projects = React.useMemo(() => {
    return items.filter((item) => {
      if (item.nodeType !== 'folder') {
        return false;
      }
      const props = item.props as Record<string, unknown> | undefined;
      const spaceValue = typeof props?.space === 'string' ? props.space : undefined;
      if (spaceValue && spaceValue !== space) {
        return false;
      }
      const schemaId = getSchemaIdFromProps(item.props as Record<string, unknown> | undefined);
      if (!schemaId) {
        return false;
      }
      const schema = schemasById.get(schemaId) as PropertySchema | undefined;
      return isProjectSchema(schemaId, schema?.name);
    });
  }, [items, schemasById, space]);

  const projectHealth = React.useMemo(() => {
    const openRows = tasksIndex.filter((row) => row.status !== 'DONE');
    const byProject = new Map<string, TaskIndexRow[]>();
    openRows.forEach((row) => {
      if (!row.projectId) {
        return;
      }
      const list = byProject.get(row.projectId) ?? [];
      list.push(row);
      byProject.set(row.projectId, list);
    });
    return new Map(
      projects.map((project) => {
        const rows = byProject.get(project.id) ?? [];
        const hasNext = rows.some((row) => row.isNextAction && row.status !== 'DONE');
        const hasDoing = rows.some((row) => row.status === 'DOING');
        const openCount = rows.length;
        const status = !isProjectActive(project)
          ? 'INACTIVE'
          : hasNext || hasDoing
            ? 'OK'
            : 'NO_NEXT';
        return [project.id, { status, openCount }];
      }),
    );
  }, [projects, tasksIndex]);

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h4" component="h1">
          Projetos
        </Typography>
        <Typography color="text.secondary">
          {projects.length} projetos encontrados.
        </Typography>
      </Stack>

      {projects.length === 0 ? (
        <Typography color="text.secondary">Nenhum projeto encontrado.</Typography>
      ) : (
        <List disablePadding>
          {projects.map((project) => {
            const health = projectHealth.get(project.id);
            const status = health?.status ?? 'OK';
            const chipLabel =
              status === 'NO_NEXT'
                ? 'Sem proxima acao'
                : status === 'INACTIVE'
                  ? 'Inativo'
                  : 'OK';
            const chipColor = status === 'NO_NEXT' ? 'warning' : 'default';
            const secondary =
              typeof health?.openCount === 'number'
                ? `${health.openCount} tarefas abertas`
                : 'Sem tarefas';

            return (
              <ListItemButton
                key={project.id}
                onClick={() => navigate(`/item/${project.id}`)}
                sx={{ mb: 1, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
              >
                <ListItemText primary={project.title} secondary={secondary} />
                <Chip label={chipLabel} color={chipColor} size="small" />
              </ListItemButton>
            );
          })}
        </List>
      )}
    </Stack>
  );
}
