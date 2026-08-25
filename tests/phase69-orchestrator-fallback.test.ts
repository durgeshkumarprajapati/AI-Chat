jest.mock('@/features/document-intelligence/document-intelligence.config');
jest.mock('@/features/document-intelligence/document-intelligence.repository', () => ({
  documentIntelligenceRepository: {
    upsertRun: jest.fn().mockResolvedValue({}),
    markStage: jest.fn().mockResolvedValue(undefined),
    markCompleted: jest.fn().mockResolvedValue(undefined),
    markSkipped: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined)
  }
}));
jest.mock('@/features/document-intelligence/metadata-extraction/metadata-extractor.service', () => ({
  metadataExtractorService: { extractMetadata: jest.fn().mockResolvedValue({ title: 'Mock Title' }) }
}));
jest.mock('@/features/document-intelligence/classification/classifier.service', () => ({
  classifierService: { classify: jest.fn().mockResolvedValue({ documentType: 'REPORT', confidence: 0.9 }) }
}));

import { getDocumentIntelligenceConfig } from '@/features/document-intelligence/document-intelligence.config';
import { documentIntelligenceRepository } from '@/features/document-intelligence/document-intelligence.repository';
import { metadataExtractorService } from '@/features/document-intelligence/metadata-extraction/metadata-extractor.service';
import { documentIntelligenceOrchestratorService } from '@/features/document-intelligence/document-intelligence-orchestrator.service';
import { ParsedDocumentLike } from '@/features/document-intelligence/document-intelligence.types';

const baseConfig = {
  enabled: true,
  layoutAnalysisEnabled: true,
  semanticChunkingEnabled: true,
  metadataExtractionEnabled: true,
  classificationEnabled: true,
  legacyFallbackEnabled: true,
  timeoutMs: 5000,
  maxProcessingRetries: 3,
  semanticChunkMaxTokens: 200,
  semanticChunkOverlapTokens: 20
};

const sampleParsedDocument: ParsedDocumentLike = {
  pageCount: 1,
  pages: [{ pageNumber: 1, text: 'This is a simple test document with a few sentences. It has more than one sentence to chunk.' }]
};

describe('DocumentIntelligenceOrchestratorService — Phase 69A fallback behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getDocumentIntelligenceConfig as jest.Mock).mockReturnValue(baseConfig);
    (metadataExtractorService.extractMetadata as jest.Mock).mockResolvedValue({ title: 'Mock Title' });
  });

  it('returns handled:false immediately with zero side effects when the master flag is disabled', async () => {
    (getDocumentIntelligenceConfig as jest.Mock).mockReturnValue({ ...baseConfig, enabled: false });

    const result = await documentIntelligenceOrchestratorService.process({
      documentId: 'doc-1',
      userId: 'user-1',
      parsedDocument: sampleParsedDocument
    });

    expect(result).toEqual({ handled: false, reason: 'DISABLED' });
    expect(documentIntelligenceRepository.upsertRun).not.toHaveBeenCalled();
    expect(metadataExtractorService.extractMetadata).not.toHaveBeenCalled();
  });

  it('falls back gracefully (handled:false) when semantic chunking is disabled', async () => {
    (getDocumentIntelligenceConfig as jest.Mock).mockReturnValue({ ...baseConfig, semanticChunkingEnabled: false });

    const result = await documentIntelligenceOrchestratorService.process({
      documentId: 'doc-2',
      userId: 'user-1',
      parsedDocument: sampleParsedDocument
    });

    expect(result.handled).toBe(false);
    expect(documentIntelligenceRepository.markSkipped).toHaveBeenCalledWith('doc-2', 'SEMANTIC_CHUNKING_DISABLED');
  });

  it('produces chunks and completes successfully when all stages are enabled', async () => {
    const result = await documentIntelligenceOrchestratorService.process({
      documentId: 'doc-3',
      userId: 'user-1',
      parsedDocument: sampleParsedDocument
    });

    expect(result.handled).toBe(true);
    expect(result.chunks && result.chunks.length).toBeGreaterThan(0);
    expect(result.documentType).toBe('REPORT');
    expect(documentIntelligenceRepository.markCompleted).toHaveBeenCalled();
  });

  it('does not block the pipeline result when metadata extraction throws internally', async () => {
    (metadataExtractorService.extractMetadata as jest.Mock).mockRejectedValue(new Error('LLM provider unavailable'));

    const result = await documentIntelligenceOrchestratorService.process({
      documentId: 'doc-4',
      userId: 'user-1',
      parsedDocument: sampleParsedDocument
    });

    expect(result.handled).toBe(true);
    expect(result.chunks && result.chunks.length).toBeGreaterThan(0);
    expect(result.extractedMetadata).toBeUndefined();
  });

  it('returns handled:false when the pipeline exceeds the configured timeout', async () => {
    (getDocumentIntelligenceConfig as jest.Mock).mockReturnValue({ ...baseConfig, timeoutMs: 10 });
    (metadataExtractorService.extractMetadata as jest.Mock).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({}), 500))
    );

    const result = await documentIntelligenceOrchestratorService.process({
      documentId: 'doc-5',
      userId: 'user-1',
      parsedDocument: sampleParsedDocument
    });

    expect(result.handled).toBe(false);
    expect(result.reason).toBe('ERROR');
  });

  it('never throws even if the repository itself fails unexpectedly', async () => {
    (documentIntelligenceRepository.upsertRun as jest.Mock).mockRejectedValue(new Error('DB unavailable'));

    await expect(
      documentIntelligenceOrchestratorService.process({
        documentId: 'doc-6',
        userId: 'user-1',
        parsedDocument: sampleParsedDocument
      })
    ).resolves.toEqual({ handled: false, reason: 'ERROR' });
  });
});
