import type { SurfManifest } from './types.js';
import { SurfClientError } from './client.js';

/**
 * Discover a Surf manifest from a website URL.
 *
 * Uses a two-step discovery process:
 * 1. Tries `GET /.well-known/surf.json` (standard location)
 * 2. Falls back to parsing the HTML root page for a `<meta name="surf" content="...">` tag
 *    pointing to the manifest URL
 *
 * @param baseUrl - The base URL of the Surf-enabled site (e.g. `'https://example.com'`).
 * @param fetchFn - Custom `fetch` implementation. Defaults to `globalThis.fetch`.
 * @param timeoutMs - Discovery timeout in milliseconds. Default: `5000`.
 * @param auth - Optional Bearer token for authenticated manifest endpoints.
 * @returns The parsed {@link SurfManifest}.
 * @throws {@link SurfClientError} with code `TIMEOUT` if discovery times out.
 * @throws {@link SurfClientError} with code `NETWORK_ERROR` on network failures.
 * @throws {@link SurfClientError} with code `INVALID_MANIFEST` if the manifest is missing or malformed.
 *
 * @example
 * ```ts
 * const manifest = await discoverManifest('https://example.com');
 * console.log(manifest.name);     // 'My Store'
 * console.log(manifest.commands);  // { search: { ... }, getProduct: { ... } }
 * ```
 */
export async function discoverManifest(
  baseUrl: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
  timeoutMs = 5000,
  auth?: string,
): Promise<SurfManifest> {
  const url = new URL('/.well-known/surf.json', baseUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const baseHeaders: Record<string, string> = {};
  if (auth) {
    baseHeaders['Authorization'] = `Bearer ${auth}`;
  }

  try {
    let response: Response;
    try {
      response = await fetchFn(url.toString(), {
        headers: { Accept: 'application/json', ...baseHeaders },
        signal: controller.signal,
      });
    } catch (e) {
      // Distinguish timeout (AbortError) from network errors
      if (e instanceof Error && e.name === 'AbortError') {
        throw new SurfClientError(
          `Surf manifest discovery timed out after ${timeoutMs}ms at ${url}`,
          'TIMEOUT',
        );
      }
      throw new SurfClientError(
        `Network error discovering Surf manifest at ${url}: ${e instanceof Error ? e.message : String(e)}`,
        'NETWORK_ERROR',
      );
    }

    if (response.ok) {
      const manifest = (await response.json()) as SurfManifest;
      if (!manifest.surf || !manifest.commands) {
        throw new SurfClientError(
          'Invalid Surf manifest: missing required fields (surf, commands)',
          'INVALID_MANIFEST',
        );
      }
      return manifest;
    }

    // Fallback: try HTML <meta name="surf" content="..."> discovery
    const htmlUrl = new URL('/', baseUrl);
    let htmlResp: Response;
    try {
      htmlResp = await fetchFn(htmlUrl.toString(), {
        headers: { Accept: 'text/html', ...baseHeaders },
        signal: controller.signal,
      });
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        throw new SurfClientError(
          `Surf manifest discovery timed out after ${timeoutMs}ms`,
          'TIMEOUT',
        );
      }
      throw new SurfClientError(
        `Network error during fallback manifest discovery: ${e instanceof Error ? e.message : String(e)}`,
        'NETWORK_ERROR',
      );
    }

    if (htmlResp.ok) {
      const html = await htmlResp.text();
      const match = html.match(/<meta\s+name=["']surf["']\s+content=["']([^"']+)["']/i)
        ?? html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']surf["']/i);

      if (match?.[1]) {
        const manifestUrl = new URL(match[1], baseUrl);
        let mResp: Response;
        try {
          mResp = await fetchFn(manifestUrl.toString(), {
            headers: { Accept: 'application/json', ...baseHeaders },
            signal: controller.signal,
          });
        } catch (e) {
          if (e instanceof Error && e.name === 'AbortError') {
            throw new SurfClientError(
              `Surf manifest discovery timed out after ${timeoutMs}ms`,
              'TIMEOUT',
            );
          }
          throw new SurfClientError(
            `Network error fetching manifest from meta tag: ${e instanceof Error ? e.message : String(e)}`,
            'NETWORK_ERROR',
          );
        }
        if (mResp.ok) {
          const manifest = (await mResp.json()) as SurfManifest;
          if (!manifest.surf || !manifest.commands) {
            throw new SurfClientError(
              'Invalid Surf manifest: missing required fields (surf, commands)',
              'INVALID_MANIFEST',
            );
          }
          return manifest;
        }
      }
    }

    throw new SurfClientError(
      `Failed to discover Surf manifest at ${url}: HTTP ${response.status} ${response.statusText}`,
      'INVALID_MANIFEST',
      response.status,
    );
  } finally {
    clearTimeout(timer);
  }
}
