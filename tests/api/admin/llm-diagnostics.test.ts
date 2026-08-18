import { NextRequest } from 'next/server';
import { GET } from '@/app/api/admin/llm-diagnostics/route';

describe('GET /api/admin/llm-diagnostics Route Test', () => {
  it('returns valid JSON diagnostics payload', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/llm-diagnostics');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json).toHaveProperty('health');
    expect(json).toHaveProperty('diagnostics');
    expect(json.diagnostics).toHaveProperty('totalRequests');
  });
});
