/**
 * Streaming Client Example
 *
 * Reads SSE chunks from a Surf streaming command.
 * Run the server first: node server.js
 */

const BASE_URL = process.env.SURF_URL || 'http://localhost:3001';

async function streamGenerate() {
  console.log('🏄 Streaming generate command...\n');

  const response = await fetch(`${BASE_URL}/surf/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      command: 'generate',
      params: { prompt: 'Hello world', tokens: 15 },
      stream: true,
    }),
  });

  if (!response.ok) {
    console.error('Request failed:', response.status);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'chunk') {
            process.stdout.write(parsed.data.token + ' ');
          } else if (parsed.type === 'done') {
            console.log('\n\n✅ Done:', JSON.stringify(parsed.result));
          } else if (parsed.type === 'error') {
            console.error('\n❌ Error:', parsed.error);
          }
        } catch {
          // skip non-JSON lines
        }
      }
    }
  }
}

streamGenerate().catch(console.error);
