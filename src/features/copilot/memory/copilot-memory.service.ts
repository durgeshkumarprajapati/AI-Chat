import { prisma } from '@/lib/prisma';
import { CopilotMemoryCategory } from '../types/copilot.types';

export interface CreateMemoryPayload {
  category: CopilotMemoryCategory;
  key: string;
  value: string;
  confidence?: number;
  source?: string;
  projectId?: string;
  expiresAt?: Date;
}

export class CopilotMemoryService {
  /**
   * Create or update a user-approved memory item.
   */
  public async upsertMemory(userId: string, payload: CreateMemoryPayload) {
    return prisma.copilotMemory.upsert({
      where: {
        userId_key_projectId: {
          userId,
          key: payload.key,
          projectId: payload.projectId || null as any
        }
      },
      update: {
        category: payload.category as any,
        value: payload.value,
        confidence: payload.confidence ?? 1.0,
        source: payload.source || 'user_explicit',
        expiresAt: payload.expiresAt || null
      },
      create: {
        userId,
        projectId: payload.projectId || null,
        category: payload.category as any,
        key: payload.key,
        value: payload.value,
        confidence: payload.confidence ?? 1.0,
        source: payload.source || 'user_explicit',
        expiresAt: payload.expiresAt || null
      }
    });
  }

  /**
   * Get all active memories for a user (and optionally project).
   */
  public async getMemories(userId: string, projectId?: string) {
    const now = new Date();
    return prisma.copilotMemory.findMany({
      where: {
        userId,
        OR: [
          { projectId: null },
          ...(projectId ? [{ projectId }] : [])
        ],
        AND: [
          {
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: now } }
            ]
          }
        ]
      },
      orderBy: { updatedAt: 'desc' }
    });
  }

  /**
   * Delete a specific memory item.
   */
  public async deleteMemory(id: string, userId: string): Promise<void> {
    await prisma.copilotMemory.deleteMany({
      where: { id, userId }
    });
  }

  /**
   * Clear all memories for a user (or specific project).
   */
  public async clearAllMemories(userId: string, projectId?: string): Promise<void> {
    await prisma.copilotMemory.deleteMany({
      where: {
        userId,
        ...(projectId ? { projectId } : {})
      }
    });
  }
}

export const copilotMemoryService = new CopilotMemoryService();
