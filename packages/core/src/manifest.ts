import type { SurfConfig, SurfManifest, ManifestCommand, CommandDefinition, ParamSchema, PaginationConfig } from './types.js';
import { flattenCommands } from './namespace.js';

const SPEC_VERSION = '0.1.0';

/**
 * Compute a deterministic SHA-256 checksum of the command schema.
 * Uses the Web Crypto API (available in Node 18+, Cloudflare Workers,
 * Vercel Edge Functions, and Deno Deploy).
 * Keys are sorted to ensure stability across restarts for identical configs.
 */
async function computeChecksum(commands: Record<string, ManifestCommand>): Promise<string> {
  const sortedKeys = Object.keys(commands).sort();
  const sorted: Record<string, ManifestCommand> = {};
  for (const key of sortedKeys) {
    sorted[key] = commands[key]!;
  }
  const encoded = new TextEncoder().encode(JSON.stringify(sorted));
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface ManifestOptions {
  /** When set, includes commands with `auth: 'hidden'` in the manifest. */
  authenticated?: boolean;
  /** Override the updatedAt timestamp. */
  updatedAt?: string;
}

/**
 * Generate a Surf manifest from a config.
 * Flattens nested command groups to dot-notation keys.
 * Includes a deterministic checksum and updatedAt timestamp.
 *
 * Commands with `auth: 'hidden'` are excluded from the manifest
 * unless `options.authenticated` is true. They are still executable
 * when a valid auth token is provided.
 */
export async function generateManifest(config: SurfConfig, options?: ManifestOptions | string): Promise<SurfManifest> {
  // Backward compat: string arg = updatedAt
  const opts: ManifestOptions = typeof options === 'string' ? { updatedAt: options } : (options ?? {});
  const flat = flattenCommands(config.commands);
  const commands: Record<string, ManifestCommand> = {};

  for (const [name, def] of Object.entries(flat)) {
    // Filter out hidden commands when not authenticated
    if (def.auth === 'hidden' && !opts.authenticated) continue;
    const manifest = stripHandler(def);
    // Expose hidden commands as 'required' in the authenticated manifest —
    // agents don't need to know the 'hidden' distinction once they can see them
    if (manifest.auth === 'hidden') manifest.auth = 'required';
    commands[name] = manifest;
  }

  const checksum = await computeChecksum(commands);

  return {
    surf: SPEC_VERSION,
    name: config.name,
    ...(config.description ? { description: config.description } : {}),
    ...(config.about ? { about: config.about } : {}),
    ...(config.version ? { version: config.version } : {}),
    ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
    ...(config.auth ? { auth: config.auth } : {}),
    commands,
    ...(config.events ? { events: config.events } : {}),
    ...(config.types ? { types: config.types } : {}),
    checksum,
    updatedAt: opts.updatedAt ?? new Date().toISOString(),
  };
}

/**
 * Build standard pagination params based on the pagination config style.
 */
function buildPaginationParams(config: true | PaginationConfig): Record<string, ParamSchema> {
  const resolved: PaginationConfig = config === true ? {} : config;
  const style = resolved.style ?? 'cursor';
  const params: Record<string, ParamSchema> = {};

  if (style === 'cursor') {
    params['cursor'] = {
      type: 'string',
      description: 'Opaque cursor from a previous response\'s nextCursor.',
    };
  } else {
    params['offset'] = {
      type: 'number',
      description: 'Zero-based index to start from.',
      default: 0,
    };
  }

  params['limit'] = {
    type: 'number',
    description: `Maximum number of items to return.${resolved.maxLimit ? ` Max: ${resolved.maxLimit}.` : ''}`,
    ...(resolved.defaultLimit != null ? { default: resolved.defaultLimit } : {}),
  };

  return params;
}

function stripHandler(def: CommandDefinition): ManifestCommand {
  const result: ManifestCommand = {
    description: def.description,
  };

  if (def.params) result.params = { ...def.params };
  if (def.returns) result.returns = def.returns;
  if (def.tags) result.tags = def.tags;
  if (def.auth) result.auth = def.auth;
  if (def.hints) result.hints = def.hints;
  if (def.examples) result.examples = def.examples;
  if (def.rateLimit) result.rateLimit = { windowMs: def.rateLimit.windowMs, maxRequests: def.rateLimit.maxRequests };

  if (def.requiredScopes && def.requiredScopes.length > 0) result.requiredScopes = def.requiredScopes;

  // Pagination: auto-inject params and set paginated flag
  if (def.paginated) {
    const paginationParams = buildPaginationParams(def.paginated);
    result.params = { ...(result.params ?? {}), ...paginationParams };
    result.paginated = true;
  }

  return result;
}
