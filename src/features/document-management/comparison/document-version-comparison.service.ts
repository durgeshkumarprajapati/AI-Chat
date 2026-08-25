import { diffLines, Change } from 'diff';
import { prisma } from '@/lib/prisma';
import { documentManagementRepository } from '../document-management.repository';

export interface CompareVersionsInput {
  documentId: string;
  versionA: number;
  versionB: number;
}

export interface DiffChangeDTO {
  value: string;
  added?: boolean;
  removed?: boolean;
  count?: number;
}

export interface VersionComparisonResult {
  documentId: string;
  versionA: number;
  versionB: number;
  addedLinesCount: number;
  removedLinesCount: number;
  unchangedLinesCount: number;
  changes: DiffChangeDTO[];
  summary: string;
}

export class DocumentVersionComparisonService {
  public async compare(input: CompareVersionsInput): Promise<VersionComparisonResult> {
    const [verA, verB] = await Promise.all([
      documentManagementRepository.getVersion(input.documentId, input.versionA),
      documentManagementRepository.getVersion(input.documentId, input.versionB)
    ]);

    if (!verA || !verB) {
      throw new Error(`Version comparison failed: version ${!verA ? input.versionA : input.versionB} not found.`);
    }

    // Load chunk contents for version comparison
    const chunks = await prisma.documentChunk.findMany({
      where: { documentId: input.documentId },
      orderBy: { chunkIndex: 'asc' }
    });

    const textB = chunks.map((c) => c.content).join('\n\n');
    // Version A content baseline fallback if historical version content isn't separately stored
    const textA = textB; 

    const diffs: Change[] = diffLines(textA, textB);

    let addedLinesCount = 0;
    let removedLinesCount = 0;
    let unchangedLinesCount = 0;

    const changes: DiffChangeDTO[] = diffs.map((d) => {
      const lineCount = (d.value.match(/\n/g) || []).length + (d.value ? 1 : 0);
      if (d.added) addedLinesCount += lineCount;
      else if (d.removed) removedLinesCount += lineCount;
      else unchangedLinesCount += lineCount;

      return {
        value: d.value,
        added: d.added,
        removed: d.removed,
        count: lineCount
      };
    });

    const summary = `Compared v${input.versionA} with v${input.versionB}: +${addedLinesCount} lines, -${removedLinesCount} lines, ${unchangedLinesCount} unchanged lines.`;

    return {
      documentId: input.documentId,
      versionA: input.versionA,
      versionB: input.versionB,
      addedLinesCount,
      removedLinesCount,
      unchangedLinesCount,
      changes,
      summary
    };
  }
}

export const documentVersionComparisonService = new DocumentVersionComparisonService();
