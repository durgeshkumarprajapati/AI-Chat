import { prisma } from '@/lib/prisma';
import { ScheduledMessage, ScheduledMessageStatus, NotificationType } from '@prisma/client';
import { configService } from '@/features/config';
import { collaborationService } from './collaboration.service';
import { notificationService } from '@/features/notifications/notification.service';
import { ValidationError, AuthorizationError, NotFoundError } from '@/errors';

/**
 * Scheduled Messaging — the ScheduledMessage row is only the pending delivery instruction. It is
 * NEVER shown to recipients as a message and never duplicates CollabMessage's own fields.
 * Delivery reuses the existing, completely unmodified collaborationService.sendMessage() end to
 * end, so the delivered message gets the SAME real-time event, notification, unread-counter,
 * mention handling, and receipt behavior as a normal live send — for free, with zero duplicated
 * logic here.
 *
 * TIMEZONE STRATEGY (Phase 4): the caller (frontend) converts the user's local date/time input to
 * an absolute UTC instant using the browser's own native Date/Intl APIs BEFORE calling this
 * service — the browser already knows the user's real IANA timezone and DST rules exactly, via
 * the OS, with zero approximation. This is deliberately NOT built on quiet-hours.util.ts's
 * Intl.DateTimeFormat back-solving technique: that technique is hour-granularity and explicitly
 * documented as an approximation with its own "DST edge case guard" nudge — unsuitable for a
 * user-facing "deliver at exactly 14:30" scheduling feature. `scheduledFor` is always the final,
 * unambiguous UTC instant; `timezone` (the browser's IANA zone name) is stored ONLY so the UI can
 * later display "10:00 AM IST" — it never participates in any date arithmetic here or in the
 * worker. This server never assumes or depends on its own timezone.
 */
export class ScheduledMessageService {
  private async assertActiveChannelMembership(channelId: string, userId: string): Promise<void> {
    const membership = await prisma.collabChannelMember.findUnique({
      where: { channelId_userId: { channelId, userId } }
    });
    if (!membership) {
      throw new AuthorizationError('Access Denied: Not a member of this channel');
    }
  }

  private async minLeadMs(): Promise<number> {
    const minutes = await configService.getNumber('SCHEDULED_MESSAGE_MIN_LEAD_MINUTES', 2);
    return minutes * 60000;
  }

  /** Phase 5 — creation-time authorization: authenticated + active channel membership. Scheduling
   * authorization is explicitly NOT assumed to hold forever — see deliverDueMessages() for the
   * mandatory delivery-time revalidation. */
  public async createScheduledMessage(
    channelId: string,
    senderId: string,
    input: { content: string; scheduledFor: string; timezone?: string }
  ): Promise<ScheduledMessage> {
    const content = input.content.trim();
    if (!content) {
      throw new ValidationError('Message content cannot be empty.');
    }

    await this.assertActiveChannelMembership(channelId, senderId);

    const scheduledFor = new Date(input.scheduledFor);
    if (Number.isNaN(scheduledFor.getTime())) {
      throw new ValidationError('scheduledFor must be a valid date/time.');
    }

    const minLeadMs = await this.minLeadMs();
    if (scheduledFor.getTime() < Date.now() + minLeadMs) {
      throw new ValidationError(`Scheduled time must be at least ${Math.round(minLeadMs / 60000)} minute(s) in the future.`);
    }

    return prisma.scheduledMessage.create({
      data: {
        channelId,
        senderId,
        content,
        scheduledFor,
        timezone: input.timezone?.trim() || 'UTC'
      }
    });
  }

  /** Bounded, ownership-scoped listing — never returns another user's scheduled messages. */
  public async listScheduledMessages(
    senderId: string,
    options: { channelId?: string; status?: ScheduledMessageStatus; limit?: number } = {}
  ): Promise<ScheduledMessage[]> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    return prisma.scheduledMessage.findMany({
      where: {
        senderId,
        ...(options.channelId ? { channelId: options.channelId } : {}),
        ...(options.status ? { status: options.status } : {})
      },
      orderBy: { scheduledFor: 'asc' },
      take: limit
    });
  }

  private async getOwnedPendingMessage(id: string, senderId: string): Promise<ScheduledMessage> {
    const existing = await prisma.scheduledMessage.findUnique({ where: { id } });
    if (!existing || existing.senderId !== senderId) {
      throw new NotFoundError('Scheduled message');
    }
    return existing;
  }

  /** Editing is allowed ONLY while status === PENDING — once claimed for processing (or already
   * sent/failed/cancelled), edits are rejected outright rather than silently racing the worker. */
  public async editScheduledMessage(
    id: string,
    senderId: string,
    input: { content?: string; scheduledFor?: string }
  ): Promise<ScheduledMessage> {
    const existing = await this.getOwnedPendingMessage(id, senderId);
    if (existing.status !== ScheduledMessageStatus.PENDING) {
      throw new ValidationError(`Cannot edit a scheduled message in status ${existing.status}.`);
    }

    const data: { content?: string; scheduledFor?: Date } = {};
    if (input.content !== undefined) {
      const content = input.content.trim();
      if (!content) throw new ValidationError('Message content cannot be empty.');
      data.content = content;
    }
    if (input.scheduledFor !== undefined) {
      const scheduledFor = new Date(input.scheduledFor);
      if (Number.isNaN(scheduledFor.getTime())) {
        throw new ValidationError('scheduledFor must be a valid date/time.');
      }
      const minLeadMs = await this.minLeadMs();
      if (scheduledFor.getTime() < Date.now() + minLeadMs) {
        throw new ValidationError(`Scheduled time must be at least ${Math.round(minLeadMs / 60000)} minute(s) in the future.`);
      }
      data.scheduledFor = scheduledFor;
    }

    // Atomic, re-guarded by status: if the worker claimed this row (PENDING -> PROCESSING) in the
    // instant between the read above and this write, this update matches zero rows rather than
    // silently overwriting a message already being delivered.
    const result = await prisma.scheduledMessage.updateMany({
      where: { id, senderId, status: ScheduledMessageStatus.PENDING },
      data
    });
    if (result.count === 0) {
      throw new ValidationError('Cannot edit a scheduled message that is no longer pending.');
    }
    return prisma.scheduledMessage.findUniqueOrThrow({ where: { id } });
  }

  /** Idempotent — cancelling an already-cancelled message is a safe no-op, never an error. */
  public async cancelScheduledMessage(id: string, senderId: string): Promise<ScheduledMessage> {
    const existing = await this.getOwnedPendingMessage(id, senderId);
    if (existing.status === ScheduledMessageStatus.CANCELLED) {
      return existing;
    }
    if (existing.status !== ScheduledMessageStatus.PENDING) {
      throw new ValidationError(`Cannot cancel a scheduled message in status ${existing.status}.`);
    }

    const result = await prisma.scheduledMessage.updateMany({
      where: { id, senderId, status: ScheduledMessageStatus.PENDING },
      data: { status: ScheduledMessageStatus.CANCELLED, cancelledAt: new Date() }
    });
    if (result.count === 0) {
      // Lost the race to the worker claiming it for delivery right now — re-read and report
      // truthfully rather than claiming a cancellation that didn't actually happen.
      return prisma.scheduledMessage.findUniqueOrThrow({ where: { id } });
    }
    return prisma.scheduledMessage.findUniqueOrThrow({ where: { id } });
  }

  /**
   * Worker entry point — bounded batch, per-row atomic claim (mirrors the exact
   * calendar-sync.processor.ts pattern: findMany a bounded candidate set, then
   * updateMany({where:{id,status:'PENDING'}, data:{status:'PROCESSING'}}) and check count===0 to
   * detect a lost race). Multi-replica safe without requiring the scheduler lock to be held for
   * the entire delivery loop — only one replica's claim can ever succeed for a given row.
   */
  public async deliverDueMessages(batchSize = 20): Promise<{ delivered: number; failed: number; skipped: number }> {
    const due = await prisma.scheduledMessage.findMany({
      where: { status: ScheduledMessageStatus.PENDING, scheduledFor: { lte: new Date() } },
      orderBy: { scheduledFor: 'asc' },
      take: batchSize
    });

    let delivered = 0;
    let failed = 0;
    let skipped = 0;

    for (const candidate of due) {
      const claim = await prisma.scheduledMessage.updateMany({
        where: { id: candidate.id, status: ScheduledMessageStatus.PENDING },
        data: { status: ScheduledMessageStatus.PROCESSING, lastAttemptAt: new Date(), deliveryAttemptCount: { increment: 1 } }
      });
      if (claim.count === 0) {
        skipped++; // another replica already claimed this row
        continue;
      }

      const outcome = await this.deliverOne(candidate.id);
      if (outcome === 'SENT') delivered++;
      else if (outcome === 'FAILED') failed++;
      else skipped++;
    }

    return { delivered, failed, skipped };
  }

  /** Phase 6 — mandatory delivery-time revalidation. Reuses collaborationService.sendMessage()
   * for the actual send, which ALREADY re-checks channel membership internally (throws
   * 'Access Denied' if the sender was removed since scheduling) — no duplicated authorization
   * logic here. This method only adds the ONE check sendMessage cannot perform on its own behalf:
   * whether the sender's account is still ACTIVE (a live send can't happen from a suspended
   * account in the first place, but a message scheduled days earlier can outlive that). */
  private async deliverOne(scheduledMessageId: string): Promise<'SENT' | 'FAILED' | 'SKIPPED'> {
    const row = await prisma.scheduledMessage.findUnique({ where: { id: scheduledMessageId } });
    if (!row || row.status !== ScheduledMessageStatus.PROCESSING) {
      return 'SKIPPED'; // cancelled/edited/claimed-elsewhere between claim and this read
    }

    try {
      const sender = await prisma.user.findUnique({ where: { id: row.senderId }, select: { status: true } });
      if (!sender || sender.status !== 'ACTIVE') {
        await this.markFailed(row, 'Sender account is no longer active.', { notifySender: false });
        return 'FAILED';
      }

      // Deterministic, stable clientMessageId derived from this ScheduledMessage's own id —
      // reuses sendMessage's EXISTING clientMessageId + @@unique([channelId, clientMessageId])
      // idempotency mechanism verbatim. A retry (worker restart, re-claim after a crash) calling
      // sendMessage again with the SAME clientMessageId returns the already-created message
      // instead of creating a duplicate — this is the entire idempotency guarantee, achieved with
      // zero changes to sendMessage itself.
      const clientMessageId = `scheduled-${row.id}`;
      const message = await collaborationService.sendMessage(row.channelId, row.senderId, {
        content: row.content,
        clientMessageId
      });

      await prisma.scheduledMessage.update({
        where: { id: row.id },
        data: { status: ScheduledMessageStatus.SENT, sentAt: new Date(), sentMessageId: message.id }
      });
      return 'SENT';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isPermanent = /Access Denied|Forbidden|not found|not a member/i.test(message);

      if (isPermanent) {
        await this.markFailed(row, 'Sender is no longer authorized to send to this conversation.', { notifySender: true });
        return 'FAILED';
      }

      // Transient — retry up to the configured max, then give up.
      const maxAttempts = await configService.getNumber('SCHEDULED_MESSAGE_MAX_DELIVERY_ATTEMPTS', 3);
      if (row.deliveryAttemptCount >= maxAttempts) {
        await this.markFailed(row, 'Delivery failed after repeated attempts. See server logs for details.', { notifySender: true });
        return 'FAILED';
      }

      console.error(`[ScheduledMessageService] Transient delivery failure for ${row.id} (attempt ${row.deliveryAttemptCount}/${maxAttempts}):`, message);
      await prisma.scheduledMessage.update({
        where: { id: row.id },
        data: { status: ScheduledMessageStatus.PENDING } // eligible for the next tick's retry
      });
      return 'SKIPPED';
    }
  }

  private async markFailed(
    row: ScheduledMessage,
    reason: string,
    opts: { notifySender: boolean }
  ): Promise<void> {
    await prisma.scheduledMessage.update({
      where: { id: row.id },
      data: { status: ScheduledMessageStatus.FAILED, failureReason: reason }
    });

    if (!opts.notifySender) return;
    // Phase 13 — reuses the existing Notification architecture verbatim (no new notification
    // system). Only fired on the final FAILED transition, never on an intermediate retry.
    try {
      await notificationService.createNotification({
        userId: row.senderId,
        type: NotificationType.SYSTEM,
        title: 'Scheduled message could not be delivered',
        body: reason,
        channelId: row.channelId,
        metadata: { scheduledMessageId: row.id, deepLink: `/collab-chat?channel=${row.channelId}` }
      });
    } catch (err) {
      console.error(`[ScheduledMessageService] Failed to notify sender for ${row.id}:`, err instanceof Error ? err.message : err);
    }
  }
}

export const scheduledMessageService = new ScheduledMessageService();
