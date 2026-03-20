import { NextRequest, NextResponse } from 'next/server';
import { surf } from '../surf-instance';

/**
 * POST /api/surf/execute — Execute a Surf command.
 *
 * `surf.commands.execute()` already returns a SurfResponse
 * (with `ok`, `result`/`error`), so we forward it directly.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { command, params, sessionId } = body;

  const response = await surf.commands.execute(command, params, {
    sessionId,
    auth: request.headers.get('authorization')?.replace('Bearer ', '') ?? undefined,
  });

  const statusCode = response.ok ? 200 : getErrorStatus(response.error.code);
  return NextResponse.json(response, { status: statusCode });
}

function getErrorStatus(code: string): number {
  switch (code) {
    case 'UNKNOWN_COMMAND': return 404;
    case 'INVALID_PARAMS': return 400;
    case 'AUTH_REQUIRED': return 401;
    case 'AUTH_FAILED': return 403;
    case 'RATE_LIMITED': return 429;
    default: return 500;
  }
}
