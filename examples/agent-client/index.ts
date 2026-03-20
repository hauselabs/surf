/**
 * Surf.js Agent Client Example
 *
 * Demonstrates how an AI agent discovers and interacts with
 * a Surf-enabled website using @surfjs/client.
 */
import { SurfClient } from '@surfjs/client';

// ─── Types for the store API ─────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  price: number;
  sku: string;
}

interface CartResult {
  added: boolean;
  cartSize: number;
}

interface CheckoutResult {
  orderId: string;
  total: number;
  items: number;
  status: string;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const url = process.env.SURF_URL || 'http://localhost:3000';

  // 1. Discover — fetch and parse the surf.json manifest
  console.log(`🔍 Discovering Surf manifest at ${url}...`);
  const client = await SurfClient.discover(url);

  console.log(`✅ Connected to: ${client.manifest.name}`);
  console.log(`   Commands: ${Object.keys(client.commands()).join(', ')}`);
  console.log();

  // 2. Execute — run individual commands
  console.log('📦 Searching for "shoes"...');
  const results = (await client.execute('search', { query: 'shoes' })) as Product[];
  console.log(`   Found ${results.length} products:`);
  results.forEach((p) => console.log(`   - ${p.name} ($${p.price})`));
  console.log();

  // 3. Pipeline — execute multiple commands in one round-trip
  console.log('🧩 Running pipeline: search → addToCart → getCart...');
  const pipeline = await client.pipeline([
    { command: 'search', params: { query: 'headphones' }, as: 'searchResults' },
    { command: 'addToCart', params: { sku: 'WH-001', quantity: 2 } },
    { command: 'getCart' },
  ]);

  pipeline.results.forEach((step) => {
    console.log(`   ${step.command}: ${step.ok ? '✅' : '❌'}`, JSON.stringify(step.result));
  });
  console.log();

  // 4. Typed Client — full TypeScript inference
  console.log('🔒 Using typed client...');
  const typed = client.typed<{
    search: { params: { query: string }; result: Product[] };
    addToCart: { params: { sku: string; quantity?: number }; result: CartResult };
    checkout: { params: Record<string, never>; result: CheckoutResult };
  }>();

  const products = await typed.search({ query: 'shirt' });
  console.log(`   Typed search returned ${products.length} products`);
  console.log();

  // 5. Sessions — stateful interaction
  console.log('🗂️  Starting session...');
  const session = await client.startSession();
  console.log(`   Session ID: ${session.id}`);

  await session.execute('addToCart', { sku: 'RS-002' });
  await session.execute('addToCart', { sku: 'CT-003', quantity: 2 });
  const cart = await session.execute('getCart');
  console.log(`   Cart:`, JSON.stringify(cart));

  const order = await session.execute('checkout');
  console.log(`   Order:`, JSON.stringify(order));

  await session.end();
  console.log('   Session ended.');
  console.log();

  console.log('🏄 Done!');
}

main().catch(console.error);
