import { createHash } from 'crypto';

export class KnowledgeGraphDeduplicatorService {
  public normalizeName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_');
  }

  public computeRelationshipFingerprint(
    userId: string,
    projectId: string | null | undefined,
    sourceEntityId: string,
    relationshipType: string,
    targetEntityId: string
  ): string {
    const scope = projectId ? `proj:${projectId}` : `user:${userId}`;
    const raw = `${scope}:${sourceEntityId}:${relationshipType.toUpperCase()}:${targetEntityId}`;
    return createHash('sha256').update(raw).digest('hex');
  }

  public computeSourceTextHash(text: string): string {
    return createHash('sha256').update(text.trim()).digest('hex');
  }

  public computeClaimHash(
    userId: string,
    projectId: string | null | undefined,
    subjectEntityId: string,
    predicate: string,
    objectEntityId?: string | null,
    value?: string | null
  ): string {
    const scope = projectId ? `proj:${projectId}` : `user:${userId}`;
    const raw = `${scope}:${subjectEntityId}:${predicate.toLowerCase().trim()}:${objectEntityId || ''}:${value || ''}`;
    return createHash('sha256').update(raw).digest('hex');
  }
}

export const knowledgeGraphDeduplicatorService = new KnowledgeGraphDeduplicatorService();
