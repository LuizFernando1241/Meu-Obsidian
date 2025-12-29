import type { PropertyDef, PropertySchema } from './types';

type NormalizeOptions = {
  applyDefaults?: boolean;
};

export type NormalizeResult = {
  props: Record<string, unknown>;
  warnings: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isValidISODate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(parsed.getTime())) {
    return false;
  }
  const [year, month, day] = value.split('-').map((entry) => Number(entry));
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() + 1 === month &&
    parsed.getDate() === day
  );
};

const coerceDefault = (def: PropertyDef) => def.defaultValue;

const removeOrDefault = (
  props: Record<string, unknown>,
  def: PropertyDef,
  options: NormalizeOptions,
) => {
  if (options.applyDefaults && def.defaultValue !== undefined) {
    props[def.key] = coerceDefault(def);
  } else {
    delete props[def.key];
  }
};

const normalizeSelect = (
  raw: unknown,
  def: PropertyDef,
  props: Record<string, unknown>,
  warnings: string[],
  options: NormalizeOptions,
) => {
  const value = typeof raw === 'string' ? raw.trim() : '';
  const allowed = def.options ?? [];
  if (!value) {
    removeOrDefault(props, def, options);
    return;
  }
  if (allowed.length > 0 && !allowed.includes(value)) {
    warnings.push(`${def.key} invalido`);
    removeOrDefault(props, def, options);
    return;
  }
  props[def.key] = value;
};

const normalizeMultiSelect = (
  raw: unknown,
  def: PropertyDef,
  props: Record<string, unknown>,
  warnings: string[],
  options: NormalizeOptions,
) => {
  const allowed = def.options ?? [];
  const values = Array.isArray(raw)
    ? raw.filter((entry): entry is string => typeof entry === 'string')
    : typeof raw === 'string'
      ? raw
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [];
  const filtered = allowed.length > 0 ? values.filter((value) => allowed.includes(value)) : values;
  if (filtered.length === 0) {
    if (values.length > 0) {
      warnings.push(`${def.key} invalido`);
    }
    removeOrDefault(props, def, options);
    return;
  }
  props[def.key] = filtered;
};

const normalizeText = (
  raw: unknown,
  def: PropertyDef,
  props: Record<string, unknown>,
  options: NormalizeOptions,
) => {
  const value =
    typeof raw === 'string'
      ? raw.trim()
      : typeof raw === 'number' || typeof raw === 'boolean'
        ? String(raw)
        : '';
  if (!value) {
    removeOrDefault(props, def, options);
    return;
  }
  props[def.key] = value;
};

const normalizeNumber = (
  raw: unknown,
  def: PropertyDef,
  props: Record<string, unknown>,
  warnings: string[],
  options: NormalizeOptions,
) => {
  const value =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string'
        ? Number.parseFloat(raw)
        : NaN;
  if (!Number.isFinite(value)) {
    warnings.push(`${def.key} invalido`);
    removeOrDefault(props, def, options);
    return;
  }
  props[def.key] = value;
};

const normalizeCheckbox = (
  raw: unknown,
  def: PropertyDef,
  props: Record<string, unknown>,
  options: NormalizeOptions,
) => {
  if (typeof raw === 'boolean') {
    props[def.key] = raw;
    return;
  }
  if (raw === 'true') {
    props[def.key] = true;
    return;
  }
  if (raw === 'false') {
    props[def.key] = false;
    return;
  }
  removeOrDefault(props, def, options);
};

const normalizeDate = (
  raw: unknown,
  def: PropertyDef,
  props: Record<string, unknown>,
  warnings: string[],
  options: NormalizeOptions,
) => {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) {
    removeOrDefault(props, def, options);
    return;
  }
  if (!isValidISODate(value)) {
    warnings.push(`${def.key} invalido`);
    removeOrDefault(props, def, options);
    return;
  }
  props[def.key] = value;
};

export const normalizeProps = (
  inputProps: Record<string, unknown> | undefined,
  schema: PropertySchema | undefined,
  options: NormalizeOptions = {},
): NormalizeResult => {
  if (!schema || !Array.isArray(schema.properties)) {
    return {
      props: isRecord(inputProps) ? { ...inputProps } : {},
      warnings: [],
    };
  }

  const props = isRecord(inputProps) ? { ...inputProps } : {};
  const warnings: string[] = [];

  schema.properties.forEach((def) => {
    const raw = props[def.key];
    if (raw === undefined || raw === null || raw === '') {
      removeOrDefault(props, def, options);
      return;
    }

    switch (def.type) {
      case 'select':
        normalizeSelect(raw, def, props, warnings, options);
        break;
      case 'multi_select':
        normalizeMultiSelect(raw, def, props, warnings, options);
        break;
      case 'number':
        normalizeNumber(raw, def, props, warnings, options);
        break;
      case 'checkbox':
        normalizeCheckbox(raw, def, props, options);
        break;
      case 'date':
        normalizeDate(raw, def, props, warnings, options);
        break;
      case 'text':
      default:
        normalizeText(raw, def, props, options);
        break;
    }
  });

  return { props, warnings };
};
