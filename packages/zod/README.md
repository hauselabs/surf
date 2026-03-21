# @surfjs/zod

Zod schema integration for [Surf.js](https://surf.codes) — define commands with Zod instead of raw `ParamSchema`.

## Why?

Surf commands use a `ParamSchema` format to define parameters. This works, but if you're already using Zod in your project, you'd rather write schemas once and get both validation and TypeScript inference from a single source of truth.

`@surfjs/zod` lets you do exactly that.

## Install

```bash
npm install @surfjs/zod zod
```

## Usage

### Before: Raw ParamSchema

```ts
import { createSurf } from '@surfjs/core';

const surf = createSurf({
  name: 'my-store',
  commands: {
    search: {
      description: 'Search products',
      params: {
        query: { type: 'string', required: true, description: 'Search query' },
        limit: { type: 'number', required: false, default: 20 },
        category: {
          type: 'string',
          required: false,
          enum: ['electronics', 'clothing', 'books'],
        },
      },
      // params is Record<string, unknown> — no inference
      run: async (params) => {
        const query = params.query as string;
        const limit = (params.limit as number) ?? 20;
        return { results: [] };
      },
    },
  },
});
```

### After: defineZodCommand

```ts
import { z } from 'zod';
import { createSurf } from '@surfjs/core';
import { defineZodCommand } from '@surfjs/zod';

const surf = createSurf({
  name: 'my-store',
  commands: {
    search: defineZodCommand({
      description: 'Search products',
      params: z.object({
        query: z.string().describe('Search query'),
        limit: z.number().int().min(1).max(100).optional().default(20),
        category: z.enum(['electronics', 'clothing', 'books']).optional(),
      }),
      // params are fully typed: { query: string; limit: number; category?: 'electronics' | 'clothing' | 'books' }
      run: async ({ query, limit, category }) => {
        return { results: [] };
      },
    }),
  },
});
```

## API

### `defineZodCommand(config)`

Defines a Surf command using a Zod object schema for parameters. Returns a standard `CommandDefinition` that can be used anywhere Surf expects one.

The Zod schema is converted to Surf's `ParamSchema` format at runtime, so the manifest, DevUI, and agents all see native Surf types.

### `zodToSurfParams(schema)`

Lower-level utility that converts a `z.object({...})` schema to `Record<string, ParamSchema>`. Useful if you want the conversion without the full command definition.

```ts
import { z } from 'zod';
import { zodToSurfParams } from '@surfjs/zod';

const params = zodToSurfParams(
  z.object({
    name: z.string(),
    age: z.number().optional(),
  }),
);
// { name: { type: 'string', required: true }, age: { type: 'number', required: false } }
```

### `zodValidator(schema)`

Middleware that validates incoming params against a Zod schema at runtime. Use this for stricter validation (min/max, regex, custom refinements) beyond what Surf's built-in validation supports.

```ts
import { z } from 'zod';
import { zodValidator } from '@surfjs/zod';

const schema = z.object({
  email: z.string().email(),
  age: z.number().int().min(0).max(150),
});

const surf = createSurf({
  name: 'my-app',
  middleware: [zodValidator(schema)],
  commands: { ... },
});
```

### `convertZodType(zodType)`

Convert a single Zod type to a Surf `ParamSchema`. Used internally by `zodToSurfParams` but exported for advanced use cases.

## Type Mapping

| Zod Type | Surf ParamSchema |
|---|---|
| `z.string()` | `{ type: 'string' }` |
| `z.number()` | `{ type: 'number' }` |
| `z.boolean()` | `{ type: 'boolean' }` |
| `z.enum([...])` | `{ type: 'string', enum: [...] }` |
| `z.object({})` | `{ type: 'object', properties: {...} }` |
| `z.array(item)` | `{ type: 'array', items: ... }` |
| `.optional()` | `required: false` |
| `.default(val)` | `default: val` |
| `.describe(text)` | `description: text` |

## License

MIT
