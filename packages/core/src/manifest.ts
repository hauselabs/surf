import { createHash } from 'node:crypto';
import type { SurfConfig, SurfManifest, ManifestCommand, CommandDefinition } from './types.js';
import { flattenCommands } from './namespace.js';

const SPEC_VERSION = '0.1.0';

/**
 * Compute a deterministic SHA-256 checksum of the command schema.
 * Keys are sorted to ensure stability across restarts for identical configs.
 */
function computeChecksum(commands: Record<string, ManifestCommand>): string {
  const sortedKeys = Object.keys(commands).sort();
  const sorted: Record<string, ManifestCommand> = {};
  for (const key of sortedKeys) {
    sorted[key] = commands[key]!;
  }
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

/**
 * Generate a Surf manifest from a config.
 * Flattens nested command groups to dot-notation keys.
 * Includes a deterministic checksum and updatedAt timestamp.
 */
export function generateManifest(config: SurfConfig, updatedAt?: string): SurfManifest {
  const flat = flattenCommands(config.commands);
  const commands: Record<string, ManifestCommand> = {};

  for (const [name, def] of Object.entries(flat)) {
    commands[name] = stripHandler(def);
  }

  const checksum = computeChecksum(commands);

  return {
    surf: SPEC_VERSION,
    name: config.name,
    ...(config.description ? { description: config.description } : {}),
    ...(config.version ? { version: config.version } : {}),
    ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
    ...(config.auth ? { auth: config.auth } : {}),
    commands,
    ...(config.events ? { events: config.events } : {}),
    ...(config.types ? { types: config.types } : {}),
    checksum,
    updatedAt: updatedAt ?? new Date().toISOString(),
  };
}

function stripHandler(def: CommandDefinition): ManifestCommand {
  const result: ManifestCommand = {
    description: def.description,
  };

  if (def.params) result.params = def.params;
  if (def.returns) result.returns = def.returns;
  if (def.tags) result.tags = def.tags;
  if (def.auth) result.auth = def.auth;
  if (def.hints) result.hints = def.hints;

  return result;
}
