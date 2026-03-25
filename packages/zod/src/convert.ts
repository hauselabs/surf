import type { ParamSchema } from '@surfjs/core';

/**
 * Convert a single Zod type to a Surf ParamSchema.
 * Uses duck-typing on _def.typeName to avoid instanceof checks
 * that break across Zod versions (especially Zod 4).
 */
export function convertZodType(zodType: unknown): ParamSchema {
  const def = (zodType as { description?: string; _def?: Record<string, unknown> });
  const description = def.description;
  const base = convertZodTypeInner(zodType);

  if (description) {
    base.description = description;
  }

  return base;
}

function getTypeName(zodType: unknown): string | undefined {
  const def = (zodType as { _def?: { typeName?: string; type?: string } })?._def;
  // Zod 3 uses _def.typeName (e.g. 'ZodString'), Zod 4 uses _def.type (e.g. 'string')
  const raw = def?.typeName ?? def?.type;
  if (!raw) return undefined;
  // Normalize Zod 4 lowercase names to Zod 3 convention for consistent matching
  if (raw[0] !== 'Z') {
    return `Zod${raw.charAt(0).toUpperCase()}${raw.slice(1)}`;
  }
  return raw;
}

function getDef(zodType: unknown): Record<string, unknown> {
  return ((zodType as { _def?: Record<string, unknown> })?._def ?? {});
}

function convertZodTypeInner(zodType: unknown): ParamSchema {
  const typeName = getTypeName(zodType);
  const def = getDef(zodType);

  // ZodEffects (refinements, transforms, preprocess)
  if (typeName === 'ZodEffects') {
    return convertZodTypeInner(def.schema);
  }

  // ZodDefault — extract default value, recurse into inner type
  if (typeName === 'ZodDefault') {
    const inner = convertZodTypeInner(def.innerType);
    // Zod 3: defaultValue is a function; Zod 4: defaultValue is the raw value
    if (typeof def.defaultValue === 'function') {
      inner.default = (def.defaultValue as () => unknown)();
    } else if (def.defaultValue !== undefined) {
      inner.default = def.defaultValue;
    }
    return inner;
  }

  // ZodOptional — mark as not required, recurse
  if (typeName === 'ZodOptional') {
    const inner = convertZodTypeInner(def.innerType);
    inner.required = false;
    return inner;
  }

  // ZodNullable — treat like optional for Surf's purposes
  if (typeName === 'ZodNullable') {
    const inner = convertZodTypeInner(def.innerType);
    inner.required = false;
    return inner;
  }

  // Primitives
  if (typeName === 'ZodString') {
    return { type: 'string' };
  }

  if (typeName === 'ZodNumber') {
    return { type: 'number' };
  }

  if (typeName === 'ZodBoolean') {
    return { type: 'boolean' };
  }

  // ZodLiteral — infer type from value
  if (typeName === 'ZodLiteral') {
    const value = def.value;
    if (typeof value === 'string') {
      return { type: 'string', enum: [value] };
    }
    if (typeof value === 'number') {
      return { type: 'number' };
    }
    if (typeof value === 'boolean') {
      return { type: 'boolean' };
    }
    return { type: 'string' };
  }

  // ZodEnum — string enum
  if (typeName === 'ZodEnum') {
    // Zod 3: def.values is string[]; Zod 4: def.entries is Record<string, string>
    const values = def.values as readonly string[] | undefined;
    if (values && Array.isArray(values)) {
      return { type: 'string', enum: values };
    }
    const entries = def.entries as Record<string, string> | undefined;
    if (entries && typeof entries === 'object') {
      return { type: 'string', enum: Object.values(entries) };
    }
    return { type: 'string' };
  }

  // ZodNativeEnum — JS enum
  if (typeName === 'ZodNativeEnum') {
    const enumObj = def.values as Record<string, string | number> | undefined;
    if (enumObj) {
      const values = Object.values(enumObj).filter(
        (v): v is string => typeof v === 'string',
      );
      if (values.length > 0) {
        return { type: 'string', enum: values };
      }
    }
    return { type: 'string' };
  }

  // ZodObject — recursive conversion
  if (typeName === 'ZodObject') {
    const shapeFn = def.shape;
    const shape: Record<string, unknown> = typeof shapeFn === 'function'
      ? (shapeFn as () => Record<string, unknown>)()
      : (shapeFn as Record<string, unknown> ?? {});

    const properties: Record<string, ParamSchema> = {};

    for (const [key, value] of Object.entries(shape)) {
      if (value) {
        const converted = convertZodType(value);
        if (converted.required === undefined) {
          converted.required = true;
        }
        properties[key] = converted;
      }
    }

    return { type: 'object', properties };
  }

  // ZodArray — convert item type
  if (typeName === 'ZodArray') {
    // Zod 3: def.type is the element schema; Zod 4: def.element is the element schema
    // Avoid using def.type here since Zod 4 uses it for the type name string ('array')
    const itemType = def.element ?? (typeof def.type === 'object' ? def.type : undefined);
    if (itemType) {
      const itemSchema = convertZodType(itemType);
      return { type: 'array', items: itemSchema };
    }
    return { type: 'array' };
  }

  // ZodUnion — use first variant as a best-effort conversion
  if (typeName === 'ZodUnion') {
    const options = def.options as unknown[] | undefined;
    if (options && options.length > 0) {
      return convertZodTypeInner(options[0]);
    }
    return { type: 'string' };
  }

  // Fallback for unsupported types
  return { type: 'string' };
}

/**
 * Convert a Zod object schema to Surf's `Record<string, ParamSchema>` format.
 * This is the primary conversion function used by `defineZodCommand`.
 *
 * @param schema - A `z.object({...})` schema defining command parameters
 * @returns A record of parameter names to their Surf ParamSchema definitions
 */
export function zodToSurfParams(
  schema: unknown,
): Record<string, ParamSchema> {
  const def = getDef(schema);
  const shapeFn = def.shape;
  const shape: Record<string, unknown> = typeof shapeFn === 'function'
    ? (shapeFn as () => Record<string, unknown>)()
    : (shapeFn as Record<string, unknown> ?? {});

  const result: Record<string, ParamSchema> = {};

  for (const [key, value] of Object.entries(shape)) {
    if (value) {
      const converted = convertZodType(value);
      if (converted.required === undefined) {
        converted.required = true;
      }
      result[key] = converted;
    }
  }

  return result;
}
