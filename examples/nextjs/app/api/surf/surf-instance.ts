import { createSurf } from '@surfjs/core';

// ─── Sample data ─────────────────────────────────────────────────────────────

const products = [
  { id: '1', name: 'Wireless Headphones', price: 79.99, sku: 'WH-001' },
  { id: '2', name: 'Running Shoes', price: 129.99, sku: 'RS-002' },
  { id: '3', name: 'Cotton T-Shirt', price: 24.99, sku: 'CT-003' },
];

const cart: Array<{ sku: string; name: string; price: number; quantity: number }> = [];

// ─── Surf instance ───────────────────────────────────────────────────────────

export const surf = await createSurf({
  name: 'Next.js Store',
  description: 'Example Next.js integration with Surf.js',
  version: '1.0.0',
  commands: {
    getProducts: {
      description: 'List all available products',
      hints: { idempotent: true, sideEffects: false },
      run: async () => products,
    },

    search: {
      description: 'Search products by name',
      params: {
        query: { type: 'string', required: true, description: 'Search query' },
      },
      hints: { idempotent: true, sideEffects: false },
      run: async ({ query }) => {
        return products.filter((p) =>
          p.name.toLowerCase().includes((query as string).toLowerCase()),
        );
      },
    },

    addToCart: {
      description: 'Add a product to the cart',
      params: {
        sku: { type: 'string', required: true },
        quantity: { type: 'number', default: 1 },
      },
      hints: { sideEffects: true },
      run: async ({ sku, quantity }) => {
        const product = products.find((p) => p.sku === sku);
        if (!product) throw new Error('Product not found');

        const qty = (quantity as number) || 1;
        const existing = cart.find((item) => item.sku === sku);
        if (existing) {
          existing.quantity += qty;
        } else {
          cart.push({ sku: sku as string, name: product.name, price: product.price, quantity: qty });
        }

        return { added: true, cartSize: cart.length };
      },
    },
  },
});
