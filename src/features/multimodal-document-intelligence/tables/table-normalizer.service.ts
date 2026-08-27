import { ExtractedTableDTO } from '../multimodal.types';

export class TableNormalizerService {
  /**
   * Normalizes an extracted table into search-optimized text, markdown, and structured JSON representations.
   */
  public normalize(table: ExtractedTableDTO): {
    markdown: string;
    normalizedText: string;
    structuredJson: Record<string, unknown>;
  } {
    const headers = table.headers || [];
    const rows = table.rows || [];

    // 1. Markdown representation
    let markdown = '';
    if (table.title) {
      markdown += `### ${table.title}\n\n`;
    }
    if (headers.length > 0) {
      markdown += `| ${headers.join(' | ')} |\n`;
      markdown += `| ${headers.map(() => '---').join(' | ')} |\n`;
    }
    for (const row of rows) {
      markdown += `| ${row.join(' | ')} |\n`;
    }

    // 2. Normalized Text representation (e.g. "Product: Laptop | Quantity: 10 | Price: 1000")
    const textLines: string[] = [];
    if (table.title) textLines.push(`Table: ${table.title}`);

    for (let rIndex = 0; rIndex < rows.length; rIndex++) {
      const row = rows[rIndex] || [];
      const pairs: string[] = [];
      for (let cIndex = 0; cIndex < row.length; cIndex++) {
        const headerName = headers[cIndex] || `Column ${cIndex + 1}`;
        pairs.push(`${headerName}: ${row[cIndex]}`);
      }
      textLines.push(`Row ${rIndex + 1}: ${pairs.join(' | ')}`);
    }
    const normalizedText = textLines.join('\n');

    // 3. Structured JSON representation
    const jsonRows = rows.map((row) => {
      const obj: Record<string, string> = {};
      row.forEach((cell, idx) => {
        const key = headers[idx] || `col_${idx + 1}`;
        obj[key] = cell;
      });
      return obj;
    });

    const structuredJson = {
      title: table.title || `Table on Page ${table.pageNumber}`,
      headers,
      rowCount: rows.length,
      columnCount: headers.length,
      data: jsonRows
    };

    return {
      markdown: markdown.trim(),
      normalizedText: normalizedText.trim(),
      structuredJson
    };
  }
}

export const tableNormalizerService = new TableNormalizerService();
