import { prisma } from '@/lib/prisma';

export interface SafeUserResult {
  id: string;
  name: string | null;
  email: string;
  role: string;
  avatarUrl: string | null;
}

export class UserSearchService {
  /**
   * Search users by name or email with safety filtering and bounded query output.
   */
  public async searchUsers(
    query: string,
    currentUserId: string,
    limit = 10
  ): Promise<SafeUserResult[]> {
    const trimmed = (query || '').trim();
    if (trimmed.length < 2) {
      return [];
    }

    const boundedLimit = Math.min(Math.max(1, limit), 20);

    const users = await prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        OR: [
          { name: { contains: trimmed, mode: 'insensitive' } },
          { email: { contains: trimmed, mode: 'insensitive' } }
        ]
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true
      },
      take: boundedLimit,
      orderBy: { createdAt: 'desc' }
    });

    return users;
  }
}

export const userSearchService = new UserSearchService();
