# Contributing to Surf.js

Thanks for your interest in contributing! Here's how to get started.

## Setup

```bash
git clone https://github.com/hauselabs/surf.git
cd surf
pnpm install
pnpm build
```

## Development

```bash
# Build all packages
pnpm build

# Run all tests
pnpm test

# Type check all packages
pnpm typecheck

# Watch mode (single package)
pnpm --filter @surfjs/core dev
pnpm --filter @surfjs/client dev

# Run tests for a single package
pnpm --filter @surfjs/core test
pnpm --filter @surfjs/client test

# Run tests in watch mode
pnpm --filter @surfjs/core test --watch
```

## Project Structure

```
packages/
  core/       Server-side library (commands, middleware, transports, auth, sessions)
  client/     Agent-side SDK (discover, execute, pipeline, sessions, WebSocket)
  cli/        Terminal tool (inspect, test, ping)
  devui/      Browser-based dev inspector
  next/       Next.js adapter (App Router + Pages Router + middleware)
  react/      React hooks + SurfBadge + SurfProvider
  svelte/     Svelte utilities (surfCommands, surfState, SurfProvider)
  vue/        Vue composables (useSurfCommands, useSurfState, SurfProvider)
  web/        Framework-agnostic window.surf runtime
  zod/        Zod schema integration (Zod 3 + 4 compatible)
apps/
  demo/       Local demo app (Express + React)
  website/    surf.codes documentation site (Next.js)
examples/     Runnable examples (Express, Fastify, Hono, Next.js, agent client, streaming)
```

## Writing Tests

Tests live in `packages/<name>/src/__tests__/` or alongside source files as `*.test.ts`.

- Use [Vitest](https://vitest.dev/) — the monorepo is pre-configured
- Test edge cases, not just happy paths
- Prefer unit tests; integration tests go in `tests/` at package root
- No `any` types in test files either

## Adding a New Adapter

To add a framework adapter (e.g. `@surfjs/fastify`):

1. Create `packages/fastify/` with a `package.json`, `tsconfig.json`, and `src/index.ts`
2. Add it to `pnpm-workspace.yaml`
3. Implement the adapter using the shared helpers exported from `@surfjs/core` (`executePipeline`, `SurfInstance`, etc.)
4. Write tests covering the main routes (manifest, execute, pipeline, session)
5. Add a README following the style of `packages/next/README.md`
6. Add it to the ecosystem table in the root `README.md`

## Pull Requests

1. Fork the repo and create a feature branch from `main`
2. Make your changes with tests where applicable
3. Run `pnpm test` and `pnpm typecheck` before submitting
4. Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`
5. Keep PRs focused — one concern per PR
6. Open a PR against `main` with a clear description of what changed and why

## Reporting Issues

Open an issue at [github.com/hauselabs/surf/issues](https://github.com/hauselabs/surf/issues) with:

- What you expected
- What happened
- Steps to reproduce
- Node.js version, framework, and `@surfjs/*` versions

## Code Style

- TypeScript strict mode, no `any`
- Small, focused functions
- Meaningful names (code reads as docs)
- Graceful error handling — no unhandled exceptions in public API
- Use `SurfError` / `SurfClientError` for all thrown errors

## Release Process

Releases are managed by the maintainers. If you're a maintainer:

```bash
# Bump versions (changeset-based)
pnpm changeset

# Build + publish
pnpm build
pnpm changeset publish
```

All packages are published to npm under the `@surfjs` scope.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
