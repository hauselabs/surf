import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { createSurf } from '../../src/surf.js';

describe('Pipeline request body validation', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const surf = await createSurf({
      name: 'PipelineValidation',
      version: '1.0.0',
      commands: {
        echo: {
          description: 'Echo input',
          params: { value: { type: 'string' } },
          run: async (p) => p.value,
        },
        add: {
          description: 'Add two numbers',
          params: {
            a: { type: 'number', required: true },
            b: { type: 'number', required: true },
          },
          run: async (p) => (p.a as number) + (p.b as number),
        },
      },
    });

    const middleware = surf.middleware();
    server = http.createServer(async (req, res) => {
      try {
        await middleware(req as never, res as never);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: { code: 'INTERNAL_ERROR', message: String(err) } }));
      }
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function postPipeline(body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await fetch(`${baseUrl}/surf/pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  it('rejects null body', async () => {
    const res = await fetch(`${baseUrl}/surf/pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'null',
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.ok).toBe(false);
    expect((json.error as Record<string, string>).code).toBe('INVALID_PARAMS');
  });

  it('rejects body without steps', async () => {
    const { status, body } = await postPipeline({});
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect((body.error as Record<string, string>).message).toContain('steps');
  });

  it('rejects steps as non-array', async () => {
    const { status, body } = await postPipeline({ steps: 'not-an-array' });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect((body.error as Record<string, string>).message).toContain('array');
  });

  it('rejects step without command', async () => {
    const { status, body } = await postPipeline({ steps: [{ params: { a: 1 } }] });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect((body.error as Record<string, string>).message).toContain('command');
  });

  it('rejects step with non-string command', async () => {
    const { status, body } = await postPipeline({ steps: [{ command: 123 }] });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect((body.error as Record<string, string>).message).toContain('command');
  });

  it('rejects step with empty command', async () => {
    const { status, body } = await postPipeline({ steps: [{ command: '  ' }] });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect((body.error as Record<string, string>).message).toContain('empty');
  });

  it('rejects step with null as step object', async () => {
    const { status, body } = await postPipeline({ steps: [null] });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect((body.error as Record<string, string>).message).toContain('steps[0]');
  });

  it('rejects step with params as array', async () => {
    const { status, body } = await postPipeline({ steps: [{ command: 'echo', params: [1, 2] }] });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect((body.error as Record<string, string>).message).toContain('params');
  });

  it('rejects step with params as string', async () => {
    const { status, body } = await postPipeline({ steps: [{ command: 'echo', params: 'not-object' }] });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect((body.error as Record<string, string>).message).toContain('params');
  });

  it('rejects non-string as alias', async () => {
    const { status, body } = await postPipeline({ steps: [{ command: 'echo', as: 42 }] });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect((body.error as Record<string, string>).message).toContain('as');
  });

  it('rejects non-string sessionId', async () => {
    const { status, body } = await postPipeline({ steps: [{ command: 'echo' }], sessionId: 123 });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect((body.error as Record<string, string>).message).toContain('sessionId');
  });

  it('rejects non-boolean continueOnError', async () => {
    const { status, body } = await postPipeline({ steps: [{ command: 'echo' }], continueOnError: 'yes' });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect((body.error as Record<string, string>).message).toContain('continueOnError');
  });

  it('accepts valid pipeline with empty steps', async () => {
    const { status, body } = await postPipeline({ steps: [] });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('accepts and executes valid pipeline', async () => {
    const { status, body } = await postPipeline({
      steps: [
        { command: 'add', params: { a: 1, b: 2 } },
        { command: 'echo', params: { value: 'hello' } },
      ],
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    const results = body.results as Array<Record<string, unknown>>;
    expect(results).toHaveLength(2);
    expect(results[0].result).toBe(3);
    expect(results[1].result).toBe('hello');
  });

  it('accepts valid pipeline with optional fields', async () => {
    const { status, body } = await postPipeline({
      steps: [
        { command: 'add', params: { a: 1, b: 2 }, as: 'sum' },
      ],
      continueOnError: true,
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('reports correct step index for second invalid step', async () => {
    const { status, body } = await postPipeline({
      steps: [
        { command: 'echo' },
        { command: 42 },
      ],
    });
    expect(status).toBe(400);
    expect((body.error as Record<string, string>).message).toContain('steps[1]');
  });
});
