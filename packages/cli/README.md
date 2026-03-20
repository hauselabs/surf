# @surfjs/cli

> Inspect and test Surf-enabled websites from the terminal.

```bash
npm install -g @surfjs/cli
# or use directly
npx surf inspect https://example.com
```

## Commands

### `surf inspect <url>`

Fetch the Surf manifest and pretty-print all available commands:

```bash
$ surf inspect https://acme-store.com

🏄 Acme Store (Surf v0.1.0)
   E-commerce store with 50,000+ products

   5 commands available:

   search(query: string, maxPrice?: number, category?: string)
   Search products by keyword

   cart.add(sku: string, qty?: number) 🔐
   Add item to cart

   cart.checkout() 🔐
   Complete purchase
```

Use `--verbose` to see full parameter schemas, types, defaults, descriptions, and command hints:

```bash
$ surf inspect https://acme-store.com --verbose

   search(query: string, maxPrice?: number)
   Search products by keyword
   Parameters:
     query — type: string | required
     maxPrice — type: number | Max price filter
   Hints: idempotent=true, sideEffects=false, estimatedMs=50
```

### `surf test <url> <command>`

Execute a command against a live Surf endpoint. Pass parameters as `--key value` flags:

```bash
$ surf test https://acme-store.com search --query "wireless headphones" --maxPrice 100

   Executing search on https://acme-store.com...

   OK

   [
     { "id": "1", "name": "Wireless Headphones", "price": 79.99, "sku": "WH-001" }
   ]

   ⏱  45ms execute / 312ms total
```

**Interactive prompts:** If required parameters are missing, the CLI prompts for them:

```bash
$ surf test https://acme-store.com search

🏄 Acme Store → search
   Search products by keyword

   query (string) — Search query: wireless headphones

   Executing search on https://acme-store.com...
   OK
   [...]
```

**Parameter coercion:** Values are automatically coerced to the correct type based on the manifest schema (`number`, `boolean`, `string`).

### `surf ping <url>`

Quick check if a site is Surf-enabled:

```bash
$ surf ping https://acme-store.com
✅ https://acme-store.com is Surf-enabled (23ms)

$ surf ping https://not-surf.com
❌ https://not-surf.com is not Surf-enabled (HTTP 404, 156ms)
```

## Flags

| Flag | Description |
|---|---|
| `--json` | Machine-readable JSON output (for piping/scripting) |
| `--auth <token>` | Bearer token for authenticated commands |
| `--verbose` | Show full parameter schemas and hints (inspect only) |

### JSON Output

All commands support `--json` for scripting:

```bash
# Inspect
$ surf inspect https://example.com --json
{"ok":true,"manifest":{...},"ms":234}

# Ping
$ surf ping https://example.com --json
{"ok":true,"status":200,"ms":23}

# Test
$ surf test https://example.com search --query shoes --json
{"ok":true,"result":[...],"timing":{"executeMs":45,"totalMs":312}}
```

## Examples

```bash
# Inspect a site's commands
surf inspect https://acme-store.com

# Inspect with full details
surf inspect https://acme-store.com --verbose

# Test a command
surf test https://acme-store.com search --query "blue shoes"

# Test with auth
surf test https://acme-store.com addToCart --sku "WH-001" --quantity 2 --auth "my-token"

# Ping check
surf ping https://acme-store.com --json

# Pipe inspect output
surf inspect https://api.example.com --json | jq '.manifest.commands | keys'
```

## License

[MIT](../../LICENSE)
