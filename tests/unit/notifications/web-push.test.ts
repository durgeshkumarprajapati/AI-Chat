const mockSendNotification = jest.fn();
const mockSetVapidDetails = jest.fn();

jest.mock('web-push', () => ({
  __esModule: true,
  default: {
    setVapidDetails: (...args: unknown[]) => mockSetVapidDetails(...args),
    sendNotification: (...args: unknown[]) => mockSendNotification(...args)
  }
}));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    pushSubscription: {
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined)
    }
  }
}));

const SUB = { id: 'sub-1', userId: 'user-1', endpoint: 'https://push.example/1', p256dh: 'p256dh', auth: 'auth' };

describe('WebPushService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('reports not configured and no-ops sendToUser when VAPID keys are absent', async () => {
    jest.doMock('@/config/env', () => ({ env: { server: {} } }));
    const { webPushService } = await import('@/features/notifications/web-push.service');
    const { prisma } = await import('@/lib/prisma');

    expect(webPushService.isConfigured()).toBe(false);
    await webPushService.sendToUser('user-1', { title: 't', body: 'b' });

    expect(prisma.pushSubscription.findMany).not.toHaveBeenCalled();
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('sends to every stored subscription for the user when configured', async () => {
    jest.doMock('@/config/env', () => ({
      env: { server: { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', VAPID_SUBJECT: 'mailto:a@b.com' } }
    }));
    const { webPushService } = await import('@/features/notifications/web-push.service');
    const { prisma } = await import('@/lib/prisma');
    (prisma.pushSubscription.findMany as jest.Mock).mockResolvedValue([SUB]);
    mockSendNotification.mockResolvedValue({ statusCode: 201 });

    expect(webPushService.isConfigured()).toBe(true);
    await webPushService.sendToUser('user-1', { title: 'Hello', body: 'World', url: '/x' });

    expect(mockSendNotification).toHaveBeenCalledWith(
      { endpoint: SUB.endpoint, keys: { p256dh: SUB.p256dh, auth: SUB.auth } },
      JSON.stringify({ title: 'Hello', body: 'World', url: '/x' })
    );
  });

  it('removes the subscription when the push service reports 410 Gone, without throwing', async () => {
    jest.doMock('@/config/env', () => ({
      env: { server: { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' } }
    }));
    const { webPushService } = await import('@/features/notifications/web-push.service');
    const { prisma } = await import('@/lib/prisma');
    (prisma.pushSubscription.findMany as jest.Mock).mockResolvedValue([SUB]);
    mockSendNotification.mockRejectedValue({ statusCode: 410, message: 'gone' });

    await expect(webPushService.sendToUser('user-1', { title: 't', body: 'b' })).resolves.toBeUndefined();
    expect(prisma.pushSubscription.delete).toHaveBeenCalledWith({ where: { id: SUB.id } });
  });

  it('never throws even if the push provider fails for an unrelated reason', async () => {
    jest.doMock('@/config/env', () => ({
      env: { server: { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' } }
    }));
    const { webPushService } = await import('@/features/notifications/web-push.service');
    const { prisma } = await import('@/lib/prisma');
    (prisma.pushSubscription.findMany as jest.Mock).mockResolvedValue([SUB]);
    mockSendNotification.mockRejectedValue({ statusCode: 500, message: 'server error' });

    await expect(webPushService.sendToUser('user-1', { title: 't', body: 'b' })).resolves.toBeUndefined();
    expect(prisma.pushSubscription.delete).not.toHaveBeenCalled();
  });
});
