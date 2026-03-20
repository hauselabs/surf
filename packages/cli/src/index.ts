/**
 * @surfjs/cli — Inspect and test Surf-enabled websites from the terminal.
 *
 * Usage:
 *   surf inspect <url>              Fetch manifest and pretty-print commands
 *   surf test <url> <cmd> [--args]  Execute a command interactively
 *   surf ping <url>                 Check if a site is Surf-enabled
 *
 * Global flags:
 *   --json          Machine-readable JSON output
 *   --auth <token>  Bearer token for authenticated commands
 *   --verbose       Show full parameter schemas (inspect)
 */

import * as readline from 'node:readline';

// ─── ANSI Colours ────────────────────────────────────────────────────────────

const isTTY = process.stdout.isTTY;

const c = {
  reset: isTTY ? '\x1b[0m' : '',
  bold: isTTY ? '\x1b[1m' : '',
  dim: isTTY ? '\x1b[2m' : '',
  red: isTTY ? '\x1b[31m' : '',
  green: isTTY ? '\x1b[32m' : '',
  yellow: isTTY ? '\x1b[33m' : '',
  blue: isTTY ? '\x1b[34m' : '',
  magenta: isTTY ? '\x1b[35m' : '',
  cyan: isTTY ? '\x1b[36m' : '',
  white: isTTY ? '\x1b[37m' : '',
  gray: isTTY ? '\x1b[90m' : '',
  bgRed: isTTY ? '\x1b[41m' : '',
  bgGreen: isTTY ? '\x1b[42m' : '',
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface ParamSchema {
  type?: string;
  required?: boolean;
  default?: unknown;
  description?: string;
}

interface CommandSchema {
  description?: string;
  params?: Record<string, ParamSchema>;
  auth?: string;
  hints?: Record<string, unknown>;
}

interface SurfManifest {
  surf?: string;
  name?: string;
  description?: string;
  version?: string;
  commands?: Record<string, CommandSchema>;
}

interface ExecuteResponse {
  ok: boolean;
  result?: unknown;
  error?: string;
  timing?: { ms?: number };
}

// ─── Argument Parsing ────────────────────────────────────────────────────────

interface ParsedArgs {
  command: string | undefined;
  url: string | undefined;
  subcommand: string | undefined;
  params: Record<string, string>;
  json: boolean;
  auth: string | undefined;
  verbose: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0];
  const url = argv[1];
  const subcommand = argv[2];
  const params: Record<string, string> = {};
  let json = false;
  let auth: string | undefined;
  let verbose = false;

  let i = command === 'test' ? 3 : 2;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '--json') {
      json = true;
      i++;
    } else if (arg === '--auth' && i + 1 < argv.length) {
      auth = argv[i + 1];
      i += 2;
    } else if (arg === '--verbose') {
      verbose = true;
      i++;
    } else if (arg.startsWith('--') && i + 1 < argv.length) {
      const key = arg.slice(2);
      params[key] = argv[i + 1];
      i += 2;
    } else {
      i++;
    }
  }

  return { command, url, subcommand, params, json, auth, verbose };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildHeaders(auth?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) headers['Authorization'] = `Bearer ${auth}`;
  return headers;
}

async function fetchManifest(siteUrl: string, auth?: string): Promise<SurfManifest> {
  const manifestUrl = new URL('/.well-known/surf.json', siteUrl).toString();
  const res = await fetch(manifestUrl, { headers: buildHeaders(auth) });

  if (!res.ok) {
    throw new Error(`No Surf manifest at ${manifestUrl} (HTTP ${res.status})`);
  }

  return (await res.json()) as SurfManifest;
}

function promptUser(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function coerceValue(value: string, type?: string): unknown {
  if (type === 'number') {
    const n = Number(value);
    return isNaN(n) ? value : n;
  }
  if (type === 'boolean') {
    return value === 'true' || value === '1';
  }
  return value;
}

function syntaxHighlightJson(obj: unknown): string {
  const raw = JSON.stringify(obj, null, 2);
  if (!isTTY) return raw;

  return raw.replace(
    /("(?:[^"\\]|\\.)*")\s*:/g,
    `${c.cyan}$1${c.reset}:`,
  ).replace(
    /:\s*("(?:[^"\\]|\\.)*")/g,
    (match, val) => match.replace(val as string, `${c.green}${val}${c.reset}`),
  ).replace(
    /:\s*(\d+\.?\d*)/g,
    (match, val) => match.replace(val as string, `${c.yellow}${val}${c.reset}`),
  ).replace(
    /:\s*(true|false)/g,
    (match, val) => match.replace(val as string, `${c.magenta}${val}${c.reset}`),
  ).replace(
    /:\s*(null)/g,
    (match, val) => match.replace(val as string, `${c.dim}${val}${c.reset}`),
  );
}

// ─── Commands ────────────────────────────────────────────────────────────────

async function ping(siteUrl: string, opts: ParsedArgs): Promise<void> {
  const start = performance.now();
  try {
    const manifestUrl = new URL('/.well-known/surf.json', siteUrl).toString();
    const res = await fetch(manifestUrl, {
      method: 'HEAD',
      headers: buildHeaders(opts.auth),
    });
    const ms = Math.round(performance.now() - start);

    if (opts.json) {
      console.log(JSON.stringify({ ok: res.ok, status: res.status, ms }));
      return;
    }

    if (res.ok) {
      console.log(`${c.green}✅ ${siteUrl} is Surf-enabled${c.reset} ${c.dim}(${ms}ms)${c.reset}`);
    } else {
      console.log(`${c.red}❌ ${siteUrl} is not Surf-enabled${c.reset} ${c.dim}(HTTP ${res.status}, ${ms}ms)${c.reset}`);
      process.exit(1);
    }
  } catch (err) {
    const ms = Math.round(performance.now() - start);
    if (opts.json) {
      console.log(JSON.stringify({ ok: false, error: (err as Error).message, ms }));
      process.exit(1);
    }
    console.log(`${c.red}❌ Could not reach ${siteUrl}: ${(err as Error).message}${c.reset}`);
    process.exit(1);
  }
}

async function inspect(siteUrl: string, opts: ParsedArgs): Promise<void> {
  const start = performance.now();
  try {
    const manifest = await fetchManifest(siteUrl, opts.auth);
    const ms = Math.round(performance.now() - start);

    if (opts.json) {
      console.log(JSON.stringify({ ok: true, manifest, ms }));
      return;
    }

    console.log();
    console.log(`${c.bold}${c.cyan}🏄 ${manifest.name || 'Unknown'}${c.reset} ${c.dim}(Surf v${manifest.surf || '?'})${c.reset}`);
    if (manifest.description) console.log(`${c.dim}   ${manifest.description}${c.reset}`);
    console.log();

    const commands = manifest.commands || {};
    const entries = Object.entries(commands);

    if (entries.length === 0) {
      console.log(`   ${c.dim}No commands defined.${c.reset}`);
      return;
    }

    console.log(`   ${c.bold}${entries.length} command${entries.length !== 1 ? 's' : ''} available:${c.reset}`);
    console.log();

    for (const [name, cmd] of entries) {
      const paramEntries = Object.entries(cmd.params || {});
      const paramStr = paramEntries
        .map(([p, s]) => {
          const req = s.required ? '' : '?';
          return `${c.yellow}${p}${req}${c.reset}${c.dim}: ${s.type || 'any'}${c.reset}`;
        })
        .join(', ');

      const auth = cmd.auth === 'required' ? ` ${c.red}🔐${c.reset}` : '';
      console.log(`   ${c.bold}${c.green}${name}${c.reset}(${paramStr})${auth}`);

      if (cmd.description) {
        console.log(`   ${c.dim}${cmd.description}${c.reset}`);
      }

      if (opts.verbose && paramEntries.length > 0) {
        console.log(`   ${c.dim}Parameters:${c.reset}`);
        for (const [pName, pSchema] of paramEntries) {
          const parts: string[] = [];
          if (pSchema.type) parts.push(`type: ${c.yellow}${pSchema.type}${c.reset}`);
          if (pSchema.required) parts.push(`${c.red}required${c.reset}`);
          if (pSchema.default !== undefined) parts.push(`default: ${c.magenta}${JSON.stringify(pSchema.default)}${c.reset}`);
          if (pSchema.description) parts.push(`${c.dim}${pSchema.description}${c.reset}`);
          console.log(`     ${c.cyan}${pName}${c.reset} — ${parts.join(' | ')}`);
        }
      }

      if (opts.verbose && cmd.hints) {
        const hintStr = Object.entries(cmd.hints)
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join(', ');
        console.log(`   ${c.dim}Hints: ${hintStr}${c.reset}`);
      }

      console.log();
    }

    console.log(`${c.dim}   Fetched in ${ms}ms${c.reset}`);
  } catch (err) {
    if (opts.json) {
      console.log(JSON.stringify({ ok: false, error: (err as Error).message }));
      process.exit(1);
    }
    console.log(`${c.red}❌ ${(err as Error).message}${c.reset}`);
    process.exit(1);
  }
}

async function test(siteUrl: string, commandName: string, opts: ParsedArgs): Promise<void> {
  const totalStart = performance.now();

  // 1. Fetch manifest
  let manifest: SurfManifest;
  try {
    manifest = await fetchManifest(siteUrl, opts.auth);
  } catch (err) {
    if (opts.json) {
      console.log(JSON.stringify({ ok: false, error: (err as Error).message }));
      process.exit(1);
    }
    console.log(`${c.red}❌ ${(err as Error).message}${c.reset}`);
    process.exit(1);
    return;
  }

  // 2. Find command
  const commands = manifest.commands || {};
  const cmdSchema = commands[commandName];
  if (!cmdSchema) {
    const available = Object.keys(commands).join(', ');
    const msg = `Command "${commandName}" not found. Available: ${available}`;
    if (opts.json) {
      console.log(JSON.stringify({ ok: false, error: msg }));
      process.exit(1);
    }
    console.log(`${c.red}❌ ${msg}${c.reset}`);
    process.exit(1);
    return;
  }

  // 3. Resolve params
  const paramSchemas = cmdSchema.params || {};
  const resolvedParams: Record<string, unknown> = {};

  // Copy provided params
  for (const [key, value] of Object.entries(opts.params)) {
    if (key in paramSchemas) {
      resolvedParams[key] = coerceValue(value, paramSchemas[key].type);
    } else {
      resolvedParams[key] = value;
    }
  }

  // Apply defaults for missing optional params
  for (const [key, schema] of Object.entries(paramSchemas)) {
    if (!(key in resolvedParams) && schema.default !== undefined) {
      resolvedParams[key] = schema.default;
    }
  }

  // 4. Prompt for missing required params
  const missingRequired = Object.entries(paramSchemas)
    .filter(([key, schema]) => schema.required && !(key in resolvedParams));

  if (missingRequired.length > 0 && !opts.json) {
    console.log();
    console.log(`${c.bold}${c.cyan}🏄 ${manifest.name}${c.reset} ${c.dim}→${c.reset} ${c.bold}${commandName}${c.reset}`);
    if (cmdSchema.description) console.log(`${c.dim}   ${cmdSchema.description}${c.reset}`);
    console.log();

    for (const [key, schema] of missingRequired) {
      const typeHint = schema.type ? ` ${c.dim}(${schema.type})${c.reset}` : '';
      const desc = schema.description ? ` ${c.dim}— ${schema.description}${c.reset}` : '';
      const answer = await promptUser(`   ${c.yellow}${key}${typeHint}${desc}: ${c.reset}`);
      if (!answer) {
        console.log(`${c.red}❌ Required parameter "${key}" not provided.${c.reset}`);
        process.exit(1);
        return;
      }
      resolvedParams[key] = coerceValue(answer, schema.type);
    }
  } else if (missingRequired.length > 0 && opts.json) {
    const missing = missingRequired.map(([k]) => k);
    console.log(JSON.stringify({ ok: false, error: `Missing required params: ${missing.join(', ')}` }));
    process.exit(1);
    return;
  }

  // 5. Execute
  if (!opts.json) {
    console.log();
    console.log(`${c.dim}   Executing ${c.bold}${commandName}${c.reset}${c.dim} on ${siteUrl}...${c.reset}`);
  }

  const executeStart = performance.now();
  try {
    const executeUrl = new URL('/surf/execute', siteUrl).toString();
    const res = await fetch(executeUrl, {
      method: 'POST',
      headers: buildHeaders(opts.auth),
      body: JSON.stringify({ command: commandName, params: resolvedParams }),
    });

    const executeMs = Math.round(performance.now() - executeStart);
    const totalMs = Math.round(performance.now() - totalStart);

    if (!res.ok) {
      let errorBody: string;
      try {
        const errJson = (await res.json()) as { error?: string };
        errorBody = errJson.error || `HTTP ${res.status}`;
      } catch {
        errorBody = `HTTP ${res.status}`;
      }

      if (opts.json) {
        console.log(JSON.stringify({ ok: false, error: errorBody, timing: { executeMs, totalMs } }));
        process.exit(1);
      }
      console.log(`\n   ${c.bgRed}${c.white}${c.bold} ERROR ${c.reset} ${c.red}${errorBody}${c.reset}`);
      console.log(`${c.dim}   ${executeMs}ms execute / ${totalMs}ms total${c.reset}`);
      process.exit(1);
      return;
    }

    const body = (await res.json()) as ExecuteResponse;
    const executeTime = body.timing?.ms ?? executeMs;

    if (opts.json) {
      console.log(JSON.stringify({ ...body, timing: { executeMs: executeTime, totalMs } }));
      return;
    }

    // 6. Pretty-print
    console.log();
    if (body.ok) {
      console.log(`   ${c.bgGreen}${c.white}${c.bold} OK ${c.reset}`);
    } else {
      console.log(`   ${c.bgRed}${c.white}${c.bold} ERROR ${c.reset} ${c.red}${body.error || 'Unknown error'}${c.reset}`);
    }
    console.log();

    if (body.result !== undefined) {
      const highlighted = syntaxHighlightJson(body.result);
      const indented = highlighted.split('\n').map((l) => `   ${l}`).join('\n');
      console.log(indented);
      console.log();
    }

    // 7. Timing
    console.log(`${c.dim}   ⏱  ${executeTime}ms execute / ${totalMs}ms total${c.reset}`);
    console.log();
  } catch (err) {
    const totalMs = Math.round(performance.now() - totalStart);
    if (opts.json) {
      console.log(JSON.stringify({ ok: false, error: (err as Error).message, timing: { totalMs } }));
      process.exit(1);
    }
    console.log(`\n${c.red}❌ Request failed: ${(err as Error).message}${c.reset}`);
    process.exit(1);
  }
}

// ─── Usage ───────────────────────────────────────────────────────────────────

function printUsage(): void {
  console.log(`
${c.bold}${c.cyan}🏄 surf${c.reset} — Inspect and test Surf-enabled websites

${c.bold}Usage:${c.reset}
  surf inspect <url>                     Fetch manifest and list commands
  surf test <url> <command> [--params]   Execute a command
  surf ping <url>                        Check if site is Surf-enabled

${c.bold}Flags:${c.reset}
  --json              Machine-readable JSON output
  --auth <token>      Bearer token for authenticated commands
  --verbose           Show full parameter schemas ${c.dim}(inspect)${c.reset}

${c.bold}Examples:${c.reset}
  surf inspect https://acme-store.com
  surf inspect https://acme-store.com --verbose
  surf test https://acme-store.com search --query "blue shoes"
  surf test https://acme-store.com addToCart --sku "WH-001" --quantity 2
  surf ping https://acme-store.com --json
  `);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.command || args.command === '--help' || args.command === '-h') {
    printUsage();
    return;
  }

  if (!args.url) {
    console.error(`${c.red}Error: URL required. Run "surf --help" for usage.${c.reset}`);
    process.exit(1);
  }

  switch (args.command) {
    case 'inspect':
      await inspect(args.url, args);
      break;
    case 'ping':
      await ping(args.url, args);
      break;
    case 'test': {
      if (!args.subcommand) {
        console.error(`${c.red}Error: Command name required. Run "surf inspect <url>" to see available commands.${c.reset}`);
        process.exit(1);
      }
      await test(args.url, args.subcommand, args);
      break;
    }
    default:
      console.error(`${c.red}Unknown command: ${args.command}${c.reset}`);
      printUsage();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`${c.red}${(err as Error).message}${c.reset}`);
  process.exit(1);
});
