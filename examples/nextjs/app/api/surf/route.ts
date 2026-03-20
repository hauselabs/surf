import { NextResponse } from 'next/server';
import { surf } from './surf-instance';

/**
 * GET /.well-known/surf.json → returns the Surf manifest
 *
 * Next.js doesn't support well-known paths easily, so you can also
 * use this endpoint and configure a rewrite in next.config.ts:
 *   { source: '/.well-known/surf.json', destination: '/api/surf' }
 */
export async function GET() {
  return NextResponse.json(surf.manifest());
}
