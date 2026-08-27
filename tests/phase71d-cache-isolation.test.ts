import { retrievalCandidateCacheService } from '@/features/rag/cache/retrieval-candidate-cache.service';
import { answerCacheService } from '@/features/rag/cache/answer-cache.service';

describe('Phase 71D — Cache Security & Scope Isolation', () => {
  it('proves Private RAG cache keys cannot collide or leak across different users', () => {
    const keyUserA = answerCacheService.generateKey({
      tenantId: 'tenant-1',
      scopeType: 'PRIVATE',
      scopeId: 'user-A',
      conversationId: 'conv-1',
      sourceVersionHash: 'v1',
      queryHash: 'q1'
    });

    const keyUserB = answerCacheService.generateKey({
      tenantId: 'tenant-1',
      scopeType: 'PRIVATE',
      scopeId: 'user-B',
      conversationId: 'conv-1',
      sourceVersionHash: 'v1',
      queryHash: 'q1'
    });

    expect(keyUserA).not.toEqual(keyUserB);
  });

  it('proves Group RAG cache keys cannot collide or leak across different group scopes', () => {
    const keyGroup1 = answerCacheService.generateKey({
      tenantId: 'tenant-1',
      scopeType: 'GROUP',
      scopeId: 'group-1',
      conversationId: 'conv-g1',
      sourceVersionHash: 'v1',
      queryHash: 'q1'
    });

    const keyGroup2 = answerCacheService.generateKey({
      tenantId: 'tenant-1',
      scopeType: 'GROUP',
      scopeId: 'group-2',
      conversationId: 'conv-g1',
      sourceVersionHash: 'v1',
      queryHash: 'q1'
    });

    expect(keyGroup1).not.toEqual(keyGroup2);
  });

  it('proves Project RAG cache keys cannot collide or leak across different project workspaces', () => {
    const keyProjA = retrievalCandidateCacheService.generateKey({
      tenantId: 'tenant-1',
      scopeType: 'PROJECT',
      scopeId: 'project-A',
      sourceVersionHash: 'v1',
      queryHash: 'q1'
    });

    const keyProjB = retrievalCandidateCacheService.generateKey({
      tenantId: 'tenant-1',
      scopeType: 'PROJECT',
      scopeId: 'project-B',
      sourceVersionHash: 'v1',
      queryHash: 'q1'
    });

    expect(keyProjA).not.toEqual(keyProjB);
  });

  it('proves Tenant A cache keys cannot collide or leak to Tenant B', () => {
    const keyTenantA = answerCacheService.generateKey({
      tenantId: 'tenant-A',
      scopeType: 'PROJECT',
      scopeId: 'project-1',
      conversationId: 'conv-1',
      sourceVersionHash: 'v1',
      queryHash: 'q1'
    });

    const keyTenantB = answerCacheService.generateKey({
      tenantId: 'tenant-B',
      scopeType: 'PROJECT',
      scopeId: 'project-1',
      conversationId: 'conv-1',
      sourceVersionHash: 'v1',
      queryHash: 'q1'
    });

    expect(keyTenantA).not.toEqual(keyTenantB);
  });
});
