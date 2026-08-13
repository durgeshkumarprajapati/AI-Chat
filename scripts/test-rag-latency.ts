import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const baseUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const question = process.env.RAG_LATENCY_QUESTION || 'What information is available in my documents?';
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}/api/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': process.env.RAG_LATENCY_USER_ID || '00000000-0000-4000-a000-000000000001' },
    body: JSON.stringify({ question })
  });
  if (!response.ok || !response.body) throw new Error(`Streaming request failed: HTTP ${response.status}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let firstTokenMs: number | null = null;
  let trace: Record<string, number> | undefined;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';
    for (const event of events) {
      const payload = event.split('\n').find((line) => line.startsWith('data: '))?.slice(6);
      if (!payload) continue;
      const data = JSON.parse(payload) as { type?: string; latencyTrace?: Record<string, number> };
      if (data.type === 'delta' && firstTokenMs === null) firstTokenMs = Date.now() - startedAt;
      if (data.type === 'done') trace = data.latencyTrace;
    }
  }
  console.log('RAG LATENCY TEST');
  console.log(`First token:       ${firstTokenMs ?? trace?.llmFirstTokenMs ?? 'N/A'} ms`);
  for (const [label, key] of [['Embedding', 'embeddingMs'], ['Vector search', 'vectorMs'], ['Keyword search', 'keywordMs'], ['Reranking', 'rerankMs'], ['LLM generation', 'llmGenerationMs'], ['Persistence', 'persistenceMs'], ['Total response', 'totalResponseMs']] as const) console.log(`${label}: ${trace?.[key] ?? 'N/A'} ms`);
  console.log('Evaluation: Async (excluded from response latency)');
}
main().catch((error) => { console.error(error); process.exit(1); });
