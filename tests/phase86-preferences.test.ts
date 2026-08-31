// Phase 86 — extended /api/intelligence/preferences PATCH: new emailEnabled/inAppEnabled/
// riskAlertsEnabled/deadlineAlertsEnabled/meetingAlertsEnabled/knowledgeChangeAlertsEnabled
// fields round-trip without breaking the existing daily/weekly/hour/timezone/deliveryMode fields,
// and only a notification-preference CHANGE is audited (never a routine read).
jest.mock('@/lib/auth', () => ({ getAuthUser: jest.fn() }));
jest.mock('@/features/ai-intelligence/services/ai-intelligence.service', () => ({
  aiIntelligenceService: { getPreferences: jest.fn(), updatePreferences: jest.fn() }
}));
jest.mock('@/features/audit/audit.service', () => ({
  auditService: { logEvent: jest.fn() }
}));

import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { aiIntelligenceService } from '@/features/ai-intelligence/services/ai-intelligence.service';
import { auditService } from '@/features/audit/audit.service';
import { GET, PATCH } from '@/app/api/intelligence/preferences/route';

const FULL_PREFS = {
  dailyEnabled: true,
  weeklyEnabled: true,
  preferredHour: 8,
  timezone: 'UTC',
  deliveryMode: 'IN_APP',
  emailEnabled: false,
  inAppEnabled: true,
  riskAlertsEnabled: true,
  deadlineAlertsEnabled: true,
  meetingAlertsEnabled: true,
  knowledgeChangeAlertsEnabled: true
};

describe('Phase 86 — /api/intelligence/preferences (extended)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1', email: 'user1@example.com' });
  });

  it('GET returns the extended preference DTO including the new Phase 86 fields', async () => {
    (aiIntelligenceService.getPreferences as jest.Mock).mockResolvedValue(FULL_PREFS);

    const req = new NextRequest('http://localhost:3000/api/intelligence/preferences');
    const res = await GET(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.emailEnabled).toBe(false);
    expect(json.data.riskAlertsEnabled).toBe(true);
    expect(auditService.logEvent).not.toHaveBeenCalled(); // routine reads are never audited
  });

  it('PATCH with only legacy fields (dailyEnabled/timezone) behaves identically to before — no new fields in the patch, no NOTIFICATION_PREFERENCES_UPDATED audit', async () => {
    (aiIntelligenceService.updatePreferences as jest.Mock).mockResolvedValue(FULL_PREFS);

    const req = new NextRequest('http://localhost:3000/api/intelligence/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ dailyEnabled: false, timezone: 'America/New_York' })
    });
    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(aiIntelligenceService.updatePreferences).toHaveBeenCalledWith('user-1', {
      dailyEnabled: false,
      timezone: 'America/New_York'
    });
    // No Phase 86 fields in the patch -> no NOTIFICATION_PREFERENCES_UPDATED audit event.
    expect(auditService.logEvent).not.toHaveBeenCalled();
  });

  it('PATCH with a new Phase 86 field (emailEnabled) is threaded through additively and triggers a NOTIFICATION_PREFERENCES_UPDATED audit event', async () => {
    (aiIntelligenceService.updatePreferences as jest.Mock).mockResolvedValue({ ...FULL_PREFS, emailEnabled: true });

    const req = new NextRequest('http://localhost:3000/api/intelligence/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ emailEnabled: true })
    });
    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.emailEnabled).toBe(true);
    expect(aiIntelligenceService.updatePreferences).toHaveBeenCalledWith('user-1', { emailEnabled: true });
    expect(auditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-1',
        action: 'NOTIFICATION_PREFERENCES_UPDATED',
        targetType: 'AI_INTELLIGENCE_PREFERENCE'
      })
    );
  });

  it('PATCH mixing legacy and Phase 86 fields threads both through in one call and audits only the Phase 86 subset', async () => {
    (aiIntelligenceService.updatePreferences as jest.Mock).mockResolvedValue(FULL_PREFS);

    const req = new NextRequest('http://localhost:3000/api/intelligence/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ preferredHour: 9, riskAlertsEnabled: false, knowledgeChangeAlertsEnabled: false })
    });
    await PATCH(req);

    expect(aiIntelligenceService.updatePreferences).toHaveBeenCalledWith('user-1', {
      preferredHour: 9,
      riskAlertsEnabled: false,
      knowledgeChangeAlertsEnabled: false
    });
    expect(auditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        details: { patch: { riskAlertsEnabled: false, knowledgeChangeAlertsEnabled: false } }
      })
    );
  });

  it('PATCH ignores non-boolean values for the new fields (forgiving, matches legacy validation style)', async () => {
    (aiIntelligenceService.updatePreferences as jest.Mock).mockResolvedValue(FULL_PREFS);

    const req = new NextRequest('http://localhost:3000/api/intelligence/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ emailEnabled: 'yes', meetingAlertsEnabled: 1 })
    });
    await PATCH(req);

    expect(aiIntelligenceService.updatePreferences).toHaveBeenCalledWith('user-1', {});
    expect(auditService.logEvent).not.toHaveBeenCalled();
  });
});
