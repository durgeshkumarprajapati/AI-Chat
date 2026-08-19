import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { GET as getUnreadCount } from '@/app/api/notifications/unread-count/route';
import { POST as markAllRead } from '@/app/api/notifications/read-all/route';
import { GET as getPrefs, PUT as updatePrefs } from '@/app/api/notifications/preferences/route';
import { NextRequest } from 'next/server';
import * as authLib from '@/lib/auth';
import { notificationService } from '@/features/notifications/notification.service';
import { notificationPreferencesService } from '@/features/notifications/notification-preferences.service';

describe('Notification REST APIs Tests (Phase 47)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('GET /api/notifications/unread-count returns unread count', async () => {
    jest.spyOn(authLib, 'getAuthUser').mockResolvedValue({ id: 'user_1', email: 'user1@example.com' } as any);
    jest.spyOn(notificationService, 'getUnreadCount').mockResolvedValue(5);

    const req = new NextRequest('http://localhost:3000/api/notifications/unread-count');
    const res = await getUnreadCount(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.unreadCount).toBe(5);
  });

  it('POST /api/notifications/read-all marks all notifications read', async () => {
    jest.spyOn(authLib, 'getAuthUser').mockResolvedValue({ id: 'user_1', email: 'user1@example.com' } as any);
    jest.spyOn(notificationService, 'markAllAsRead').mockResolvedValue({ count: 3 });

    const req = new NextRequest('http://localhost:3000/api/notifications/read-all', { method: 'POST' });
    const res = await markAllRead(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.count).toBe(3);
  });

  it('GET & PUT /api/notifications/preferences manages user notification settings', async () => {
    jest.spyOn(authLib, 'getAuthUser').mockResolvedValue({ id: 'user_1', email: 'user1@example.com' } as any);
    jest.spyOn(notificationPreferencesService, 'getPreferences').mockResolvedValue({
      userId: 'user_1',
      directMessages: true,
      groupMessages: true,
      mentions: true,
      groupMembership: true,
      aiReplies: true,
      roadmapShares: true
    });
    jest.spyOn(notificationPreferencesService, 'updatePreferences').mockResolvedValue({
      userId: 'user_1',
      directMessages: false,
      groupMessages: true,
      mentions: true,
      groupMembership: true,
      aiReplies: true,
      roadmapShares: true
    });

    const getReq = new NextRequest('http://localhost:3000/api/notifications/preferences');
    const getRes = await getPrefs(getReq);
    const getJson = await getRes.json();

    expect(getRes.status).toBe(200);
    expect(getJson.data.directMessages).toBe(true);

    const putReq = new NextRequest('http://localhost:3000/api/notifications/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directMessages: false })
    });
    const putRes = await updatePrefs(putReq);
    const putJson = await putRes.json();

    expect(putRes.status).toBe(200);
    expect(putJson.data.directMessages).toBe(false);
  });
});
