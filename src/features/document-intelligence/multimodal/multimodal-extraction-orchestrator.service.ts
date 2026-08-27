import { multimodalOrchestratorService } from '@/features/multimodal-document-intelligence/multimodal-orchestrator.service';
import type { ParsedDocumentLike } from '@/features/document-intelligence/document-intelligence.types';

export interface MultimodalExtractionInput {
  documentId: string;
  userId: string;
  parsedDocument: ParsedDocumentLike;
}

export interface MultimodalExtractionResult {
  handled: boolean;
  reason?: string;
  tablesExtracted?: number;
  imagesFound?: number;
  chartsFound?: number;
}

export class MultimodalExtractionOrchestratorService {
  public async process(input: MultimodalExtractionInput): Promise<MultimodalExtractionResult> {
    const res = await multimodalOrchestratorService.process(input);
    return {
      handled: res.handled,
      reason: res.reason,
      tablesExtracted: res.tablesExtracted,
      imagesFound: res.imagesAnalyzed,
      chartsFound: res.chartsExtracted
    };
  }
}

export const multimodalExtractionOrchestratorService = new MultimodalExtractionOrchestratorService();
