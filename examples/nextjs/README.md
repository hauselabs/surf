# Surf.js + Next.js Example

Next.js App Router integration with Surf.js.

## Status

This folder is a **code snippet example**, not a standalone runnable Next.js app.
It intentionally shows the minimal Surf-specific files you need to add inside an existing Next.js project.

If you want a complete working app, create a Next.js project first and then copy these files into it.

## Included files

```
app/api/surf/[...slug]/route.ts    → Surf GET/POST route handler
app/api/surf/surf-instance.ts      → Shared async Surf instance
middleware.ts                      → Optional well-known manifest rewrite
```

## Commands

- `getProducts` — List all products
- `search` — Search by name
- `addToCart` — Add item to cart

## Use it in a real Next.js app

1. Create a Next.js app:

```bash
npx create-next-app@latest my-surf-app
cd my-surf-app
npm install @surfjs/core @surfjs/next
```

2. Copy the example files from this folder into your app.

3. Make sure your catch-all route exports the handlers created by `createSurfRouteHandler(surf)`.

## Well-known discovery

Add a rewrite so agents can find the manifest at the standard path:

```ts
// middleware.ts
import { surfMiddleware } from '@surfjs/next/middleware';

export default surfMiddleware();
export const config = { matcher: ['/.well-known/surf.json'] };
```

## Note on async setup

`createSurf()` is async, so the shared instance should be created with `await createSurf(...)`.
