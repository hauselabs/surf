import type { ParamSchema, ParamType } from './types.js';
import { invalidParams, internalError } from './errors.js';

/**
 * Validates and coerces parameters against a schema.
 * Returns the validated (and defaulted) params object.
 * Throws SurfError with code INVALID_PARAMS on failure.
 */
export function validateParams(
  params: Record<string, unknown> | undefined,
  schema: Record<string, ParamSchema>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const [name, def] of Object.entries(schema)) {
    const value = params?.[name];

    // Handle missing values
    if (value === undefined || value === null) {
      if (def.required) {
        errors.push(`Parameter '${name}' is required`);
        continue;
      }
      if (def.default !== undefined) {
        result[name] = def.default;
        continue;
      }
      // Optional, no default — omit
      continue;
    }

    // Type check
    const typeError = checkType(name, value, def);
    if (typeError) {
      errors.push(typeError);
      continue;
    }

    // Enum check
    if (def.enum && typeof value === 'string') {
      if (!def.enum.includes(value)) {
        errors.push(
          `Parameter '${name}' must be one of: ${def.enum.join(', ')}. Got '${value}'`,
        );
        continue;
      }
    }

    // Object property validation (recursive)
    if (def.type === 'object' && def.properties && typeof value === 'object' && !Array.isArray(value)) {
      try {
        result[name] = validateParams(value as Record<string, unknown>, def.properties);
        continue;
      } catch (e) {
        if (e instanceof Error) {
          errors.push(`In '${name}': ${e.message}`);
        }
        continue;
      }
    }

    // Array item validation
    if (def.type === 'array' && Array.isArray(value) && def.items && !('$ref' in def.items)) {
      const itemSchema = def.items;
      for (let i = 0; i < value.length; i++) {
        const itemError = checkType(`${name}[${i}]`, value[i], itemSchema);
        if (itemError) {
          errors.push(itemError);
        }
      }
    }

    result[name] = value;
  }

  if (errors.length > 0) {
    throw invalidParams(errors.join('; '), { errors });
  }

  return result;
}

function checkType(name: string, value: unknown, def: ParamSchema): string | null {
  const expected = def.type;
  const actual = getParamType(value);

  if (actual !== expected) {
    return `Parameter '${name}' must be of type '${expected}', got '${actual}'`;
  }

  return null;
}

function getParamType(value: unknown): ParamType | 'null' | 'unknown' {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return 'array';
  const t = typeof value;
  if (t === 'string') return 'string';
  if (t === 'number') return 'number';
  if (t === 'boolean') return 'boolean';
  if (t === 'object') return 'object';
  return 'unknown';
}

/**
 * Validates a command's return value against its declared schema.
 * Throws SurfError with INTERNAL_ERROR if the shape doesn't match.
 */
export function validateResult(result: unknown, schema: ParamSchema, commandName: string): void {
  const actual = getParamType(result);
  if (actual !== schema.type) {
    throw internalError(
      `Command '${commandName}' returned invalid shape: expected '${schema.type}', got '${actual}'`,
    );
  }

  if (schema.type === 'object' && schema.properties && typeof result === 'object' && result !== null && !Array.isArray(result)) {
    const obj = result as Record<string, unknown>;
    const errors: string[] = [];
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      const val = obj[key];
      if (val === undefined || val === null) {
        if (propSchema.required) {
          errors.push(`'${key}' is required`);
        }
        continue;
      }
      const propActual = getParamType(val);
      if (propActual !== propSchema.type) {
        errors.push(`'${key}' must be '${propSchema.type}', got '${propActual}'`);
      }
    }
    if (errors.length > 0) {
      throw internalError(`Command '${commandName}' returned invalid shape: ${errors.join('; ')}`);
    }
  }
}
