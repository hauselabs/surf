# Surf Performance Benchmarks

Micro-benchmarks for core Surf operations. Useful for tracking performance
regressions and comparing optimization strategies.

## Running

```bash
# From monorepo root
npm run bench

# Or directly
node --import tsx benchmarks/run.ts
```

## What's measured

| Benchmark | Description |
|-----------|-------------|
| Command execution | Raw throughput of `httpHandler` round-trips (ops/sec) |
| Middleware chain | Overhead of 1, 5, and 10 middleware layers |
| Param validation | `validateParams` with simple and complex schemas |
| Session lifecycle | Create → get → update → destroy cycle time |

## Output

Results are printed to stdout in a human-readable table. Each benchmark
reports ops/sec, mean time per operation, and p99 latency.
