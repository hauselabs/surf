import type { SurfManifest } from './types.js';

/**
 * Discover a Surf manifest from a URL.
 * Tries /.well-known/surf.json first, then falls back to HTML <meta name="surf"> tag.
 */
export async function discoverManifest(
  baseUrl: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
  timeoutMs = 5000,
): Promise<SurfManifest> {
  const url = new URL('/.well-known/surf.json', baseUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (response.ok) {
      const manifest = (await response.json()) as SurfManifest;
      if (!manifest.surf || !manifest.commands) {
        throw new Error('Invalid Surf manifest: missing required fields (surf, commands)');
      }
      return manifest;
    }

    // Fallback: try HTML <meta name="surf" content="..."> discovery
    const htmlUrl = new URL('/', baseUrl);
    const htmlResp = await fetchFn(htmlUrl.toString(), {
      headers: { Accept: 'text/html' },
      signal: controller.signal,
    });

    if (htmlResp.ok) {
      const html = await htmlResp.text();
      const match = html.match(/<meta\s+name=["']surf["']\s+content=["']([^"']+)["']/i)
        ?? html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']surf["']/i);

      if (match?.[1]) {
        const manifestUrl = new URL(match[1], baseUrl);
        const mResp = await fetchFn(manifestUrl.toString(), {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (mResp.ok) {
          const manifest = (await mResp.json()) as SurfManifest;
          if (!manifest.surf || !manifest.commands) {
            throw new Error('Invalid Surf manifest: missing required fields (surf, commands)');
          }
          return manifest;
        }
      }
    }

    throw new Error(
      `Failed to discover Surf manifest at ${url}: ${response.status} ${response.statusText}`,
    );
  } finally {
    clearTimeout(timer);
  }
}
