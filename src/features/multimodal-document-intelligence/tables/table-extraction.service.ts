import { ExtractedTableDTO } from '../multimodal.types';
import { tableNormalizerService } from './table-normalizer.service';

export class TableExtractionService {
  /**
   * Detects and extracts tabular structures from document page text.
   */
  public extractFromText(pageText: string, pageNumber: number): ExtractedTableDTO[] {
    const lines = pageText.split('\n').map((l) => l.trim()).filter(Boolean);
    const tables: ExtractedTableDTO[] = [];
    let tableIndex = 0;

    let currentHeaders: string[] = [];
    let currentRows: string[][] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || '';

      // Check for Markdown table row syntax (| header1 | header2 |)
      if (line.includes('|')) {
        const cells = line
          .split('|')
          .map((c) => c.trim())
          .filter((c, idx, arr) => !(idx === 0 && c === '') && !(idx === arr.length - 1 && c === ''));

        // Skip divider rows (|---|---|)
        if (cells.every((c) => /^[-:\s]+$/.test(c))) {
          continue;
        }

        if (currentHeaders.length === 0) {
          currentHeaders = cells;
        } else {
          currentRows.push(cells);
        }
      } else {
        // End of tabular block
        if (currentHeaders.length > 0 && currentRows.length > 0) {
          const rawTable: ExtractedTableDTO = {
            pageNumber,
            tableIndex: tableIndex++,
            title: `Table ${tableIndex} on Page ${pageNumber}`,
            headers: currentHeaders,
            rows: currentRows,
            markdownRepresentation: '',
            extractionConfidence: 0.95,
            extractionProvider: 'table-extraction-service'
          };

          const norm = tableNormalizerService.normalize(rawTable);
          rawTable.markdownRepresentation = norm.markdown;
          rawTable.structuredJson = norm.structuredJson;

          tables.push(rawTable);
          currentHeaders = [];
          currentRows = [];
        }
      }
    }

    if (currentHeaders.length > 0 && currentRows.length > 0) {
      const rawTable: ExtractedTableDTO = {
        pageNumber,
        tableIndex: tableIndex++,
        title: `Table ${tableIndex} on Page ${pageNumber}`,
        headers: currentHeaders,
        rows: currentRows,
        markdownRepresentation: '',
        extractionConfidence: 0.95,
        extractionProvider: 'table-extraction-service'
      };

      const norm = tableNormalizerService.normalize(rawTable);
      rawTable.markdownRepresentation = norm.markdown;
      rawTable.structuredJson = norm.structuredJson;

      tables.push(rawTable);
    }

    return tables;
  }
}

export const tableExtractionService = new TableExtractionService();
