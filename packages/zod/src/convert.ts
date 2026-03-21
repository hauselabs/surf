import type { ParamSchema } from '@surfjs/core';
import {
  type ZodTypeAny,
  ZodString,
  ZodNumber,
  ZodBoolean,
  ZodEnum,
  ZodObject,
  ZodArray,
  ZodOptional,
  ZodDefault,
  ZodNullable,
  ZodEffects,
  ZodLiteral,
  ZodUnion,
  ZodNativeEnum,
} from 'zod';

/**
 * Convert a single Zod type to a Surf ParamSchema.
 * Recursively handles nested objects, arrays, optionals, defaults, etc.
 */
export function convertZodType(zodType: ZodTypeAny): ParamSchema {
  const description = zodType.description;
  const base = convertZodTypeInner(zodType);

  if (description) {
    base.description = description;
  }

  return base;
}

function convertZodTypeInner(zodType: ZodTypeAny): ParamSchema {
  // Unwrap ZodEffects (refinements, transforms, preprocess)
  if (zodType instanceof ZodEffects) {
    return convertZodTypeInner(zodType._def.schema as ZodTypeAny);
  }

  // ZodDefault — extract default value, recurse into inner type
  if (zodType instanceof ZodDefault) {
    const inner = convertZodTypeInner(zodType._def.innerType as ZodTypeAny);
    inner.default = zodType._def.defaultValue();
    return inner;
  }

  // ZodOptional — mark as not required, recurse
  if (zodType instanceof ZodOptional) {
    const inner = convertZodTypeInner(zodType._def.innerType as ZodTypeAny);
    inner.required = false;
    return inner;
  }

  // ZodNullable — treat like optional for Surf's purposes
  if (zodType instanceof ZodNullable) {
    const inner = convertZodTypeInner(zodType._def.innerType as ZodTypeAny);
    inner.required = false;
    return inner;
  }

  // Primitives
  if (zodType instanceof ZodString) {
    return { type: 'string' };
  }

  if (zodType instanceof ZodNumber) {
    return { type: 'number' };
  }

  if (zodType instanceof ZodBoolean) {
    return { type: 'boolean' };
  }

  // ZodLiteral — infer type from value
  if (zodType instanceof ZodLiteral) {
    const value = zodType._def.value as unknown;
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
  if (zodType instanceof ZodEnum) {
    const values = zodType._def.values as readonly string[];
    return { type: 'string', enum: values };
  }

  // ZodNativeEnum — JS enum
  if (zodType instanceof ZodNativeEnum) {
    const enumObj = zodType._def.values as Record<string, string | number>;
    const values = Object.values(enumObj).filter(
      (v): v is string => typeof v === 'string',
    );
    if (values.length > 0) {
      return { type: 'string', enum: values };
    }
    return { type: 'string' };
  }

  // ZodObject — recursive conversion
  if (zodType instanceof ZodObject) {
    const shape = zodType._def.shape() as Record<string, ZodTypeAny>;
    const properties: Record<string, ParamSchema> = {};

    for (const [key, value] of Object.entries(shape)) {
      if (value) {
        const converted = convertZodType(value);
        // In Zod, fields are required by default unless wrapped in .optional()
        if (converted.required === undefined) {
          converted.required = true;
        }
        properties[key] = converted;
      }
    }

    return { type: 'object', properties };
  }

  // ZodArray — convert item type
  if (zodType instanceof ZodArray) {
    const itemSchema = convertZodType(zodType._def.type as ZodTypeAny);
    return { type: 'array', items: itemSchema };
  }

  // ZodUnion — use first variant as a best-effort conversion
  if (zodType instanceof ZodUnion) {
    const options = zodType._def.options as ZodTypeAny[];
    if (options.length > 0 && options[0]) {
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
  schema: ZodObject<Record<string, ZodTypeAny>>,
): Record<string, ParamSchema> {
  const shape = schema._def.shape() as Record<string, ZodTypeAny>;
  const result: Record<string, ParamSchema> = {};

  for (const [key, value] of Object.entries(shape)) {
    if (value) {
      const converted = convertZodType(value);
      // Top-level params: required by default unless explicitly optional
      if (converted.required === undefined) {
        converted.required = true;
      }
      result[key] = converted;
    }
  }

  return result;
}
