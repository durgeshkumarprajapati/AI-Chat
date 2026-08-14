import { RetrievedChunk } from '../retrieval/retrieval.types';

export interface LabeledEvidenceItem {
  sourceCategory: 'DOCUMENT' | 'SAVED_WEB' | 'LIVE_WEB';
  sourceTitle: string;
  sourceUrl?: string;
  documentId: string;
  chunkId: string;
  content: string;
  score: number;
}

export class EvidenceFusionService {
  /**
   * Merges and categorizes retrieved evidence chunks from DOCUMENT, SAVED_WEB, and LIVE_WEB sources.
   */
  public fuseEvidence(chunks: RetrievedChunk[]): LabeledEvidenceItem[] {
    const fused: LabeledEvidenceItem[] = [];

    for (const chunk of chunks) {
      let sourceCategory: 'DOCUMENT' | 'SAVED_WEB' | 'LIVE_WEB' = 'DOCUMENT';

      const isTemp =
        chunk.documentId.startsWith('discovered-web-') ||
        chunk.documentId.startsWith('temp-web-') ||
        chunk.id.startsWith('temp-web-') ||
        Boolean(chunk.metadata?.isTemporary) ||
        Boolean(chunk.metadata?.isWebDiscovery) ||
        Boolean(chunk.metadata?.isWebSearch);

      if (isTemp) {
        sourceCategory = 'LIVE_WEB';
      } else if (chunk.sourceType === 'WEB') {
        sourceCategory = 'SAVED_WEB';
      } else {
        sourceCategory = 'DOCUMENT';
      }

      const sourceTitle =
        (chunk.metadata?.title as string) ||
        chunk.filename ||
        (chunk.webUrl ? new URL(chunk.webUrl).hostname : 'Document Evidence');

      fused.push({
        sourceCategory,
        sourceTitle,
        sourceUrl: chunk.webUrl || chunk.canonicalUrl || undefined,
        documentId: chunk.documentId,
        chunkId: chunk.id,
        content: chunk.content,
        score: chunk.rerankScore ?? chunk.similarity ?? 0.5
      });
    }

    return fused;
  }

  /**
   * Builds an explicit source-labeled prompt context block for grounded LLM generation.
   */
  public buildFusedContextBlock(chunks: RetrievedChunk[]): string {
    const items = this.fuseEvidence(chunks);
    if (items.length === 0) return '';

    const blocks: string[] = [];

    for (const item of items) {
      const labelHeader =
        item.sourceCategory === 'LIVE_WEB'
          ? `[LIVE_WEB: ${item.sourceTitle}${item.sourceUrl ? ' (' + item.sourceUrl + ')' : ''}]`
          : item.sourceCategory === 'SAVED_WEB'
          ? `[SAVED_WEB: ${item.sourceTitle}${item.sourceUrl ? ' (' + item.sourceUrl + ')' : ''}]`
          : `[DOCUMENT: ${item.sourceTitle}]`;

      blocks.push(`${labelHeader}\n${item.content}`);
    }

    return blocks.join('\n\n---\n\n');
  }
}

export const evidenceFusionService = new EvidenceFusionService();
