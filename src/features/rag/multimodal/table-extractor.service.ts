export interface ParsedTable {
  pageNumber: number;
  tableIndex: number;
  markdownText: string;
  structuredData: Array<Record<string, string>>;
  headers: string[];
  rowCount: number;
  columnCount: number;
}

export class TableExtractorService {
  /**
   * Detects and extracts tabular structures from text or PDF page content.
   */
  public extractTablesFromText(text: string, pageNumber = 1): ParsedTable[] {
    if (!text || !text.trim()) return [];

    const tables: ParsedTable[] = [];
    const lines = text.split('\n');

    let currentTableLines: string[] = [];
    let tableIndex = 0;

    for (const line of lines) {
      const isTableLine =
        (line.includes('|') && line.split('|').length >= 3) ||
        (line.includes('\t') && line.split('\t').length >= 3) ||
        /^\s*(\w+[\s\t]{2,}){2,}/.test(line);

      if (isTableLine) {
        currentTableLines.push(line);
      } else {
        if (currentTableLines.length >= 2) {
          const parsed = this.parseTableLines(currentTableLines, pageNumber, tableIndex);
          if (parsed) {
            tables.push(parsed);
            tableIndex++;
          }
        }
        currentTableLines = [];
      }
    }

    if (currentTableLines.length >= 2) {
      const parsed = this.parseTableLines(currentTableLines, pageNumber, tableIndex);
      if (parsed) {
        tables.push(parsed);
      }
    }

    return tables;
  }

  private parseTableLines(lines: string[], pageNumber: number, tableIndex: number): ParsedTable | null {
    const rows = lines.map((l) =>
      l
        .split(/[|\t]/)
        .map((cell) => cell.trim())
        .filter((cell) => cell !== '' && cell !== '---' && !/^-+$/.test(cell))
    ).filter((r) => r.length > 0);

    if (rows.length < 2) return null;

    const headers = rows[0] || [];
    const dataRows = rows.slice(1);

    const structuredData: Array<Record<string, string>> = [];

    for (const row of dataRows) {
      const record: Record<string, string> = {};
      headers.forEach((h, idx) => {
        record[h || `col_${idx + 1}`] = row[idx] || '';
      });
      structuredData.push(record);
    }

    const markdownText = [
      `| ${headers.join(' | ')} |`,
      `| ${headers.map(() => '---').join(' | ')} |`,
      ...dataRows.map((r) => `| ${r.join(' | ')} |`)
    ].join('\n');

    return {
      pageNumber,
      tableIndex,
      markdownText,
      structuredData,
      headers,
      rowCount: dataRows.length,
      columnCount: headers.length
    };
  }
}

export const tableExtractorService = new TableExtractorService();
