const express = require('express');
const { createSurf } = require('@surfjs/core');

const app = express();
app.use(express.json());

async function main() {
  const surf = await createSurf({
  name: 'Streaming Example',
  description: 'Demonstrates SSE streaming with Surf.js',
  version: '1.0.0',
  commands: {
    generate: {
      description: 'Generate text token by token (streaming)',
      params: {
        prompt: { type: 'string', required: true, description: 'Text prompt' },
        tokens: { type: 'number', default: 20, description: 'Number of tokens to generate' },
      },
      stream: true,
      run: async ({ prompt, tokens }, { emit }) => {
        const words = [
          'The', 'quick', 'brown', 'fox', 'jumps', 'over', 'the', 'lazy', 'dog.',
          'Surf.js', 'enables', 'AI', 'agents', 'to', 'interact', 'with',
          'websites', 'through', 'typed', 'commands', 'instead', 'of',
          'clicking', 'around', 'with', 'vision', 'models.',
        ];

        const count = tokens || 20;
        const generated = [];

        for (let i = 0; i < count; i++) {
          const word = words[i % words.length];
          generated.push(word);
          emit({ token: word, index: i });
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        return {
          prompt,
          text: generated.join(' '),
          tokenCount: count,
        };
      },
    },

    summarize: {
      description: 'Summarize text with streaming progress updates',
      params: {
        text: { type: 'string', required: true },
      },
      stream: true,
      run: async ({ text }, { emit }) => {
        const steps = ['Analyzing...', 'Extracting key points...', 'Generating summary...'];

        for (const step of steps) {
          emit({ status: step });
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        const summary = `Summary of ${String(text).split(' ').length} words: ${String(text).slice(0, 100)}...`;
        return { summary };
      },
    },
  },
  });

  app.use(surf.middleware());

  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`🏄 Streaming server at http://localhost:${PORT}`);
  });
}

main().catch((error) => {
  console.error('Failed to start streaming example:', error);
  process.exit(1);
});
