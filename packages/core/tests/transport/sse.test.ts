import { describe, it, expect, vi } from 'vitest';
import {
  createSseWriter,
  chunkEvent,
  doneEvent,
  errorEvent,
  type SseCompatibleResponse,
} from '../../src/transport/sse.js';

// ─── Mock response helpers ──────────────────────────────────────────────────

function createMockResponse(): SseCompatibleResponse & {
  written: string[];
  ended: boolean;
  statusCode: number;
  headersWritten: Record<string, string>;
} {
  const mock = {
    written: [] as string[],
    ended: false,
    statusCode: 0,
    headersWritten: {} as Record<string, string>,
    writeHead(status: number, headers?: Record<string, string>) {
      mock.statusCode = status;
      if (headers) Object.assign(mock.headersWritten, headers);
    },
    write(data: string): boolean {
      mock.written.push(data);
      return true;
    },
    end(_body?: string) {
      mock.ended = true;
    },
    flushHeaders: vi.fn(),
  };
  return mock;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('SSE Transport', () => {
  describe('createSseWriter', () => {
    it('sets correct SSE headers on the response', () => {
      const res = createMockResponse();
      createSseWriter(res);

      expect(res.statusCode).toBe(200);
      expect(res.headersWritten['Content-Type']).toBe('text/event-stream');
      expect(res.headersWritten['Cache-Control']).toBe('no-cache');
      expect(res.headersWritten['Connection']).toBe('keep-alive');
    });

    it('includes extra headers when provided', () => {
      const res = createMockResponse();
      createSseWriter(res, { 'Access-Control-Allow-Origin': '*' });

      expect(res.headersWritten['Access-Control-Allow-Origin']).toBe('*');
      expect(res.headersWritten['Content-Type']).toBe('text/event-stream');
    });

    it('calls flushHeaders when available', () => {
      const res = createMockResponse();
      createSseWriter(res);

      expect(res.flushHeaders).toHaveBeenCalledOnce();
    });

    it('does not throw if flushHeaders is unavailable', () => {
      const res = createMockResponse();
      delete (res as Partial<Pick<typeof res, 'flushHeaders'>>).flushHeaders;

      expect(() => createSseWriter(res)).not.toThrow();
    });

    it('writes SSE-formatted data events', () => {
      const res = createMockResponse();
      const writer = createSseWriter(res);

      writer.write({ type: 'chunk', data: { message: 'hello' } });

      expect(res.written).toHaveLength(1);
      expect(res.written[0]).toMatch(/^data: /);
      expect(res.written[0]).toMatch(/\n\n$/);

      const parsed = JSON.parse(res.written[0].replace('data: ', '').trim());
      expect(parsed).toEqual({ type: 'chunk', data: { message: 'hello' } });
    });

    it('writes multiple events in sequence', () => {
      const res = createMockResponse();
      const writer = createSseWriter(res);

      writer.write({ type: 'chunk', data: 1 });
      writer.write({ type: 'chunk', data: 2 });
      writer.write({ type: 'done', result: 'finished' });

      expect(res.written).toHaveLength(3);
    });

    it('close() ends the response', () => {
      const res = createMockResponse();
      const writer = createSseWriter(res);

      expect(res.ended).toBe(false);
      writer.close();
      expect(res.ended).toBe(true);
    });
  });

  describe('event factories', () => {
    it('chunkEvent creates correct shape', () => {
      const event = chunkEvent({ items: [1, 2, 3] });
      expect(event).toEqual({ type: 'chunk', data: { items: [1, 2, 3] } });
    });

    it('chunkEvent handles primitive data', () => {
      expect(chunkEvent('text')).toEqual({ type: 'chunk', data: 'text' });
      expect(chunkEvent(42)).toEqual({ type: 'chunk', data: 42 });
      expect(chunkEvent(null)).toEqual({ type: 'chunk', data: null });
    });

    it('doneEvent creates correct shape with result', () => {
      const event = doneEvent({ total: 3 });
      expect(event).toEqual({ type: 'done', result: { total: 3 } });
    });

    it('doneEvent creates correct shape without result', () => {
      const event = doneEvent();
      expect(event).toEqual({ type: 'done', result: undefined });
    });

    it('errorEvent creates correct shape', () => {
      const event = errorEvent('RATE_LIMITED', 'Too many requests');
      expect(event).toEqual({
        type: 'error',
        error: { code: 'RATE_LIMITED', message: 'Too many requests' },
      });
    });
  });

  describe('SSE stream integration', () => {
    it('full lifecycle: headers → chunks → done → close', () => {
      const res = createMockResponse();
      const writer = createSseWriter(res);

      // Write some chunks
      writer.write(chunkEvent('partial-1'));
      writer.write(chunkEvent('partial-2'));
      writer.write(doneEvent('final'));
      writer.close();

      // Verify
      expect(res.statusCode).toBe(200);
      expect(res.written).toHaveLength(3);
      expect(res.ended).toBe(true);

      // Parse all events
      const events = res.written.map((w) =>
        JSON.parse(w.replace('data: ', '').trim()),
      );
      expect(events[0]).toEqual({ type: 'chunk', data: 'partial-1' });
      expect(events[1]).toEqual({ type: 'chunk', data: 'partial-2' });
      expect(events[2]).toEqual({ type: 'done', result: 'final' });
    });

    it('error stream: headers → error → close', () => {
      const res = createMockResponse();
      const writer = createSseWriter(res);

      writer.write(errorEvent('INTERNAL_ERROR', 'Something broke'));
      writer.close();

      expect(res.written).toHaveLength(1);
      const parsed = JSON.parse(res.written[0].replace('data: ', '').trim());
      expect(parsed.type).toBe('error');
      expect(parsed.error.code).toBe('INTERNAL_ERROR');
      expect(res.ended).toBe(true);
    });
  });
});
