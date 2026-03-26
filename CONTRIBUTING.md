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

# Run tests
pnpm test

# Type check
pnpm typecheck

# Watch mode (single package)
pnpm --filter @surfjs/core dev
```

## Project Structure

```
packages/
  core/       Server-side library (commands, middleware, transports)
  client/     Agent-side SDK (discover, execute, pipeline)
  cli/        Terminal tool (inspect, test, ping)
  devui/      Browser-based dev inspector
  next/       Next.js adapter (App Router + Pages Router)
  react/      React hooks + SurfBadge component for Surf Live
  zod/        Zod schema integration (Zod 3 + 4 compatible)
examples/     Runnable examples for each framework
```

## Pull Requests

1. Fork the repo and create a feature branch from `main`
2. Make your changes with tests where applicable
3. Run `pnpm test` and `pnpm typecheck` before submitting
4. Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`
5. Open a PR against `main`

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
- Graceful error handling

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
