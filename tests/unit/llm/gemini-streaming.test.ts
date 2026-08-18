import { GeminiProvider } from '@/features/llm/providers/gemini.provider';

describe('Gemini Streaming Unit Tests', () => {
  const provider = new GeminiProvider({
    apiKey: 'mock-gemini-key',
    enabled: true
  });

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('streams response chunks with first token flag', async () => {
    const mockStreamData = [
      'data: {"choices":[{"delta":{"content":"Chunk 1"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Chunk 2"}}]}\n\n',
      'data: [DONE]\n\n'
    ];

    let chunkIndex = 0;
    const mockReader = {
      read: jest.fn().mockImplementation(() => {
        if (chunkIndex < mockStreamData.length) {
          const text = mockStreamData[chunkIndex++];
          return Promise.resolve({ done: false, value: new TextEncoder().encode(text) });
        }
        return Promise.resolve({ done: true, value: undefined });
      })
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      body: { getReader: () => mockReader }
    });

    const chunks: any[] = [];
    for await (const chunk of provider.stream({ prompt: 'Stream test' })) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].isFirstToken).toBe(true);
    expect(chunks[chunks.length - 1].done).toBe(true);
  });
});
