# Security Headers Middleware

A recipe for adding production security headers to your Surf.js API.

## Quick Start

```ts
import { createSurf } from '@surfjs/core';
import type { SurfMiddleware } from '@surfjs/core';

// Create the middleware factory (copy securityHeaders from index.ts)
const surf = await createSurf({
  name: 'My API',
  middleware: [securityHeaders()],
  commands: { ... },
});
```

## What It Does

Adds these security headers to every Surf response:

| Header | Default | Purpose |
|--------|---------|---------|
| `Content-Security-Policy` | `default-src 'self'; ...` | Controls resource loading |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Forces HTTPS |
| `X-Frame-Options` | `DENY` | Prevents clickjacking |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Controls referrer leaking |
| `Permissions-Policy` | `camera=(), microphone=(), ...` | Restricts browser APIs |
| `X-Permitted-Cross-Domain-Policies` | `none` | Blocks Flash/Acrobat access |

## Configuration

Every header can be customized or disabled:

```ts
securityHeaders({
  // Custom CSP for APIs that serve scripts
  contentSecurityPolicy: "default-src 'self'; script-src 'self' cdn.example.com",

  // Preload HSTS
  strictTransportSecurity: 'max-age=63072000; includeSubDomains; preload',

  // Disable X-Frame-Options (using CSP frame-ancestors instead)
  xFrameOptions: false,

  // Allow geolocation for your own origin
  permissionsPolicy: 'camera=(), microphone=(), geolocation=(self)',
})
```

## Framework Integration

### Express

```ts
import express from 'express';
import { createSurf } from '@surfjs/core';

const app = express();
const surf = await createSurf({
  name: 'My API',
  middleware: [securityHeaders()],
  commands: { ... },
});

app.use(surf.middleware());
```

### Behind a Reverse Proxy (Nginx, Cloudflare)

If your reverse proxy already handles HSTS, disable it in the middleware:

```ts
securityHeaders({
  strictTransportSecurity: false, // handled by proxy
})
```

## Notes

- Headers are applied at middleware creation time (zero per-request overhead for header construction)
- The middleware stores headers in `ctx.context.responseHeaders` for the transport layer
- Works with all Surf transports: HTTP, WebSocket, SSE
- For API-only services, the default CSP is intentionally strict — loosen it if you serve HTML
