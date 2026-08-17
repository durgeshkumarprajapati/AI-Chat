import { researchRepository } from '../repository/research.repository';
import { ResearchEventType } from '../research.types';
import { prisma } from '@/lib/prisma';

export class ResearchEventService {
  public async emitEvent(sessionId: string, eventType: ResearchEventType, metadata: Record<string, unknown> = {}) {
    return researchRepository.logEvent(sessionId, eventType, metadata);
  }

  public async getSessionTimeline(sessionId: string) {
    return prisma.researchEvent.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' }
    });
  }
}

export const researchEventService = new ResearchEventService();
