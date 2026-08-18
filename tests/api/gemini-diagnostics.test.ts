import { GET } from '@/app/api/admin/llm-diagnostics/route';
import { NextRequest } from 'next/server';

describe('Admin LLM Diagnostics API Endpoint Tests with Gemini', () => {
  it('returns health and diagnostics containing Gemini provider information', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/llm-diagnostics');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.health).toBeDefined();
    expect(json.diagnostics).toBeDefined();
    expect(json.modelsConfigured).toBeDefined();
  });
});
