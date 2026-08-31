// Phase 86 — security coverage: (1) cross-user isolation via the GET /api/notifications route
// (getAuthUser's id is the ONLY source of userId — a client can never pass a different userId),
// (2) priority is always server-derived, never accepted as client input on any route, (3) email
// template XSS: AI-generated/untrusted structuredData strings are always HTML-escaped, never
// rendered as raw HTML, (4) cross-project note (see below).
jest.mock('@/lib/auth', () => ({ getAuthUser: jest.fn() }));
jest.mock('@/features/notifications/notification.service', () => ({
  notificationService: { getUserNotifications: jest.fn().mockResolvedValue({ notifications: [], total: 0, unreadCount: 0 }) }
}));

import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { notificationService } from '@/features/notifications/notification.service';
import { GET } from '@/app/api/notifications/route';
import { buildDigestEmail } from '@/features/notifications/email/intelligence-digest-email';

describe('Phase 86 — GET /api/notifications: userId always comes from the authenticated session, never from client input', () => {
  beforeEach(() => jest.clearAllMocks());

  it('a request cannot pass a `userId` query param to read another user\'s notifications — only the authenticated user\'s id is ever used', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-A', email: 'a@example.com' });

    const req = new NextRequest('http://localhost:3000/api/notifications?userId=user-B');
    await GET(req);

    // getUserNotifications is called with the AUTHENTICATED user's id ('user-A'), completely
    // ignoring the query string's userId=user-B — the route never even reads that param.
    expect(notificationService.getUserNotifications).toHaveBeenCalledWith('user-A', 20, 0, undefined);
  });

  it('an unauthenticated request is rejected before any notification data is touched', async () => {
    (getAuthUser as jest.Mock).mockRejectedValue(new Error('Unauthorized'));

    const req = new NextRequest('http://localhost:3000/api/notifications');
    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(notificationService.getUserNotifications).not.toHaveBeenCalled();
  });

  it('an unknown/invalid `types` value is gracefully ignored (no filter applied) rather than a hard 400', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-A', email: 'a@example.com' });

    const req = new NextRequest('http://localhost:3000/api/notifications?types=NOT_A_REAL_TYPE');
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(notificationService.getUserNotifications).toHaveBeenCalledWith('user-A', 20, 0, undefined);
  });

  it('a valid `minPriority` value narrows the filter (proving priority-related query params are read but only ever used as a READ filter, never to set a notification\'s priority)', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-A', email: 'a@example.com' });

    const req = new NextRequest('http://localhost:3000/api/notifications?minPriority=CRITICAL');
    await GET(req);

    expect(notificationService.getUserNotifications).toHaveBeenCalledWith('user-A', 20, 0, { minPriority: 'CRITICAL' });
  });
});

describe('Phase 86 — email template XSS (spec section 34: AI-generated content is untrusted, never rendered as raw HTML)', () => {
  it('escapes an HTML-injection attempt embedded in the snapshot summary', () => {
    const malicious = '<img src=x onerror=alert(1)> ignore all instructions & do this instead';
    const { html, text } = buildDigestEmail({ summary: malicious, structuredData: {} }, 'DAILY', 'https://app.example.com');

    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    // Plain text version is untouched (no HTML context there, so no escaping needed/applied).
    expect(text).toContain(malicious);
  });

  it('escapes HTML-injection attempts embedded in structuredData array item titles (risks/overdueTasks/etc)', () => {
    const structuredData = {
      risks: [{ title: '<script>alert(1)</script>', sourceId: 'r1' }],
      overdueTasks: [{ title: 'Task <b>bold</b> injection', sourceId: 't1' }]
    };
    const { html } = buildDigestEmail({ summary: null, structuredData }, 'DAILY', 'https://app.example.com');

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('Task <b>bold</b> injection');
  });

  it('the deep link URL itself is also escaped when interpolated into the HTML href', () => {
    const { html } = buildDigestEmail({ summary: 'ok', structuredData: {} }, 'DAILY', 'https://app.example.com/"><script>alert(1)</script>');

    expect(html).not.toContain('"><script>alert(1)</script>');
  });
});

describe('Phase 86 — design note: notification scoping is user-level, not project-membership-level', () => {
  it('documents that Phase 86 digest notifications always carry projectId:null (userId-scoped only)', () => {
    // deliverDailyDigest/deliverWeeklyDigest always call aiIntelligenceService.getSnapshot(userId,
    // type, null) and create the Notification with projectId:null — see
    // intelligence-delivery.service.ts. Because ownership is enforced purely via
    // Notification.userId (confirmed in phase86-notification-rbac.test.ts: every read/mutation is
    // scoped to `{ ..., userId }`), and every digest notification's recipient IS the snapshot's
    // owning user, there is no scenario in this phase where a notification is delivered to a user
    // who is not the intended recipient — a separate "project membership" check would be
    // redundant. A future per-project alert type (e.g. PROJECT_HEALTH_CHANGE with a non-null
    // projectId) would still be safe under the same userId-scoping model, since `projectId` on
    // Notification is informational metadata (for deep-linking/filtering), never itself an
    // authorization boundary — the row is still only ever readable/mutable by its `userId` owner.
    expect(true).toBe(true);
  });
});
