import { researchRepository } from '../repository/research.repository';
import { researchAgentService } from '../agent/research-agent.service';
import { researchCacheService } from '../cache/research-cache.service';
import { researchSecurityService } from '../security/research-security.service';
import { CreateResearchSessionInput, ResearchMode, ResearchSessionStatus, ResearchSourceMode } from '../research.types';
import { RESEARCH_MODE_BUDGETS } from '../research.constants';
import { AuthorizationError, NotFoundError, ValidationError } from '@/errors';
import { prisma } from '@/lib/prisma';

export class ResearchSessionService {
  public async createSession(userId: string, input: CreateResearchSessionInput) {
    if (!input.question || typeof input.question !== 'string' || !input.question.trim()) {
      throw new ValidationError('Research question is required.');
    }

    const title = input.title?.trim() || input.question.trim().slice(0, 60);
    const researchMode = input.researchMode || ResearchMode.STANDARD;
    const sourceMode = input.sourceMode || ResearchSourceMode.AUTO;
    const budget = RESEARCH_MODE_BUDGETS[researchMode] || RESEARCH_MODE_BUDGETS.STANDARD;

    // Verify ownership of requested resources
    await researchSecurityService.verifyResourceAuthorization(userId, {
      knowledgeBaseId: input.knowledgeBaseId,
      roadmapId: input.roadmapId,
      documentIds: input.documentIds
    });

    const session = await researchRepository.createSession({
      userId,
      title,
      question: input.question.trim(),
      researchMode,
      sourceMode,
      knowledgeBaseId: input.knowledgeBaseId,
      roadmapId: input.roadmapId,
      maxSteps: budget.maxAgentSteps,
      externalWebEnabled: input.externalWebEnabled !== false
    });

    return session;
  }

  public async startResearch(userId: string, sessionId: string) {
    const session = await researchRepository.getSessionById(sessionId, userId);
    if (!session) throw new NotFoundError('Research session not found.');

    // Execute research workflow
    return researchAgentService.executeResearch(userId, sessionId);
  }

  public async cancelResearch(userId: string, sessionId: string) {
    const session = await researchRepository.getSessionById(sessionId, userId);
    if (!session) throw new NotFoundError('Research session not found.');

    await researchRepository.updateSessionStatus(sessionId, ResearchSessionStatus.CANCELLED);
    await researchCacheService.invalidate(userId, `session:${sessionId}`);
    return { success: true, message: 'Research session cancelled.' };
  }

  public async getSessionDetails(userId: string, sessionId: string) {
    const cached = await researchCacheService.get<any>(userId, `session:${sessionId}`);
    if (cached) return cached;

    const session = await researchRepository.getSessionById(sessionId, userId);
    if (!session) throw new NotFoundError('Research session not found.');

    await researchCacheService.set(userId, `session:${sessionId}`, session, 300);
    return session;
  }

  public async getUserSessions(userId: string) {
    return researchRepository.getUserSessions(userId);
  }

  public async deleteSession(userId: string, sessionId: string) {
    const deleted = await researchRepository.deleteSession(sessionId, userId);
    if (!deleted) throw new NotFoundError('Research session not found.');
    await researchCacheService.invalidate(userId, `session:${sessionId}`);
    return true;
  }

  public async submitFollowUp(userId: string, sessionId: string, followUpQuestion: string) {
    const session = await researchRepository.getSessionById(sessionId, userId);
    if (!session) throw new NotFoundError('Research session not found.');

    if (!followUpQuestion || typeof followUpQuestion !== 'string') {
      throw new ValidationError('Follow-up question is required.');
    }

    // Create a follow-up sub-task or new research session with preserved source mode
    const followUpSession = await this.createSession(userId, {
      title: `Follow-up: ${followUpQuestion.slice(0, 50)}`,
      question: followUpQuestion,
      researchMode: session.researchMode as ResearchMode,
      sourceMode: session.sourceMode as ResearchSourceMode,
      knowledgeBaseId: session.knowledgeBaseId || undefined,
      roadmapId: session.roadmapId || undefined,
      externalWebEnabled: session.externalWebEnabled
    });

    // Start follow-up investigation
    const report = await this.startResearch(userId, followUpSession.id);
    return { sessionId: followUpSession.id, report };
  }

  public async getAdminMetrics(adminUserId: string) {
    const user = await prisma.user.findUnique({ where: { id: adminUserId } });
    if (!user || user.role !== 'ADMIN') {
      throw new AuthorizationError('Admin privileges required.');
    }

    const [totalSessions, completedSessions, totalSources, totalClaims, totalConflicts] = await Promise.all([
      prisma.researchSession.count(),
      prisma.researchSession.count({ where: { status: ResearchSessionStatus.COMPLETED } }),
      prisma.researchSource.count(),
      prisma.researchClaim.count(),
      prisma.researchConflict.count()
    ]);

    return {
      totalSessions,
      completedSessions,
      totalSources,
      totalClaims,
      totalConflicts,
      completionRate: totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 100
    };
  }
}

export const researchSessionService = new ResearchSessionService();
