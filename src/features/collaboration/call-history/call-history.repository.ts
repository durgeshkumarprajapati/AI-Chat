import { prisma } from '@/lib/prisma';
import { CallHistoryQueryFilters, PaginatedCallHistoryResponse } from './call-history.types';
import { callHistoryMapper } from './call-history.mapper';
import { CallStatus } from '@prisma/client';

export class CallHistoryRepository {
  /**
   * Fetches paginated call history for a user across channels they belong to
   */
  public async getCallHistoryForUser(userId: string, filters: CallHistoryQueryFilters): Promise<PaginatedCallHistoryResponse> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const skip = (page - 1) * limit;

    // 1. Get channel IDs the user belongs to
    const userChannels = await prisma.collabChannelMember.findMany({
      where: { userId },
      select: { channelId: true }
    });
    const channelIds = userChannels.map((c) => c.channelId);

    if (filters.channelId) {
      if (!channelIds.includes(filters.channelId)) {
        throw new Error('Access Denied: User is not a member of the specified channel');
      }
    }

    if (channelIds.length === 0) {
      return {
        data: [],
        meta: { page, limit, total: 0, totalPages: 0, hasMore: false }
      };
    }

    const where: any = {
      channelId: filters.channelId || { in: channelIds }
    };

    if (filters.type) {
      where.type = filters.type;
    }

    if (filters.status) {
      where.status = filters.status as CallStatus;
    }

    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = new Date(filters.from);
      if (filters.to) where.createdAt.lte = new Date(filters.to);
    }

    const [total, calls] = await Promise.all([
      prisma.collabCall.count({ where }),
      prisma.collabCall.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          channel: { select: { id: true, name: true, type: true } },
          host: { select: { id: true, name: true, email: true, avatarUrl: true } },
          participants: {
            include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } }
          }
        }
      })
    ]);

    const totalPages = Math.ceil(total / limit);
    const data = calls.map((c) => callHistoryMapper.mapToDTO(c));

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages
      }
    };
  }

  /**
   * Fetches call details by ID ensuring user authorization
   */
  public async getCallDetails(callId: string, userId: string) {
    const call = await prisma.collabCall.findUnique({
      where: { id: callId },
      include: {
        channel: {
          select: {
            id: true,
            name: true,
            type: true,
            members: { select: { userId: true } }
          }
        },
        host: { select: { id: true, name: true, email: true, avatarUrl: true } },
        participants: {
          include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } }
        }
      }
    });

    if (!call) return null;

    const isMember = call.channel.members.some((m) => m.userId === userId);
    if (!isMember) {
      throw new Error('Access Denied: User is not authorized to access call details');
    }

    return callHistoryMapper.mapToDTO(call);
  }

  /**
   * Returns missed call count for user across accessible channels
   */
  public async getMissedCallCount(userId: string): Promise<number> {
    const userChannels = await prisma.collabChannelMember.findMany({
      where: { userId },
      select: { channelId: true }
    });
    const channelIds = userChannels.map((c) => c.channelId);

    if (channelIds.length === 0) return 0;

    return prisma.collabCallParticipant.count({
      where: {
        userId,
        status: CallStatus.MISSED,
        call: { channelId: { in: channelIds } }
      }
    });
  }
}

export const callHistoryRepository = new CallHistoryRepository();
