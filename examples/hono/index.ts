import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createSurf } from '@surfjs/core';
import { honoApp } from '@surfjs/core/hono';

// ─── In-memory store ─────────────────────────────────────────────────────────

const products = [
  { id: '1', name: 'Wireless Headphones', price: 79.99, category: 'electronics', sku: 'WH-001' },
  { id: '2', name: 'Running Shoes', price: 129.99, category: 'footwear', sku: 'RS-002' },
  { id: '3', name: 'Cotton T-Shirt', price: 24.99, category: 'clothing', sku: 'CT-003' },
  { id: '4', name: 'Backpack', price: 59.99, category: 'accessories', sku: 'BP-004' },
  { id: '5', name: 'Water Bottle', price: 14.99, category: 'accessories', sku: 'WB-005' },
];

const carts = new Map<string, Array<{ sku: string; name: string; price: number; quantity: number }>>();

// ─── Surf setup ──────────────────────────────────────────────────────────────

const surf = createSurf({
  name: 'Example Store',
  description: 'A simple store demonstrating Surf.js with Hono',
  version: '1.0.0',
  commands: {
    search: {
      description: 'Search products by query string',
      params: {
        query: { type: 'string', required: true, description: 'Search query' },
        category: { type: 'string', description: 'Filter by category' },
        maxPrice: { type: 'number', description: 'Maximum price filter' },
      },
      hints: { idempotent: true, sideEffects: false, estimatedMs: 50 },
      run: async ({ query, category, maxPrice }) => {
        let results = products.filter((p) =>
          p.name.toLowerCase().includes((query as string).toLowerCase()),
        );
        if (category) results = results.filter((p) => p.category === category);
        if (maxPrice) results = results.filter((p) => p.price <= (maxPrice as number));
        return results;
      },
    },

    getProduct: {
      description: 'Get a single product by ID',
      params: {
        id: { type: 'string', required: true, description: 'Product ID' },
      },
      hints: { idempotent: true, sideEffects: false },
      run: async ({ id }) => {
        const product = products.find((p) => p.id === id);
        if (!product) throw new Error('Product not found');
        return product;
      },
    },

    addToCart: {
      description: 'Add a product to the shopping cart',
      params: {
        sku: { type: 'string', required: true, description: 'Product SKU' },
        quantity: { type: 'number', default: 1, description: 'Quantity to add' },
      },
      hints: { sideEffects: true },
      run: async ({ sku, quantity }, ctx) => {
        const sessionId = ctx.sessionId || 'default';
        const product = products.find((p) => p.sku === sku);
        if (!product) throw new Error('Product not found');

        if (!carts.has(sessionId)) carts.set(sessionId, []);
        const cart = carts.get(sessionId)!;
        const existing = cart.find((item) => item.sku === sku);

        if (existing) {
          existing.quantity += (quantity as number) || 1;
        } else {
          cart.push({ sku: sku as string, name: product.name, price: product.price, quantity: (quantity as number) || 1 });
        }

        return { added: true, cartSize: cart.length };
      },
    },

    getCart: {
      description: 'Get current cart contents',
      hints: { idempotent: true, sideEffects: false },
      run: async (_params, ctx) => {
        const sessionId = ctx.sessionId || 'default';
        const cart = carts.get(sessionId) || [];
        const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
        return { items: cart, total: Math.round(total * 100) / 100 };
      },
    },

    checkout: {
      description: 'Complete the purchase and clear the cart',
      hints: { sideEffects: true },
      run: async (_params, ctx) => {
        const sessionId = ctx.sessionId || 'default';
        const cart = carts.get(sessionId) || [];
        if (cart.length === 0) throw new Error('Cart is empty');

        const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const orderId = `ORD-${Date.now()}`;

        carts.delete(sessionId);

        return {
          orderId,
          total: Math.round(total * 100) / 100,
          items: cart.length,
          status: 'confirmed',
        };
      },
    },
  },
});

// ─── Hono app ────────────────────────────────────────────────────────────────

const app = new Hono();

// Mount Surf routes
app.route('/', honoApp(surf));

// Start server
const PORT = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`🏄 Store running at http://localhost:${info.port}`);
  console.log(`   Manifest: http://localhost:${info.port}/.well-known/surf.json`);
  console.log(`   Execute:  POST http://localhost:${info.port}/surf/execute`);
});
