# Surf.js + Express Example

A simple store backend with 5 commands: `search`, `getProduct`, `addToCart`, `getCart`, `checkout`.

## Run

```bash
npm install
npm start
```

## Try It

```bash
# Discover manifest
curl http://localhost:3000/.well-known/surf.json | jq

# Search products
curl -X POST http://localhost:3000/surf/execute \
  -H "Content-Type: application/json" \
  -d '{"command": "search", "params": {"query": "shoes"}}'

# Add to cart
curl -X POST http://localhost:3000/surf/execute \
  -H "Content-Type: application/json" \
  -d '{"command": "addToCart", "params": {"sku": "RS-002"}}'

# View cart
curl -X POST http://localhost:3000/surf/execute \
  -H "Content-Type: application/json" \
  -d '{"command": "getCart"}'

# Checkout
curl -X POST http://localhost:3000/surf/execute \
  -H "Content-Type: application/json" \
  -d '{"command": "checkout"}'
```
