# Surf.js Agent Client Example

Shows how an AI agent discovers and interacts with a Surf-enabled website using `@surfjs/client`.

## Features Demonstrated

- **Discovery** — Auto-fetch `surf.json` manifest
- **Execute** — Run individual commands
- **Pipeline** — Multiple commands in one round-trip
- **Typed Client** — Full TypeScript inference
- **Sessions** — Stateful interactions

## Prerequisites

Start the Express example first:

```bash
cd ../express
npm install && npm start
```

## Run

```bash
npx tsx index.ts
# or
SURF_URL=https://your-site.com npx tsx index.ts
```
