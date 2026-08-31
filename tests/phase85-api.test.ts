jest.mock('@/lib/auth', () => ({
  getAuthUser: jest.fn(),
  requireAuthenticatedUser: jest.fn()
}));
jest.mock('@/features/projects/project-authorization.service', () => ({
  projectAuthorizationService: { authorizeProjectAccess: jest.fn().mockResolvedValue(undefined) }
}));
jest.mock('@/features/ai-intelligence/services/ai-intelligence.service', () => ({
  aiIntelligenceService: {
    getSnapshot: jest.fn(),
    generateSnapshot: jest.fn(),
    getPreferences: jest.fn(),
    updatePreferences: jest.fn()
  }
}));
jest.mock('@/features/ai-intelligence/security/ai-intelligence-rate-limit.service', () => ({
  aiIntelligenceRateLimitService: { checkRateLimit: jest.fn().mockResolvedValue(true) }
}));
jest.mock('@/features/knowledge-intelligence/insight-review.service', () => ({
  insightReviewService: { reviewInsight: jest.fn() }
}));

import { NextRequest } from 'next/server';
import { getAuthUser, requireAuthenticatedUser } from '@/lib/auth';
import { aiIntelligenceService } from '@/features/ai-intelligence/services/ai-intelligence.service';
import { aiIntelligenceRateLimitService } from '@/features/ai-intelligence/security/ai-intelligence-rate-limit.service';
import { insightReviewService } from '@/features/knowledge-intelligence/insight-review.service';

import { GET as dailyGET, POST as dailyPOST } from '@/app/api/intelligence/daily/route';
import { GET as weeklyGET, POST as weeklyPOST } from '@/app/api/intelligence/weekly/route';
import { GET as preferencesGET, PATCH as preferencesPATCH } from '@/app/api/intelligence/preferences/route';
import { POST as dismissPOST } from '@/app/api/intelligence/insights/[id]/dismiss/route';
import { POST as acceptPOST } from '@/app/api/intelligence/insights/[id]/accept/route';

const AUTH_USER = { id: 'user-1', role: 'USER' };

describe('Phase 85 — API routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthUser as jest.Mock).mockResolvedValue(AUTH_USER);
    (requireAuthenticatedUser as jest.Mock).mockResolvedValue(AUTH_USER);
    (aiIntelligenceRateLimitService.checkRateLimit as jest.Mock).mockResolvedValue(true);
  });

  it('POST /api/intelligence/insights/[id]/dismiss calls insightReviewService.reviewInsight with action DISMISS', async () => {
    (insightReviewService.reviewInsight as jest.Mock).mockResolvedValue({ insight: { id: 'i1', status: 'DISMISSED' }, previousStatus: 'NEW' });

    const req = new NextRequest('http://localhost/api/intelligence/insights/i1/dismiss', {
      method: 'POST',
      body: JSON.stringify({ note: 'not relevant' })
    });
    const res = await dismissPOST(req, { params: { id: 'i1' } });

    expect(insightReviewService.reviewInsight).toHaveBeenCalledWith('user-1', 'i1', 'DISMISS', 'not relevant');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('POST /api/intelligence/insights/[id]/accept calls insightReviewService.reviewInsight with action CONFIRM', async () => {
    (insightReviewService.reviewInsight as jest.Mock).mockResolvedValue({ insight: { id: 'i1', status: 'CONFIRMED' }, previousStatus: 'NEW' });

    const req = new NextRequest('http://localhost/api/intelligence/insights/i1/accept', {
      method: 'POST',
      body: JSON.stringify({})
    });
    const res = await acceptPOST(req, { params: { id: 'i1' } });

    expect(insightReviewService.reviewInsight).toHaveBeenCalledWith('user-1', 'i1', 'CONFIRM', undefined);
    expect(res.status).toBe(200);
  });

  it('GET /api/intelligence/preferences and PATCH round-trip through the service', async () => {
    (aiIntelligenceService.getPreferences as jest.Mock).mockResolvedValue({
      dailyEnabled: true,
      weeklyEnabled: true,
      preferredHour: 8,
      timezone: 'UTC',
      deliveryMode: 'IN_APP'
    });

    const getRes = await preferencesGET(new NextRequest('http://localhost/api/intelligence/preferences'));
    expect(getRes.status).toBe(200);
    const getJson = await getRes.json();
    expect(getJson.data.preferredHour).toBe(8);

    (aiIntelligenceService.updatePreferences as jest.Mock).mockResolvedValue({
      dailyEnabled: false,
      weeklyEnabled: true,
      preferredHour: 9,
      timezone: 'America/New_York',
      deliveryMode: 'IN_APP'
    });

    const patchReq = new NextRequest('http://localhost/api/intelligence/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ preferredHour: 9, dailyEnabled: false, timezone: 'America/New_York' })
    });
    const patchRes = await preferencesPATCH(patchReq);
    expect(patchRes.status).toBe(200);
    const patchJson = await patchRes.json();
    expect(patchJson.data.preferredHour).toBe(9);
    expect(aiIntelligenceService.updatePreferences).toHaveBeenCalledWith('user-1', {
      preferredHour: 9,
      dailyEnabled: false,
      timezone: 'America/New_York'
    });
  });

  it('GET /api/intelligence/daily never triggers generation — only getSnapshot is called, generateSnapshot never', async () => {
    (aiIntelligenceService.getSnapshot as jest.Mock).mockResolvedValue(null);

    const res = await dailyGET(new NextRequest('http://localhost/api/intelligence/daily'));

    expect(res.status).toBe(200);
    expect(aiIntelligenceService.getSnapshot).toHaveBeenCalledWith('user-1', 'DAILY', null);
    expect(aiIntelligenceService.generateSnapshot).not.toHaveBeenCalled();
  });

  it('GET /api/intelligence/weekly never triggers generation — only getSnapshot is called, generateSnapshot never', async () => {
    (aiIntelligenceService.getSnapshot as jest.Mock).mockResolvedValue(null);

    const res = await weeklyGET(new NextRequest('http://localhost/api/intelligence/weekly'));

    expect(res.status).toBe(200);
    expect(aiIntelligenceService.getSnapshot).toHaveBeenCalledWith('user-1', 'WEEKLY', null);
    expect(aiIntelligenceService.generateSnapshot).not.toHaveBeenCalled();
  });

  it('POST /api/intelligence/daily calls generateSnapshot (the on-demand manual trigger)', async () => {
    (aiIntelligenceService.generateSnapshot as jest.Mock).mockResolvedValue({ id: 'snap-1', status: 'READY' });

    const req = new NextRequest('http://localhost/api/intelligence/daily', { method: 'POST', body: JSON.stringify({}) });
    const res = await dailyPOST(req);

    expect(res.status).toBe(200);
    expect(aiIntelligenceService.generateSnapshot).toHaveBeenCalledWith('user-1', 'DAILY', null, { force: false });
  });

  it('POST /api/intelligence/daily is rate-limited — a denied check returns 429 without calling generateSnapshot', async () => {
    (aiIntelligenceRateLimitService.checkRateLimit as jest.Mock).mockResolvedValue(false);

    const req = new NextRequest('http://localhost/api/intelligence/daily', { method: 'POST', body: JSON.stringify({}) });
    const res = await dailyPOST(req);

    expect(res.status).toBe(429);
    expect(aiIntelligenceService.generateSnapshot).not.toHaveBeenCalled();
  });

  it('POST /api/intelligence/weekly calls generateSnapshot (the on-demand manual trigger)', async () => {
    (aiIntelligenceService.generateSnapshot as jest.Mock).mockResolvedValue({ id: 'snap-2', status: 'READY' });

    const req = new NextRequest('http://localhost/api/intelligence/weekly', { method: 'POST', body: JSON.stringify({}) });
    const res = await weeklyPOST(req);

    expect(res.status).toBe(200);
    expect(aiIntelligenceService.generateSnapshot).toHaveBeenCalledWith('user-1', 'WEEKLY', null, { force: false });
  });

  it('POST /api/intelligence/weekly is rate-limited — a denied check returns 429 without calling generateSnapshot', async () => {
    (aiIntelligenceRateLimitService.checkRateLimit as jest.Mock).mockResolvedValue(false);

    const req = new NextRequest('http://localhost/api/intelligence/weekly', { method: 'POST', body: JSON.stringify({}) });
    const res = await weeklyPOST(req);

    expect(res.status).toBe(429);
    expect(aiIntelligenceService.generateSnapshot).not.toHaveBeenCalled();
  });

  it('never trusts a client-supplied userId/projectId as ownership proof — the authenticated user id is always used', async () => {
    (aiIntelligenceService.getSnapshot as jest.Mock).mockResolvedValue(null);

    const req = new NextRequest('http://localhost/api/intelligence/daily?userId=someone-elses-id');
    await dailyGET(req);

    expect(aiIntelligenceService.getSnapshot).toHaveBeenCalledWith('user-1', 'DAILY', null);
  });
});
