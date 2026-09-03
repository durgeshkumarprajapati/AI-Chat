import { prisma } from '@/lib/prisma';
import { notificationService } from '@/features/notifications/notification.service';
import { collabPubSubService, CollabEventPayload } from '@/features/collaboration/pubsub.service';
import { NotificationType } from '@prisma/client';

/**
 * Phase 91.8 — production-grade notification system hardening: deletion + authorization.
 * Complements the live two-instance manual verification (delivery, unread count, mark-read,
 * cross-user delete rejection, cross-instance delete event) with DB-backed regression coverage.
 */
describe('Notification deletion — ownership, persistence, and real-time delete events', () => {
  let owner: { id: string };
  let outsider: { id: string };

  beforeAll(async () => {
    owner = await prisma.user.upsert({
      where: { email: 'notif_del_owner@example.com' },
      create: { email: 'notif_del_owner@example.com', name: 'Owner', passwordHash: 'hash' },
      update: {}
    });
    outsider = await prisma.user.upsert({
      where: { email: 'notif_del_outsider@example.com' },
      create: { email: 'notif_del_outsider@example.com', name: 'Outsider', passwordHash: 'hash' },
      update: {}
    });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: [owner.id, outsider.id] } } });
  });

  it('deletes the owner\'s own notification permanently from Postgres and publishes notification:deleted', async () => {
    const created = await notificationService.createNotification({
      userId: owner.id,
      type: NotificationType.SYSTEM,
      title: 'Test',
      body: 'Body'
    });
    expect(created).not.toBeNull();

    const events: CollabEventPayload[] = [];
    const unsubscribe = collabPubSubService.subscribeGlobal((e) => events.push(e));

    const result = await notificationService.deleteNotification(created!.id, owner.id);
    unsubscribe();

    expect(result).toBe(true);
    const row = await prisma.notification.findUnique({ where: { id: created!.id } });
    expect(row).toBeNull();

    const deleteEvent = events.find((e) => e.type === 'notification:deleted' && (e.data as any).notificationId === created!.id);
    expect(deleteEvent).toBeDefined();
    expect(deleteEvent!.targetUserId).toBe(owner.id);
  });

  it('refuses to delete a notification belonging to a different user, and never removes it', async () => {
    const created = await notificationService.createNotification({
      userId: owner.id,
      type: NotificationType.SYSTEM,
      title: 'Test 2',
      body: 'Body 2'
    });

    const result = await notificationService.deleteNotification(created!.id, outsider.id);
    expect(result).toBe(false);

    const stillThere = await prisma.notification.findUnique({ where: { id: created!.id } });
    expect(stillThere).not.toBeNull();
  });

  it('deleteAllNotifications only removes the authenticated user\'s own rows, never another user\'s', async () => {
    await notificationService.createNotification({ userId: owner.id, type: NotificationType.SYSTEM, title: 'A', body: 'A' });
    await notificationService.createNotification({ userId: owner.id, type: NotificationType.SYSTEM, title: 'B', body: 'B' });
    const outsiderNotif = await notificationService.createNotification({ userId: outsider.id, type: NotificationType.SYSTEM, title: 'C', body: 'C' });

    const result = await notificationService.deleteAllNotifications(owner.id);
    expect(result.count).toBeGreaterThanOrEqual(2);

    const ownerRemaining = await prisma.notification.count({ where: { userId: owner.id } });
    expect(ownerRemaining).toBe(0);

    const outsiderStillThere = await prisma.notification.findUnique({ where: { id: outsiderNotif!.id } });
    expect(outsiderStillThere).not.toBeNull();
  });

  it('supports the new DOCUMENT and SYSTEM notification types end to end', async () => {
    const doc = await notificationService.createNotification({
      userId: owner.id,
      type: NotificationType.DOCUMENT,
      title: 'Document processed',
      body: 'Your document finished processing',
      metadata: { documentId: 'doc-123' }
    });
    expect(doc?.type).toBe('DOCUMENT');
    expect(doc?.metadata?.documentId).toBe('doc-123');

    const sys = await notificationService.createNotification({
      userId: owner.id,
      type: NotificationType.SYSTEM,
      title: 'System notice',
      body: 'Something system-level happened'
    });
    expect(sys?.type).toBe('SYSTEM');
  });
});
