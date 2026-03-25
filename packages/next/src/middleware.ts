import { NextResponse, type NextRequest } from 'next/server';

export interface SurfMiddlewareOptions {
  /**
   * The base path where the Surf catch-all route is mounted.
   * @default '/api/surf'
   */
  basePath?: string;
}

/**
 * Creates a Next.js middleware that rewrites `/.well-known/surf.json`
 * to your Surf API route, enabling standard Surf discovery at the domain root.
 *
 * @example
 * ```ts
 * // middleware.ts
 * import { surfMiddleware } from '@surfjs/next/middleware';
 *
 * export default surfMiddleware();
 * export const config = { matcher: ['/.well-known/surf.json'] };
 * ```
 *
 * @example
 * ```ts
 * // Compose with existing middleware
 * import { surfMiddleware } from '@surfjs/next/middleware';
 *
 * const surf = surfMiddleware();
 *
 * export default function middleware(request: NextRequest) {
 *   const surfResponse = surf(request);
 *   if (surfResponse) return surfResponse;
 *
 *   // ... your other middleware logic
 *   return NextResponse.next();
 * }
 *
 * export const config = { matcher: ['/.well-known/surf.json', '/other/:path*'] };
 * ```
 */
export function surfMiddleware(options: SurfMiddlewareOptions = {}) {
  const basePath = options.basePath ?? '/api/surf';

  return function middleware(request: NextRequest): NextResponse | undefined {
    const { pathname } = request.nextUrl;

    if (pathname === '/.well-known/surf.json') {
      const url = request.nextUrl.clone();
      url.pathname = basePath;
      return NextResponse.rewrite(url);
    }

    return undefined;
  };
}
