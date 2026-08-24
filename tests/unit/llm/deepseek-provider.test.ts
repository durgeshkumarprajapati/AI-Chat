import { DeepSeekProvider } from '../../../src/features/llm/providers/deepseek.provider';
import { LLMCapability } from '../../../src/features/llm/llm.types';

describe('DeepSeekProvider Unit Tests', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should verify DeepSeekProvider capabilities', () => {
    const provider = new DeepSeekProvider({ apiKey: 'sk-test-deepseek-key' });
    expect(provider.name).toBe('deepseek');
    expect(provider.supports(LLMCapability.TEXT_GENERATION)).toBe(true);
    expect(provider.supports(LLMCapability.STREAMING)).toBe(true);
    expect(provider.supports(LLMCapability.STRUCTURED_OUTPUT)).toBe(true);
    expect(provider.supports(LLMCapability.REASONING)).toBe(true);
    expect(provider.supports(LLMCapability.MULTIMODAL)).toBe(false);
  });

  it('should return unhealthy health status when API key is missing', async () => {
    const provider = new DeepSeekProvider({ apiKey: '' });
    const health = await provider.healthCheck();
    expect(health.status).toBe('unhealthy');
    expect(health.message).toContain('DEEPSEEK_API_KEY is missing');
  });

  it('should successfully perform text generation via mock fetch', async () => {
    const provider = new DeepSeekProvider({ apiKey: 'sk-test-deepseek-key' });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: { content: 'DeepSeek response content' },
            finish_reason: 'stop'
          }
        ],
        usage: { prompt_tokens: 15, completion_tokens: 10 }
      })
    } as any);

    const res = await provider.generate({
      prompt: 'Explain quantum computing simply',
      feature: 'GENERAL'
    });

    expect(res.provider).toBe('deepseek');
    expect(res.text).toBe('DeepSeek response content');
    expect(res.promptTokens).toBe(15);
    expect(res.completionTokens).toBe(10);
  });

  it('should handle streaming output chunks cleanly', async () => {
    const provider = new DeepSeekProvider({ apiKey: 'sk-test-deepseek-key' });

    const sseData = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" World"}}]}\n\n',
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

    expect(chunks.join('')).toBe('Hello World');
  });

  it('should parse structured output cleanly', async () => {
    const provider = new DeepSeekProvider({ apiKey: 'sk-test-deepseek-key' });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: { content: '{"answer": "DeepSeek JSON response"}' }
          }
        ]
      })
    } as any);

    const structured = await provider.generateStructured<{ answer: string }>({
      prompt: 'Provide JSON format answer',
      schemaDescription: '{"answer": string}'
    });

    expect(structured.answer).toBe('DeepSeek JSON response');
  });
});
