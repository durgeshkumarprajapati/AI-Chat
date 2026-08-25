import { tableExtractorService } from '@/features/rag/multimodal/table-extractor.service';
import { TableExtractionProvider } from './table-extraction-provider.interface';
import { ExtractedTableDTO } from '../multimodal.types';

const FIXED_CONFIDENCE = 0.6; // regex/delimiter detection has no real per-table confidence signal

/**
 * Adapts the existing, proven `tableExtractorService.extractTablesFromText` (regex/delimiter
 * table detection over already-extracted page text) into the new ExtractedTableDTO shape. Reuses
 * that logic rather than reimplementing it — this is the "mock/local" DOCUMENT_TABLE_PROVIDER
 * option, and (unlike OCR/vision) it operates on real input today since page text is already
 * available at ingestion time.
 */
export class HeuristicTableProvider implements TableExtractionProvider {
  public readonly name = 'heuristic';

  public async extractFromText(text: string, pageNumber: number): Promise<ExtractedTableDTO[]> {
    try {
      const parsedTables = tableExtractorService.extractTablesFromText(text, pageNumber);
      return parsedTables.map((parsed) => ({
        pageNumber: parsed.pageNumber,
        tableIndex: parsed.tableIndex,
        headers: parsed.headers,
        rows: parsed.structuredData,
        markdownRepresentation: parsed.markdownText,
        extractionConfidence: FIXED_CONFIDENCE,
        extractionProvider: this.name
      }));
    } catch (err) {
      console.warn('[HeuristicTableProvider] Extraction failed (returning no tables for this page):', err);
      return [];
    }
  }

  public supports(): boolean {
    return true;
  }
}

export const heuristicTableProvider = new HeuristicTableProvider();
