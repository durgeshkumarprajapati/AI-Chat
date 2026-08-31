jest.mock('@/lib/auth', () => ({
  getAuthUser: jest.fn()
}));
jest.mock('@/features/notifications/push-subscription.service', () => ({
  pushSubscriptionService: { subscribe: jest.fn(), unsubscribe: jest.fn() }
}));
jest.mock('@/features/notifications/web-push.service', () => ({
  webPushService: { isConfigured: jest.fn(), getPublicKey: jest.fn() }
}));

import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { pushSubscriptionService } from '@/features/notifications/push-subscription.service';
import { webPushService } from '@/features/notifications/web-push.service';
import { POST as subscribePOST, DELETE as subscribeDELETE } from '@/app/api/notifications/push/subscribe/route';
import { GET as vapidKeyGET } from '@/app/api/notifications/push/vapid-public-key/route';

describe('Push notification API routes', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('GET /api/notifications/push/vapid-public-key', () => {
    it('requires authentication', async () => {
      (getAuthUser as jest.Mock).mockRejectedValue(new Error('Unauthorized'));
      const res = await vapidKeyGET(new NextRequest('http://localhost:3000/api/notifications/push/vapid-public-key'));
      expect(res.status).toBe(401);
    });

    it('reports configured:false without leaking a key when VAPID is not set up', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      (webPushService.isConfigured as jest.Mock).mockReturnValue(false);

      const res = await vapidKeyGET(new NextRequest('http://localhost:3000/api/notifications/push/vapid-public-key'));
      const json = await res.json();

      expect(json.data.configured).toBe(false);
      expect(json.data.publicKey).toBeNull();
    });

    it('returns the public key when configured', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      (webPushService.isConfigured as jest.Mock).mockReturnValue(true);
      (webPushService.getPublicKey as jest.Mock).mockReturnValue('pub-key-123');

      const res = await vapidKeyGET(new NextRequest('http://localhost:3000/api/notifications/push/vapid-public-key'));
      const json = await res.json();

      expect(json.data.publicKey).toBe('pub-key-123');
    });
  });

  describe('POST /api/notifications/push/subscribe', () => {
    it('saves the subscription for the authenticated caller only, never a body-supplied userId', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'real-user' });

      const req = new NextRequest('http://localhost:3000/api/notifications/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'user-agent': 'test-agent' },
        body: JSON.stringify({ userId: 'someone-elses-id', endpoint: 'https://push.example/x', keys: { p256dh: 'a', auth: 'b' } })
      });

      const res = await subscribePOST(req);
      expect(res.status).toBe(200);
      expect(pushSubscriptionService.subscribe).toHaveBeenCalledWith(
        'real-user',
        expect.objectContaining({ endpoint: 'https://push.example/x' })
      );
    });
  });

  describe('DELETE /api/notifications/push/subscribe', () => {
    it('requires an endpoint in the body', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      const req = new NextRequest('http://localhost:3000/api/notifications/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      const res = await subscribeDELETE(req);
      expect(res.status).toBe(400);
      expect(pushSubscriptionService.unsubscribe).not.toHaveBeenCalled();
    });

    it('removes the subscription scoped to the authenticated caller', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'real-user' });
      const req = new NextRequest('http://localhost:3000/api/notifications/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: 'https://push.example/x' })
      });

      const res = await subscribeDELETE(req);
      expect(res.status).toBe(200);
      expect(pushSubscriptionService.unsubscribe).toHaveBeenCalledWith('real-user', 'https://push.example/x');
    });
  });
});
