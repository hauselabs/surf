# Surf.js + Next.js Example

Next.js App Router integration with Surf.js.

## Structure

```
app/api/surf/
  route.ts           → GET manifest (wire to /.well-known/surf.json via rewrite)
  execute/route.ts   → POST command execution
  surf-instance.ts   → Shared Surf instance
```

## Commands

- `getProducts` — List all products
- `search` — Search by name
- `addToCart` — Add item to cart

## Next.js Config

Add a rewrite to serve the manifest at the standard well-known path:

```ts
// next.config.ts
export default {
  async rewrites() {
    return [
      { source: '/.well-known/surf.json', destination: '/api/surf' },
    ];
  },
};
```

## Run

```bash
npm install
npm run dev
```
