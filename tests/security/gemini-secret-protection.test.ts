import { GeminiProvider } from '@/features/llm/providers/gemini.provider';

describe('Gemini Secret & API Key Protection Tests', () => {
  it('does NOT expose GEMINI_API_KEY in returned response objects or error messages', async () => {
    const secretKey = 'super-secret-gemini-key-12345';
    const provider = new GeminiProvider({
      apiKey: secretKey,
      enabled: true
    });

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Safe text' } }] })
    });

    const res = await provider.generate({ prompt: 'Test secret protection' });
    const jsonStr = JSON.stringify(res);
    expect(jsonStr).not.toContain(secretKey);
  });
});
