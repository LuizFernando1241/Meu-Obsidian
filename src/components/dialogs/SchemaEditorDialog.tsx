import React from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { DeleteOutline } from '@mui/icons-material';
import { v4 as uuidv4 } from 'uuid';

import type { PropertyDef, PropertySchema, PropertyType } from '../../data/types';

type SchemaEditorDialogProps = {
  open: boolean;
  mode: 'create' | 'edit' | 'duplicate';
  initialSchema?: PropertySchema | null;
  onClose: () => void;
  onSave: (schema: PropertySchema) => void;
};

type PropertyDraft = {
  id: string;
  key: string;
  name: string;
  type: PropertyType;
  options: string;
  defaultValue: string;
  defaultChecked: boolean;
  indexed: boolean;
};

const PROPERTY_TYPES: Array<{ value: PropertyType; label: string }> = [
  { value: 'text', label: 'Texto' },
  { value: 'number', label: 'Numero' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'date', label: 'Data' },
  { value: 'select', label: 'Select' },
  { value: 'multi_select', label: 'Multi-select' },
];

const normalizeKey = (value: string) => value.trim();

const normalizeOptions = (raw: string) =>
  raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const isValidDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const toDraft = (def: PropertyDef): PropertyDraft => {
  const defaultValue = def.defaultValue;
  return {
    id: uuidv4(),
    key: def.key,
    name: def.name,
    type: def.type,
    options: def.options ? def.options.join(', ') : '',
    defaultValue:
      def.type === 'multi_select'
        ? Array.isArray(defaultValue)
          ? defaultValue.join(', ')
          : ''
        : typeof defaultValue === 'string' || typeof defaultValue === 'number'
          ? String(defaultValue)
          : '',
    defaultChecked: Boolean(defaultValue),
    indexed: Boolean(def.indexed),
  };
};

const buildPropertyDef = (draft: PropertyDraft, index: number): PropertyDef | null => {
  const key = normalizeKey(draft.key);
  if (!key) {
    return null;
  }
  const name = draft.name.trim() || `Property ${index + 1}`;
  const options = normalizeOptions(draft.options);
  let defaultValue: unknown = undefined;
  const rawDefault = draft.defaultValue.trim();

  switch (draft.type) {
    case 'checkbox':
      defaultValue = draft.defaultChecked;
      break;
    case 'number': {
      const parsed = Number.parseFloat(rawDefault);
      defaultValue = Number.isFinite(parsed) ? parsed : undefined;
      break;
    }
    case 'date':
      defaultValue = rawDefault && isValidDate(rawDefault) ? rawDefault : undefined;
      break;
    case 'select':
      if (rawDefault) {
        defaultValue =
          options.length > 0 && !options.includes(rawDefault) ? undefined : rawDefault;
      }
      break;
    case 'multi_select': {
      const values = normalizeOptions(rawDefault);
      if (values.length > 0) {
        defaultValue =
          options.length > 0 ? values.filter((value) => options.includes(value)) : values;
      }
      break;
    }
    case 'text':
    default:
      defaultValue = rawDefault ? rawDefault : undefined;
      break;
  }

  return {
    key,
    name,
    type: draft.type,
    options: options.length > 0 ? options : undefined,
    defaultValue,
    indexed: draft.indexed || undefined,
  };
};

const getTitle = (mode: SchemaEditorDialogProps['mode']) => {
  if (mode === 'edit') {
    return 'Editar schema';
  }
  if (mode === 'duplicate') {
    return 'Duplicar schema';
  }
  return 'Criar schema';
};

export default function SchemaEditorDialog({
  open,
  mode,
  initialSchema,
  onClose,
  onSave,
}: SchemaEditorDialogProps) {
  const [name, setName] = React.useState('');
  const [properties, setProperties] = React.useState<PropertyDraft[]>([]);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    const baseName = initialSchema?.name ?? '';
    if (mode === 'duplicate' && baseName) {
      setName(`Copia de ${baseName}`);
    } else if (mode === 'edit') {
      setName(baseName);
    } else {
      setName('');
    }
    const baseProps = initialSchema?.properties ?? [];
    setProperties(baseProps.map((def) => toDraft(def)));
  }, [open, mode, initialSchema]);

  const handleAddProperty = () => {
    setProperties((prev) => [
      ...prev,
      {
        id: uuidv4(),
        key: '',
        name: '',
        type: 'text',
        options: '',
        defaultValue: '',
        defaultChecked: false,
        indexed: false,
      },
    ]);
  };

  const handlePropertyChange = (
    id: string,
    patch: Partial<PropertyDraft>,
  ) => {
    setProperties((prev) =>
      prev.map((property) => (property.id === id ? { ...property, ...patch } : property)),
    );
  };

  const handleRemoveProperty = (id: string) => {
    setProperties((prev) => prev.filter((property) => property.id !== id));
  };

  const handleSave = () => {
    const trimmedName =
      name.trim() ||
      (mode === 'edit' ? initialSchema?.name ?? 'Schema' : 'Schema');
    const defs = properties
      .map((property, index) => buildPropertyDef(property, index))
      .filter((property): property is PropertyDef => Boolean(property));
    const schemaId =
      mode === 'edit' ? initialSchema?.id ?? 'global' : uuidv4();
    const version =
      mode === 'edit' ? initialSchema?.version ?? 1 : 1;
    const schema: PropertySchema = {
      id: schemaId,
      name: trimmedName,
      version,
      properties: defs,
      updatedAt: Date.now(),
    };
    onSave(schema);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{getTitle(mode)}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Nome"
            value={name}
            onChange={(event) => setName(event.target.value)}
            fullWidth
          />
          <Stack spacing={1}>
            <Typography variant="subtitle2">Propriedades</Typography>
            {properties.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                Nenhuma propriedade adicionada.
              </Typography>
            )}
            {properties.map((property) => {
              const isSelectType =
                property.type === 'select' || property.type === 'multi_select';
              return (
                <Stack
                  key={property.id}
                  spacing={1}
                  sx={{ border: '1px solid', borderColor: 'divider', p: 1.5, borderRadius: 1 }}
                >
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center">
                    <TextField
                      label="Key"
                      value={property.key}
                      onChange={(event) =>
                        handlePropertyChange(property.id, { key: event.target.value })
                      }
                      size="small"
                      fullWidth
                    />
                    <TextField
                      label="Nome"
                      value={property.name}
                      onChange={(event) =>
                        handlePropertyChange(property.id, { name: event.target.value })
                      }
                      size="small"
                      fullWidth
                    />
                    <TextField
                      label="Tipo"
                      select
                      value={property.type}
                      onChange={(event) =>
                        handlePropertyChange(property.id, {
                          type: event.target.value as PropertyType,
                        })
                      }
                      size="small"
                      sx={{ minWidth: 160 }}
                    >
                      {PROPERTY_TYPES.map((entry) => (
                        <MenuItem key={entry.value} value={entry.value}>
                          {entry.label}
                        </MenuItem>
                      ))}
                    </TextField>
                    <IconButton
                      size="small"
                      onClick={() => handleRemoveProperty(property.id)}
                      aria-label="Remover propriedade"
                    >
                      <DeleteOutline fontSize="small" />
                    </IconButton>
                  </Stack>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center">
                    <TextField
                      label="Opcoes"
                      value={property.options}
                      onChange={(event) =>
                        handlePropertyChange(property.id, { options: event.target.value })
                      }
                      size="small"
                      fullWidth
                      disabled={!isSelectType}
                    />
                    {property.type === 'checkbox' ? (
                      <FormControlLabel
                        control={
                          <Switch
                            checked={property.defaultChecked}
                            onChange={(event) =>
                              handlePropertyChange(property.id, {
                                defaultChecked: event.target.checked,
                              })
                            }
                          />
                        }
                        label="Default"
                      />
                    ) : (
                      <TextField
                        label="Default"
                        value={property.defaultValue}
                        onChange={(event) =>
                          handlePropertyChange(property.id, { defaultValue: event.target.value })
                        }
                        size="small"
                        type={property.type === 'number' ? 'number' : property.type === 'date' ? 'date' : 'text'}
                        InputLabelProps={
                          property.type === 'date' ? { shrink: true } : undefined
                        }
                        fullWidth
                      />
                    )}
                    <FormControlLabel
                      control={
                        <Switch
                          checked={property.indexed}
                          onChange={(event) =>
                            handlePropertyChange(property.id, { indexed: event.target.checked })
                          }
                        />
                      }
                      label="Indexar"
                    />
                  </Stack>
                </Stack>
              );
            })}
            <Button variant="outlined" onClick={handleAddProperty}>
              Adicionar propriedade
            </Button>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button onClick={handleSave} variant="contained">
          Salvar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
