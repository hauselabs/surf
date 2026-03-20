import { createSurf } from '@surfjs/core'
import { createDevUI } from './src/server.js'

const surf = createSurf({
  name: 'Test Store',
  commands: {
    search: {
      description: 'Search products',
      params: { query: { type: 'string', required: true } },
      run: async ({ query }) => [{ name: 'Test Product', query }],
    },
    'cart.add': {
      description: 'Add to cart',
      params: {
        sku: { type: 'string', required: true },
        quantity: { type: 'number', default: 1 },
      },
      auth: 'optional',
      run: async ({ sku, quantity }) => ({ added: true, sku, quantity }),
    },
    checkout: {
      description: 'Complete purchase',
      auth: 'required',
      run: async () => ({ orderId: 'ORD-123', status: 'confirmed' }),
    },
  },
})

const devui = createDevUI(surf, { port: 4242 })
devui.start().then(({ url }) => console.log(`DevUI at ${url}`))
