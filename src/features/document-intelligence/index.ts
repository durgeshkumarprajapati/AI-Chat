// Public surface of the Document Intelligence module. The worker and any API route must import
// only from here — never reach into layout/chunking/metadata-extraction/classification internals
// directly (mirrors the Knowledge Graph facade-only boundary rule).
export { documentIntelligenceOrchestratorService } from './document-intelligence-orchestrator.service';
export { documentIntelligenceRepository } from './document-intelligence.repository';
export type {
  DocumentIntelligenceInput,
  DocumentIntelligenceRunResult,
  DocumentTypeValue,
  ExtractedDocumentMetadataDTO,
  ClassificationResultDTO
} from './document-intelligence.types';
