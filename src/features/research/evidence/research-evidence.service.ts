import { researchRepository } from '../repository/research.repository';
import { researchEvidenceDeduplicator } from './research-evidence-deduplicator';
import { researchEvidenceRanker } from './research-evidence-ranker';
import { ResearchConfidence } from '../research.types';
import { prisma } from '@/lib/prisma';

export class ResearchEvidenceService {
  public async addEvidence(params: {
    sessionId: string;
    taskId?: string;
    sourceTitle: string;
    url?: string;
    domain?: string;
    sourceType: string;
    documentId?: string;
    chunkId?: string;
    visualId?: string;
    evidenceText: string;
    claimText?: string;
    pageNumber?: number;
    relevanceScore?: number;
    authorityScore?: number;
    freshnessScore?: number;
  }) {
    const hash = researchEvidenceDeduplicator.hashContent(params.evidenceText);

    // Deduplication check per session
    const existing = await prisma.researchEvidence.findFirst({
      where: {
        sessionId: params.sessionId,
        contentHash: hash
      }
    });
    if (existing) return existing;

    // Normalize URL if web source
    const finalUrl = params.url ? researchEvidenceDeduplicator.normalizeUrl(params.url) : undefined;

    // Calculate quality ranking score
    const rankItem = {
      id: 'temp',
      relevanceScore: params.relevanceScore ?? 0.8,
      authorityScore: params.authorityScore ?? (params.url?.includes('.gov') || params.url?.includes('.edu') ? 0.9 : 0.6),
      freshnessScore: params.freshnessScore ?? 0.8
    };
    const [ranked] = researchEvidenceRanker.rankItems([rankItem]);
    const finalRanked = (ranked || { ...rankItem, qualityScore: 0.8 }) as any;

    // Save Source
    const source = await researchRepository.saveSource({
      sessionId: params.sessionId,
      url: finalUrl,
      title: params.sourceTitle,
      domain: params.domain || (finalUrl ? new URL(finalUrl).hostname : undefined),
      sourceType: params.sourceType,
      documentId: params.documentId,
      authorityScore: finalRanked.authorityScore,
      relevanceScore: finalRanked.relevanceScore,
      freshnessScore: finalRanked.freshnessScore,
      qualityScore: finalRanked.qualityScore ?? 0.8,
      contentHash: hash
    });

    // Save Evidence
    const evidence = await researchRepository.saveEvidence({
      sessionId: params.sessionId,
      taskId: params.taskId,
      sourceId: source.id,
      documentId: params.documentId,
      chunkId: params.chunkId,
      visualId: params.visualId,
      contentHash: hash,
      evidenceText: params.evidenceText,
      claimText: params.claimText,
      pageNumber: params.pageNumber,
      confidence: ResearchConfidence.HIGH
    });

    await researchRepository.incrementSessionCounts(params.sessionId, {
      sourceCount: 1,
      evidenceCount: 1
    });

    return evidence;
  }
}

export const researchEvidenceService = new ResearchEvidenceService();
