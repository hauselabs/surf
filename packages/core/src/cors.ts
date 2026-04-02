/**
 * CORS configuration and resolution for Surf transports and adapters.
 *
 * By default (no config or `origin: '*'`), Surf sends `Access-Control-Allow-Origin: *`
 * for full backwards compatibility. When an explicit allowlist or function is provided,
 * the request `Origin` header is checked and only matching origins receive the header.
 */

/**
 * CORS configuration for Surf HTTP transports.
 *
 * @example
 * ```ts
 * const surf = await createSurf({
 *   name: 'my-app',
 *   cors: {
 *     origin: ['https://example.com', 'https://staging.example.com'],
 *     credentials: true,
 *   },
 *   commands: { ... },
 * });
 * ```
 */
export interface CorsConfig {
  /**
   * Allowed origins.
   *
   * - `'*'` — allow any origin (default, backwards-compatible)
   * - `string` — allow a single origin (e.g. `'https://example.com'`)
   * - `string[]` — allow multiple origins
   * - `(origin: string) => boolean` — dynamic check function
   */
  origin: string | string[] | ((origin: string) => boolean);

  /**
   * Whether to include `Access-Control-Allow-Credentials: true`.
   *
   * When `true`, the wildcard `*` origin is NOT used — the specific
   * request origin is echoed back (per the CORS spec, credentials
   * and wildcard origins are incompatible).
   *
   * @default false
   */
  credentials?: boolean;
}

/**
 * Resolve CORS headers for a given request origin.
 *
 * @param config - CORS configuration, or undefined for default (`*`)
 * @param requestOrigin - The `Origin` header from the incoming request
 * @returns A record of CORS headers to apply to the response
 */
export function resolveCorsHeaders(
  config: CorsConfig | undefined,
  requestOrigin: string | undefined | null,
): Record<string, string> {
  // Default: wildcard (backwards-compatible)
  if (!config) {
    return { 'Access-Control-Allow-Origin': '*' };
  }

  const { origin, credentials } = config;

  // Wildcard origin
  if (origin === '*') {
    if (credentials) {
      // Credentials + wildcard: must echo the specific origin (spec requirement)
      if (requestOrigin) {
        return {
          'Access-Control-Allow-Origin': requestOrigin,
          'Access-Control-Allow-Credentials': 'true',
          'Vary': 'Origin',
        };
      }
      // No origin header — can't set credentials meaningfully
      return { 'Access-Control-Allow-Origin': '*' };
    }
    return { 'Access-Control-Allow-Origin': '*' };
  }

  // No request origin — can't match, deny CORS
  if (!requestOrigin) {
    return {};
  }

  let allowed = false;

  if (typeof origin === 'string') {
    allowed = requestOrigin === origin;
  } else if (Array.isArray(origin)) {
    allowed = origin.includes(requestOrigin);
  } else if (typeof origin === 'function') {
    allowed = origin(requestOrigin);
  }

  if (!allowed) {
    // Origin not allowed — omit Access-Control-Allow-Origin entirely
    return {};
  }

  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': requestOrigin,
    'Vary': 'Origin',
  };

  if (credentials) {
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  return headers;
}

/**
 * Resolve CORS preflight headers (OPTIONS request).
 * Includes Allow-Methods and Allow-Headers in addition to origin headers.
 *
 * @param config - CORS configuration, or undefined for default (`*`)
 * @param requestOrigin - The `Origin` header from the incoming request
 * @param methods - Allowed methods (default: 'GET, POST, OPTIONS')
 * @param allowHeaders - Allowed headers (default: 'Content-Type, Authorization')
 * @returns A record of CORS preflight headers
 */
export function resolveCorsPreflightHeaders(
  config: CorsConfig | undefined,
  requestOrigin: string | undefined | null,
  methods = 'GET, POST, OPTIONS',
  allowHeaders = 'Content-Type, Authorization',
): Record<string, string> {
  const originHeaders = resolveCorsHeaders(config, requestOrigin);
  return {
    ...originHeaders,
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': allowHeaders,
  };
}
