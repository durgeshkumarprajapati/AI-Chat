const mockProjectRoadmapFindFirst = jest.fn();
const mockProjectDocumentFindMany = jest.fn();
jest.mock('@/lib/prisma', () => ({
  prisma: {
    projectRoadmap: { findFirst: (...args: unknown[]) => mockProjectRoadmapFindFirst(...args) },
    projectDocument: { findMany: (...args: unknown[]) => mockProjectDocumentFindMany(...args) }
  }
}));

const mockRetrieveContext = jest.fn();
jest.mock('@/features/rag/retrieval/retrieval.service', () => ({
  retrievalService: { retrieveContext: (...args: unknown[]) => mockRetrieveContext(...args) }
}));

const mockAuthorizeProjectAccess = jest.fn();
jest.mock('@/features/projects/project-authorization.service', () => ({
  projectAuthorizationService: { authorizeProjectAccess: (...args: unknown[]) => mockAuthorizeProjectAccess(...args) }
}));

import { roadmapCopilotRetrievalService } from '@/features/roadmap/copilot/roadmap-copilot-retrieval.service';

const CONFIG = { enabled: true, maxDocuments: 3, maxExcerpts: 3, maxExcerptChars: 400, maxContextChars: 3000 };

function chunk(overrides: Record<string, unknown> = {}) {
  return { documentId: 'doc-1', filename: 'requirements.pdf', content: 'The authentication module must support OAuth2.', ...overrides };
}

describe('RoadmapCopilotRetrievalService.retrieve', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns used:false without any DB calls when the RAG feature flag is disabled', async () => {
    const result = await roadmapCopilotRetrievalService.retrieve({ roadmapId: 'r1', userId: 'u1', query: 'q', config: { ...CONFIG, enabled: false } });

    expect(result).toEqual({ used: false, documents: [] });
    expect(mockProjectRoadmapFindFirst).not.toHaveBeenCalled();
  });

  it('returns used:false when the roadmap has no project link (no safe scope exists)', async () => {
    mockProjectRoadmapFindFirst.mockResolvedValue(null);

    const result = await roadmapCopilotRetrievalService.retrieve({ roadmapId: 'r1', userId: 'u1', query: 'q', config: CONFIG });

    expect(result).toEqual({ used: false, documents: [] });
    expect(mockAuthorizeProjectAccess).not.toHaveBeenCalled();
  });

  it('returns used:false when the requesting user lacks project access, without throwing', async () => {
    mockProjectRoadmapFindFirst.mockResolvedValue({ projectId: 'proj-1' });
    mockAuthorizeProjectAccess.mockRejectedValue(new Error('Access denied'));

    const result = await roadmapCopilotRetrievalService.retrieve({ roadmapId: 'r1', userId: 'u1', query: 'q', config: CONFIG });

    expect(result).toEqual({ used: false, documents: [] });
    expect(mockProjectDocumentFindMany).not.toHaveBeenCalled();
  });

  it('calls authorizeProjectAccess with the ASK_AI permission', async () => {
    mockProjectRoadmapFindFirst.mockResolvedValue({ projectId: 'proj-1' });
    mockAuthorizeProjectAccess.mockResolvedValue('MEMBER');
    mockProjectDocumentFindMany.mockResolvedValue([]);

    await roadmapCopilotRetrievalService.retrieve({ roadmapId: 'r1', userId: 'u1', query: 'q', config: CONFIG });

    expect(mockAuthorizeProjectAccess).toHaveBeenCalledWith('u1', 'proj-1', 'ASK_AI');
  });

  it('returns used:false when the project has zero linked documents', async () => {
    mockProjectRoadmapFindFirst.mockResolvedValue({ projectId: 'proj-1' });
    mockAuthorizeProjectAccess.mockResolvedValue('MEMBER');
    mockProjectDocumentFindMany.mockResolvedValue([]);

    const result = await roadmapCopilotRetrievalService.retrieve({ roadmapId: 'r1', userId: 'u1', query: 'q', config: CONFIG });

    expect(result).toEqual({ used: false, documents: [] });
    expect(mockRetrieveContext).not.toHaveBeenCalled();
  });

  it('scopes retrieval to documents linked to ONLY this project, calling retrieveContext with the requesting userId', async () => {
    mockProjectRoadmapFindFirst.mockResolvedValue({ projectId: 'proj-1' });
    mockAuthorizeProjectAccess.mockResolvedValue('MEMBER');
    mockProjectDocumentFindMany.mockResolvedValue([{ documentId: 'doc-1' }, { documentId: 'doc-2' }]);
    mockRetrieveContext.mockResolvedValue([chunk()]);

    await roadmapCopilotRetrievalService.retrieve({ roadmapId: 'r1', userId: 'u1', query: 'auth', config: CONFIG });

    expect(mockRetrieveContext).toHaveBeenCalledWith('u1', 'auth', expect.objectContaining({ documentIdFilter: ['doc-1', 'doc-2'] }));
  });

  it('returns a bounded, safe document list on success', async () => {
    mockProjectRoadmapFindFirst.mockResolvedValue({ projectId: 'proj-1' });
    mockAuthorizeProjectAccess.mockResolvedValue('MEMBER');
    mockProjectDocumentFindMany.mockResolvedValue([{ documentId: 'doc-1' }]);
    mockRetrieveContext.mockResolvedValue([chunk()]);

    const result = await roadmapCopilotRetrievalService.retrieve({ roadmapId: 'r1', userId: 'u1', query: 'q', config: CONFIG });

    expect(result).toEqual({ used: true, documents: [{ title: 'requirements.pdf', sourceId: 'doc-1', excerpts: ['The authentication module must support OAuth2.'] }] });
  });

  describe('security — the hard post-filter (never trusting the soft documentIdFilter)', () => {
    it('strips a chunk from a document NOT in the authorized set, even though retrieveContext returned it', async () => {
      mockProjectRoadmapFindFirst.mockResolvedValue({ projectId: 'proj-1' });
      mockAuthorizeProjectAccess.mockResolvedValue('MEMBER');
      mockProjectDocumentFindMany.mockResolvedValue([{ documentId: 'doc-1' }]);
      // Simulates retrieval.service.ts's own documented never-zeroing soft-filter fallback:
      // an unauthorized document slipped into the "filtered" result.
      mockRetrieveContext.mockResolvedValue([chunk({ documentId: 'doc-1' }), chunk({ documentId: 'unauthorized-doc' })]);

      const result = await roadmapCopilotRetrievalService.retrieve({ roadmapId: 'r1', userId: 'u1', query: 'q', config: CONFIG });

      expect(result.documents).toHaveLength(1);
      expect(result.documents[0]?.sourceId).toBe('doc-1');
      expect(JSON.stringify(result)).not.toContain('unauthorized-doc');
    });

    it('returns used:false when EVERY returned chunk is outside the authorized set', async () => {
      mockProjectRoadmapFindFirst.mockResolvedValue({ projectId: 'proj-1' });
      mockAuthorizeProjectAccess.mockResolvedValue('MEMBER');
      mockProjectDocumentFindMany.mockResolvedValue([{ documentId: 'doc-1' }]);
      mockRetrieveContext.mockResolvedValue([chunk({ documentId: 'totally-different-doc' })]);

      const result = await roadmapCopilotRetrievalService.retrieve({ roadmapId: 'r1', userId: 'u1', query: 'q', config: CONFIG });

      expect(result).toEqual({ used: false, documents: [] });
    });
  });

  describe('bounding', () => {
    it('caps the number of distinct documents at maxDocuments', async () => {
      mockProjectRoadmapFindFirst.mockResolvedValue({ projectId: 'proj-1' });
      mockAuthorizeProjectAccess.mockResolvedValue('MEMBER');
      mockProjectDocumentFindMany.mockResolvedValue(Array.from({ length: 5 }, (_, i) => ({ documentId: `doc-${i}` })));
      mockRetrieveContext.mockResolvedValue(Array.from({ length: 5 }, (_, i) => chunk({ documentId: `doc-${i}`, filename: `f${i}.pdf` })));

      const result = await roadmapCopilotRetrievalService.retrieve({ roadmapId: 'r1', userId: 'u1', query: 'q', config: { ...CONFIG, maxDocuments: 2 } });

      expect(result.documents).toHaveLength(2);
    });

    it('caps excerpts per document at maxExcerpts', async () => {
      mockProjectRoadmapFindFirst.mockResolvedValue({ projectId: 'proj-1' });
      mockAuthorizeProjectAccess.mockResolvedValue('MEMBER');
      mockProjectDocumentFindMany.mockResolvedValue([{ documentId: 'doc-1' }]);
      mockRetrieveContext.mockResolvedValue(Array.from({ length: 5 }, (_, i) => chunk({ content: `excerpt ${i}` })));

      const result = await roadmapCopilotRetrievalService.retrieve({ roadmapId: 'r1', userId: 'u1', query: 'q', config: { ...CONFIG, maxExcerpts: 2 } });

      expect(result.documents[0]?.excerpts).toHaveLength(2);
    });

    it('truncates an excerpt longer than maxExcerptChars', async () => {
      mockProjectRoadmapFindFirst.mockResolvedValue({ projectId: 'proj-1' });
      mockAuthorizeProjectAccess.mockResolvedValue('MEMBER');
      mockProjectDocumentFindMany.mockResolvedValue([{ documentId: 'doc-1' }]);
      mockRetrieveContext.mockResolvedValue([chunk({ content: 'x'.repeat(1000) })]);

      const result = await roadmapCopilotRetrievalService.retrieve({ roadmapId: 'r1', userId: 'u1', query: 'q', config: { ...CONFIG, maxExcerptChars: 50 } });

      expect(result.documents[0]?.excerpts[0]?.length).toBe(50);
    });

    it('never exceeds maxContextChars in total across all documents/excerpts', async () => {
      mockProjectRoadmapFindFirst.mockResolvedValue({ projectId: 'proj-1' });
      mockAuthorizeProjectAccess.mockResolvedValue('MEMBER');
      mockProjectDocumentFindMany.mockResolvedValue([{ documentId: 'doc-1' }, { documentId: 'doc-2' }]);
      mockRetrieveContext.mockResolvedValue([
        chunk({ documentId: 'doc-1', filename: 'a.pdf', content: 'x'.repeat(300) }),
        chunk({ documentId: 'doc-2', filename: 'b.pdf', content: 'y'.repeat(300) })
      ]);

      const result = await roadmapCopilotRetrievalService.retrieve({ roadmapId: 'r1', userId: 'u1', query: 'q', config: { ...CONFIG, maxContextChars: 400 } });

      const totalChars = result.documents.reduce((sum, d) => sum + d.excerpts.reduce((s, e) => s + e.length, 0), 0);
      expect(totalChars).toBeLessThanOrEqual(400);
    });
  });

  describe('graceful degradation', () => {
    it('returns used:false when retrieveContext throws', async () => {
      mockProjectRoadmapFindFirst.mockResolvedValue({ projectId: 'proj-1' });
      mockAuthorizeProjectAccess.mockResolvedValue('MEMBER');
      mockProjectDocumentFindMany.mockResolvedValue([{ documentId: 'doc-1' }]);
      mockRetrieveContext.mockRejectedValue(new Error('Provider unavailable'));

      const result = await roadmapCopilotRetrievalService.retrieve({ roadmapId: 'r1', userId: 'u1', query: 'q', config: CONFIG });

      expect(result).toEqual({ used: false, documents: [] });
    });

    it('returns used:false rather than hanging when retrieveContext never resolves (timeout)', async () => {
      mockProjectRoadmapFindFirst.mockResolvedValue({ projectId: 'proj-1' });
      mockAuthorizeProjectAccess.mockResolvedValue('MEMBER');
      mockProjectDocumentFindMany.mockResolvedValue([{ documentId: 'doc-1' }]);
      mockRetrieveContext.mockImplementation(() => new Promise(() => {})); // never resolves

      const result = await roadmapCopilotRetrievalService.retrieve({ roadmapId: 'r1', userId: 'u1', query: 'q', config: CONFIG });

      expect(result).toEqual({ used: false, documents: [] });
    }, 15000);

    it('returns used:false when the DB lookup itself throws', async () => {
      mockProjectRoadmapFindFirst.mockRejectedValue(new Error('DB down'));

      const result = await roadmapCopilotRetrievalService.retrieve({ roadmapId: 'r1', userId: 'u1', query: 'q', config: CONFIG });

      expect(result).toEqual({ used: false, documents: [] });
    });
  });
});
