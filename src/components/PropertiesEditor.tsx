import React from 'react';
import {
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
} from '@mui/material';
import { useLiveQuery } from 'dexie-react-hooks';

import { getGlobalSchema } from '../data/repo';
import { normalizeProps } from '../data/propsNormalize';
import { buildDefaultSchema } from '../data/schemaDefaults';
import type { Node, PropertyDef, PropertySchema } from '../data/types';
import DateField from './DateField';
import { useNotifier } from './Notifier';

type PropertiesEditorProps = {
  node: Node;
  schema?: PropertySchema;
  onChange: (nextProps: Record<string, unknown>) => void;
  variant?: 'full' | 'compact';
};

const getStringValue = (props: Record<string, unknown> | undefined, key: string) =>
  typeof props?.[key] === 'string' ? String(props?.[key]) : '';

const getNumberValue = (props: Record<string, unknown> | undefined, key: string) =>
  typeof props?.[key] === 'number' && Number.isFinite(props?.[key])
    ? String(props?.[key])
    : '';

const getBooleanValue = (props: Record<string, unknown> | undefined, key: string) =>
  typeof props?.[key] === 'boolean' ? Boolean(props?.[key]) : false;

const getMultiSelectValue = (props: Record<string, unknown> | undefined, key: string) =>
  Array.isArray(props?.[key])
    ? (props?.[key] as unknown[]).filter((entry): entry is string => typeof entry === 'string')
    : [];

const STATUS_LABELS: Record<string, string> = {
  idea: 'Ideia',
  active: 'Ativo',
  waiting: 'Aguardando',
  done: 'Concluido',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baixa',
  medium: 'Media',
  high: 'Alta',
};

const formatOptionLabel = (key: string, value: string) => {
  if (key === 'status') {
    return STATUS_LABELS[value] ?? value;
  }
  if (key === 'priority') {
    return PRIORITY_LABELS[value] ?? value;
  }
  return value;
};

export const mergeNodeProps = (
  current: Record<string, unknown> | undefined,
  patch: Record<string, unknown>,
) => {
  const next: Record<string, unknown> = { ...(current ?? {}) };
  Object.entries(patch).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      delete next[key];
      return;
    }
    next[key] = value;
  });
  return next;
};

export default function PropertiesEditor({
  node,
  schema: schemaOverride,
  onChange,
  variant = 'full',
}: PropertiesEditorProps) {
  const notifier = useNotifier();
  const storedSchema = useLiveQuery(
    () => getGlobalSchema() as Promise<PropertySchema | undefined>,
    [],
  );
  const fallbackSchema = React.useMemo(() => buildDefaultSchema(Date.now()), []);
  const schema = schemaOverride ?? storedSchema ?? fallbackSchema;
  const props = node.props ?? {};
  const size = variant === 'compact' ? 'small' : 'medium';

  const handleChange = React.useCallback(
    (partial: Record<string, unknown>) => {
      const next = mergeNodeProps(props as Record<string, unknown>, partial);
      const { props: normalized, warnings } = normalizeProps(next, schema, {
        applyDefaults: false,
      });
      if (warnings.length > 0) {
        notifier.info(`Propriedades ajustadas: ${warnings.join(', ')}`, 4000);
      }
      onChange(normalized);
    },
    [notifier, onChange, props, schema],
  );

  const renderField = (property: PropertyDef) => {
    const key = property.key;
    if (property.type === 'checkbox') {
      const checked = getBooleanValue(props as Record<string, unknown>, key);
      return (
        <FormControlLabel
          key={key}
          control={
            <Switch
              checked={checked}
              onChange={(event) => handleChange({ [key]: event.target.checked })}
              size={variant === 'compact' ? 'small' : 'medium'}
            />
          }
          label={property.name}
        />
      );
    }

    if (property.type === 'select') {
      const value = getStringValue(props as Record<string, unknown>, key);
      return (
        <TextField
          key={key}
          label={property.name}
          select
          size={size}
          value={value}
          onChange={(event) => handleChange({ [key]: event.target.value || undefined })}
          fullWidth
        >
          <MenuItem value="">Sem valor</MenuItem>
          {(property.options ?? []).map((option) => (
            <MenuItem key={option} value={option}>
              {formatOptionLabel(key, option)}
            </MenuItem>
          ))}
        </TextField>
      );
    }

    if (property.type === 'multi_select') {
      const value = getMultiSelectValue(props as Record<string, unknown>, key);
      return (
        <TextField
          key={key}
          label={property.name}
          select
          SelectProps={{ multiple: true }}
          size={size}
          value={value}
          onChange={(event) => {
            const raw = event.target.value;
            const values =
              typeof raw === 'string'
                ? raw.split(',').map((entry) => entry.trim()).filter(Boolean)
                : (raw as string[]);
            handleChange({ [key]: values.length > 0 ? values : undefined });
          }}
          fullWidth
        >
          {(property.options ?? []).map((option) => (
            <MenuItem key={option} value={option}>
              {formatOptionLabel(key, option)}
            </MenuItem>
          ))}
        </TextField>
      );
    }

    if (property.type === 'date') {
      const value = getStringValue(props as Record<string, unknown>, key);
      return (
        <DateField
          key={key}
          label={property.name}
          size={size}
          value={value}
          onCommit={(next) => handleChange({ [key]: next || undefined })}
          fullWidth
        />
      );
    }

    if (property.type === 'number') {
      const value = getNumberValue(props as Record<string, unknown>, key);
      return (
        <TextField
          key={key}
          label={property.name}
          type="number"
          size={size}
          value={value}
          onChange={(event) => handleChange({ [key]: event.target.value || undefined })}
          fullWidth
        />
      );
    }

    const value = getStringValue(props as Record<string, unknown>, key);
    return (
      <TextField
        key={key}
        label={property.name}
        size={size}
        value={value}
        onChange={(event) => handleChange({ [key]: event.target.value })}
        onBlur={(event) =>
          handleChange({ [key]: event.target.value.trim() || undefined })
        }
        fullWidth
      />
    );
  };

  return (
    <Stack
      spacing={variant === 'compact' ? 1 : 1.5}
      direction={variant === 'compact' ? { xs: 'column', sm: 'row' } : 'column'}
      flexWrap="wrap"
    >
      {schema.properties.map(renderField)}
    </Stack>
  );
}
