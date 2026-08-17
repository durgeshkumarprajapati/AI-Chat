import { prisma } from '@/lib/prisma';
import {
  ResearchSessionStatus,
  ResearchMode,
  ResearchSourceMode,
  ResearchTaskType,
  ResearchTaskStatus,
  ResearchConfidence,
  ResearchConflictType,
  ResearchConflictStatus,
  ResearchEventType
} from '@prisma/client';

export class ResearchRepository {
  async createSession(data: {
    userId: string;
    title: string;
    question: string;
    researchMode: ResearchMode;
    sourceMode: ResearchSourceMode;
    knowledgeBaseId?: string;
    roadmapId?: string;
    maxSteps: number;
    externalWebEnabled: boolean;
  }) {
    return prisma.researchSession.create({
      data: {
        userId: data.userId,
        title: data.title,
        question: data.question,
        researchMode: data.researchMode,
        sourceMode: data.sourceMode,
        knowledgeBaseId: data.knowledgeBaseId || null,
        roadmapId: data.roadmapId || null,
        maxSteps: data.maxSteps,
        externalWebEnabled: data.externalWebEnabled,
        status: ResearchSessionStatus.RECEIVED
      },
      include: {
        knowledgeBase: true,
        roadmap: true,
        tasks: true,
        sources: true,
        reports: true
      }
    });
  }

  async getSessionById(sessionId: string, userId: string) {
    return prisma.researchSession.findFirst({
      where: { id: sessionId, userId },
      include: {
        knowledgeBase: true,
        roadmap: true,
        tasks: { orderBy: { priority: 'asc' } },
        sources: true,
        evidences: {
          include: {
            source: true
          }
        },
        claims: true,
        conflicts: true,
        reports: { orderBy: { createdAt: 'desc' }, take: 1 },
        events: { orderBy: { createdAt: 'asc' } }
      }
    });
  }

  async getUserSessions(userId: string) {
    return prisma.researchSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        knowledgeBase: true,
        roadmap: true,
        reports: { take: 1 },
        _count: {
          select: {
            sources: true,
            claims: true,
            conflicts: true,
            tasks: true
          }
        }
      }
    });
  }

  async deleteSession(sessionId: string, userId: string) {
    const session = await prisma.researchSession.findFirst({
      where: { id: sessionId, userId }
    });
    if (!session) return false;

    await prisma.researchSession.delete({
      where: { id: sessionId }
    });
    return true;
  }

  async updateSessionStatus(
    sessionId: string,
    status: ResearchSessionStatus,
    updates?: { progressPercent?: number; stepsUsed?: number; completedAt?: Date }
  ) {
    return prisma.researchSession.update({
      where: { id: sessionId },
      data: {
        status,
        ...(updates?.progressPercent !== undefined ? { progressPercent: updates.progressPercent } : {}),
        ...(updates?.stepsUsed !== undefined ? { stepsUsed: updates.stepsUsed } : {}),
        ...(updates?.completedAt !== undefined ? { completedAt: updates.completedAt } : {}),
        ...(status === ResearchSessionStatus.SEARCHING && !updates?.completedAt ? { startedAt: new Date() } : {})
      }
    });
  }

  async incrementSessionCounts(
    sessionId: string,
    counts: { searchCount?: number; llmCallCount?: number; sourceCount?: number; evidenceCount?: number; claimCount?: number; conflictCount?: number }
  ) {
    return prisma.researchSession.update({
      where: { id: sessionId },
      data: {
        ...(counts.searchCount ? { searchCount: { increment: counts.searchCount } } : {}),
        ...(counts.llmCallCount ? { llmCallCount: { increment: counts.llmCallCount } } : {}),
        ...(counts.sourceCount ? { sourceCount: { increment: counts.sourceCount } } : {}),
        ...(counts.evidenceCount ? { evidenceCount: { increment: counts.evidenceCount } } : {}),
        ...(counts.claimCount ? { claimCount: { increment: counts.claimCount } } : {}),
        ...(counts.conflictCount ? { conflictCount: { increment: counts.conflictCount } } : {})
      }
    });
  }

  async createTasks(
    sessionId: string,
    tasks: Array<{ objective: string; type: ResearchTaskType; priority: number; query?: string }>
  ) {
    const created = [];
    for (const t of tasks) {
      const task = await prisma.researchTask.create({
        data: {
          sessionId,
          objective: t.objective,
          type: t.type,
          priority: t.priority,
          query: t.query || null,
          status: ResearchTaskStatus.PENDING
        }
      });
      created.push(task);
    }
    return created;
  }

  async updateTaskStatus(taskId: string, status: ResearchTaskStatus, evidenceCount?: number) {
    return prisma.researchTask.update({
      where: { id: taskId },
      data: {
        status,
        ...(evidenceCount !== undefined ? { evidenceCount } : {}),
        ...(status === ResearchTaskStatus.IN_PROGRESS ? { startedAt: new Date() } : {}),
        ...(status === ResearchTaskStatus.COMPLETED || status === ResearchTaskStatus.FAILED ? { completedAt: new Date() } : {})
      }
    });
  }

  async saveSource(data: {
    sessionId: string;
    url?: string;
    title: string;
    domain?: string;
    sourceType: string;
    documentId?: string;
    authorityScore?: number;
    relevanceScore?: number;
    freshnessScore?: number;
    qualityScore?: number;
    contentHash?: string;
  }) {
    return prisma.researchSource.create({
      data: {
        sessionId: data.sessionId,
        url: data.url || null,
        title: data.title,
        domain: data.domain || null,
        sourceType: data.sourceType,
        documentId: data.documentId || null,
        authorityScore: data.authorityScore ?? 0.5,
        relevanceScore: data.relevanceScore ?? 0.5,
        freshnessScore: data.freshnessScore ?? 0.5,
        qualityScore: data.qualityScore ?? 0.5,
        contentHash: data.contentHash || null
      }
    });
  }

  async saveEvidence(data: {
    sessionId: string;
    taskId?: string;
    sourceId: string;
    documentId?: string;
    chunkId?: string;
    visualId?: string;
    contentHash: string;
    evidenceText: string;
    claimText?: string;
    pageNumber?: number;
    confidence?: ResearchConfidence;
  }) {
    return prisma.researchEvidence.create({
      data: {
        sessionId: data.sessionId,
        taskId: data.taskId || null,
        sourceId: data.sourceId,
        documentId: data.documentId || null,
        chunkId: data.chunkId || null,
        visualId: data.visualId || null,
        contentHash: data.contentHash,
        evidenceText: data.evidenceText,
        claimText: data.claimText || null,
        pageNumber: data.pageNumber || null,
        confidence: data.confidence || ResearchConfidence.MEDIUM
      }
    });
  }

  async saveClaim(data: {
    sessionId: string;
    claimText: string;
    normalizedClaim: string;
    confidence?: ResearchConfidence;
  }) {
    return prisma.researchClaim.create({
      data: {
        sessionId: data.sessionId,
        claimText: data.claimText,
        normalizedClaim: data.normalizedClaim,
        confidence: data.confidence || ResearchConfidence.MEDIUM
      }
    });
  }

  async saveConflict(data: {
    sessionId: string;
    claimAId: string;
    claimBId: string;
    conflictType: ResearchConflictType;
    severity?: string;
    resolutionStatus?: ResearchConflictStatus;
    resolutionSummary?: string;
  }) {
    return prisma.researchConflict.create({
      data: {
        sessionId: data.sessionId,
        claimAId: data.claimAId,
        claimBId: data.claimBId,
        conflictType: data.conflictType,
        severity: data.severity || 'MEDIUM',
        resolutionStatus: data.resolutionStatus || ResearchConflictStatus.UNRESOLVED,
        resolutionSummary: data.resolutionSummary || null
      }
    });
  }

  async saveReport(data: {
    sessionId: string;
    summary: string;
    reportContent: string;
    reportVersion?: number;
    sourceFingerprint?: string;
  }) {
    return prisma.researchReport.create({
      data: {
        sessionId: data.sessionId,
        summary: data.summary,
        reportContent: data.reportContent,
        reportVersion: data.reportVersion ?? 1,
        sourceFingerprint: data.sourceFingerprint || null
      }
    });
  }

  async logEvent(sessionId: string, eventType: ResearchEventType, metadata: Record<string, unknown> = {}) {
    return prisma.researchEvent.create({
      data: {
        sessionId,
        eventType,
        metadata: JSON.parse(JSON.stringify(metadata))
      }
    });
  }
}

export const researchRepository = new ResearchRepository();
