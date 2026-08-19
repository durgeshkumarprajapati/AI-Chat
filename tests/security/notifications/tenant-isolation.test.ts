import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { GET as getNotifications } from '@/app/api/notifications/route';
import { PATCH as markRead } from '@/app/api/notifications/[id]/read/route';
import { NextRequest } from 'next/server';
import * as authLib from '@/lib/auth';
import { prisma } from '@/lib/prisma';

describe('Notification Tenant Isolation & Security Tests (Phase 47)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('should reject unauthenticated request to /api/notifications', async () => {
    jest.spyOn(authLib, 'getAuthUser').mockRejectedValue(new Error('Unauthorized'));

    const req = new NextRequest('http://localhost:3000/api/notifications');
    const res = await getNotifications(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
  });

  it('should prevent User A from marking User B notification as read', async () => {
    jest.spyOn(authLib, 'getAuthUser').mockResolvedValue({ id: 'user_a', email: 'usera@example.com', role: 'USER' } as any);
    jest.spyOn(prisma.notification, 'findFirst').mockResolvedValue(null);

    const req = new NextRequest('http://localhost:3000/api/notifications/notif_user_b/read', { method: 'PATCH' });
    const res = await markRead(req, { params: { id: 'notif_user_b' } });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe('Notification not found');
  });
});
