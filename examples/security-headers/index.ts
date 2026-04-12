/**
 * Security Headers Middleware for Surf.js
 *
 * Adds common HTTP security headers (CSP, HSTS, X-Frame-Options, etc.)
 * as a Surf middleware. Works with any transport (Express, Fastify, Hono, etc.).
 *
 * Usage:
 *   import { securityHeaders } from './security-headers'
 *
 *   const surf = await createSurf({
 *     name: 'My API',
 *     middleware: [securityHeaders()],
 *     commands: { ... },
 *   })
 */

import { createSurf } from '@surfjs/core';
import type { SurfMiddleware } from '@surfjs/core';

// ─── Security Headers Middleware ──────────────────────────────────────────────

interface SecurityHeadersOptions {
  /**
   * Content-Security-Policy header value.
   * Controls which resources the browser can load.
   * @default "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
   */
  contentSecurityPolicy?: string | false;

  /**
   * Strict-Transport-Security header.
   * Forces HTTPS for the specified duration.
   * @default "max-age=31536000; includeSubDomains"
   */
  strictTransportSecurity?: string | false;

  /**
   * X-Frame-Options header.
   * Prevents clickjacking by controlling iframe embedding.
   * @default "DENY"
   */
  xFrameOptions?: 'DENY' | 'SAMEORIGIN' | false;

  /**
   * X-Content-Type-Options header.
   * Prevents MIME-type sniffing.
   * @default "nosniff"
   */
  xContentTypeOptions?: 'nosniff' | false;

  /**
   * Referrer-Policy header.
   * Controls how much referrer info is sent with requests.
   * @default "strict-origin-when-cross-origin"
   */
  referrerPolicy?: string | false;

  /**
   * Permissions-Policy header.
   * Controls which browser features can be used.
   * @default "camera=(), microphone=(), geolocation=(), payment=()"
   */
  permissionsPolicy?: string | false;

  /**
   * X-Permitted-Cross-Domain-Policies header.
   * Controls Adobe Flash/Acrobat cross-domain access.
   * @default "none"
   */
  crossDomainPolicies?: 'none' | 'master-only' | 'by-content-type' | 'all' | false;
}

/**
 * Create a Surf middleware that injects security headers into every response.
 *
 * All headers have sensible defaults and can be individually overridden or
 * disabled (set to `false`).
 *
 * @example
 * ```ts
 * // Use all defaults
 * surf.use(securityHeaders());
 *
 * // Customize CSP and disable HSTS (e.g. behind a reverse proxy)
 * surf.use(securityHeaders({
 *   contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline'",
 *   strictTransportSecurity: false,
 * }));
 * ```
 */
function securityHeaders(options: SecurityHeadersOptions = {}): SurfMiddleware {
  const {
    contentSecurityPolicy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    strictTransportSecurity = 'max-age=31536000; includeSubDomains',
    xFrameOptions = 'DENY',
    xContentTypeOptions = 'nosniff',
    referrerPolicy = 'strict-origin-when-cross-origin',
    permissionsPolicy = 'camera=(), microphone=(), geolocation=(), payment=()',
    crossDomainPolicies = 'none',
  } = options;

  // Pre-build header map at creation time (not per-request)
  const headers: Record<string, string> = {};

  if (contentSecurityPolicy !== false) {
    headers['Content-Security-Policy'] = contentSecurityPolicy;
  }
  if (strictTransportSecurity !== false) {
    headers['Strict-Transport-Security'] = strictTransportSecurity;
  }
  if (xFrameOptions !== false) {
    headers['X-Frame-Options'] = xFrameOptions;
  }
  if (xContentTypeOptions !== false) {
    headers['X-Content-Type-Options'] = xContentTypeOptions;
  }
  if (referrerPolicy !== false) {
    headers['Referrer-Policy'] = referrerPolicy;
  }
  if (permissionsPolicy !== false) {
    headers['Permissions-Policy'] = permissionsPolicy;
  }
  if (crossDomainPolicies !== false) {
    headers['X-Permitted-Cross-Domain-Policies'] = crossDomainPolicies;
  }

  return async (ctx, next) => {
    // Store headers in context so the transport layer can apply them.
    // The context object is passed through to the response — transports
    // that support custom headers will pick these up.
    const existing = (ctx.context as Record<string, unknown>).responseHeaders as Record<string, string> | undefined;
    (ctx.context as Record<string, unknown>).responseHeaders = {
      ...existing,
      ...headers,
    };

    await next();
  };
}

// ─── Example Usage ───────────────────────────────────────────────────────────

const surf = await createSurf({
  name: 'Secure API',
  description: 'Example API with security headers middleware',
  version: '1.0.0',

  middleware: [
    // Add security headers with defaults
    securityHeaders(),

    // Or customize:
    // securityHeaders({
    //   contentSecurityPolicy: "default-src 'self'; script-src 'self' cdn.example.com",
    //   strictTransportSecurity: 'max-age=63072000; includeSubDomains; preload',
    //   permissionsPolicy: 'camera=(), microphone=(), geolocation=(self)',
    // }),
  ],

  commands: {
    hello: {
      description: 'Returns a greeting',
      params: {
        name: { type: 'string', default: 'world', description: 'Name to greet' },
      },
      run: async ({ name }) => ({ message: `Hello, ${name}!` }),
    },
  },
});

// Export for use in any server framework
export { securityHeaders, surf };
export type { SecurityHeadersOptions };
