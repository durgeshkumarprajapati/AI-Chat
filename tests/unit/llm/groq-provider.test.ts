import { GroqProvider } from '../../../src/features/llm/providers/groq.provider';
import { LLMCapability } from '../../../src/features/llm/llm.types';

describe('GroqProvider Unit Tests', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should verify GroqProvider capabilities', () => {
    const provider = new GroqProvider({ apiKey: 'gsk-test-groq-key' });
    expect(provider.name).toBe('groq');
    expect(provider.supports(LLMCapability.TEXT_GENERATION)).toBe(true);
    expect(provider.supports(LLMCapability.STREAMING)).toBe(true);
    expect(provider.supports(LLMCapability.STRUCTURED_OUTPUT)).toBe(true);
    expect(provider.supports(LLMCapability.REASONING)).toBe(true);
  });

  it('should return unhealthy health status when API key is missing', async () => {
    const provider = new GroqProvider({ apiKey: '' });
    const health = await provider.healthCheck();
    expect(health.status).toBe('unhealthy');
    expect(health.message).toContain('GROQ_API_KEY is missing');
  });

  it('should successfully perform text generation via mock fetch', async () => {
    const provider = new GroqProvider({ apiKey: 'gsk-test-groq-key' });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: { content: 'Groq ultra-fast response content' },
            finish_reason: 'stop'
          }
        ],
        usage: { prompt_tokens: 12, completion_tokens: 8 }
      })
    } as any);

    const res = await provider.generate({
      prompt: 'Summarize quantum mechanics',
      feature: 'GENERAL'
    });

    expect(res.provider).toBe('groq');
    expect(res.text).toBe('Groq ultra-fast response content');
    expect(res.promptTokens).toBe(12);
    expect(res.completionTokens).toBe(8);
  });

  it('should handle streaming output chunks cleanly', async () => {
    const provider = new GroqProvider({ apiKey: 'gsk-test-groq-key' });

    const sseData = [
      'data: {"choices":[{"delta":{"content":"Groq"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" Stream"}}]}\n\n',
      'data: [DONE]\n\n'
    ].join('');

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseData));
        controller.close();
      }
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: (stream as any).getReader ? stream : {
        getReader: () => {
          let readCount = 0;
          return {
            read: async () => {
              if (readCount === 0) {
                readCount++;
                return { done: false, value: encoder.encode(sseData) };
              }
              return { done: true, value: undefined };
            }
          };
        }
      }
    } as any);

    const chunks: string[] = [];
    for await (const chunk of provider.stream({ prompt: 'Hello' })) {
      if (chunk.text) {
        chunks.push(chunk.text);
      }
    }

    expect(chunks.join('')).toBe('Groq Stream');
  });

  it('should parse structured output cleanly', async () => {
    const provider = new GroqProvider({ apiKey: 'gsk-test-groq-key' });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: { content: '{"status": "success", "provider": "groq"}' }
          }
        ]
      })
    } as any);

    const structured = await provider.generateStructured<{ status: string; provider: string }>({
      prompt: 'Provide JSON format answer',
      schemaDescription: '{"status": string, "provider": string}'
    });

    expect(structured.status).toBe('success');
    expect(structured.provider).toBe('groq');
  });
});
