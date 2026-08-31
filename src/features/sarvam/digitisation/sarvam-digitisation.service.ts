import { prisma } from '@/lib/prisma';
import { sarvamClient } from '../sarvam.client';
import { sarvamConfigService } from '../sarvam.config';
import { sarvamTelemetryService } from '../telemetry/sarvam-telemetry.service';
import { DigitisationResultDTO, NormalizedDigitisationDTO, SarvamPageBlock } from '../sarvam.types';

export class SarvamDigitisationService {
  public async digitiseDocument(
    documentId: string,
    userId: string,
    documentContent?: string
  ): Promise<DigitisationResultDTO> {
    const startTime = Date.now();
    const config = await sarvamConfigService.getConfig();

    sarvamTelemetryService.logEvent({
      event: 'sarvam.digitisation.started',
      documentId,
      tenantId: userId
    });

    if (!config.enabled || !config.digitisationEnabled || !sarvamClient.isConfigured()) {
      sarvamTelemetryService.logEvent({
        event: 'sarvam.digitisation.failed',
        documentId,
        tenantId: userId,
        error: 'Sarvam digitisation is disabled or API key missing'
      });
      return {
        documentId,
        status: 'FAILED',
        pageCount: 0,
        tableCount: 0,
        blockCount: 0,
        pages: [],
        errorMessage: 'Sarvam digitisation is disabled or API key missing',
        durationMs: Date.now() - startTime
      };
    }

    try {
      // 1. Fetch document content if not provided
      let textToDigitise = documentContent;
      if (!textToDigitise) {
        const chunks = await prisma.documentChunk.findMany({
          where: { documentId },
          orderBy: { chunkIndex: 'asc' },
          take: 50
        });
        textToDigitise = chunks.map((c) => c.content).join('\n\n');
      }

      if (!textToDigitise || textToDigitise.trim().length === 0) {
        throw new Error('Document content is empty.');
      }

      // 2. Call Sarvam digitisation API or process layout
      const res = await sarvamClient.startDigitisation(textToDigitise, config.timeoutMs);

      // 3. Normalize blocks and pages
      const normalizedPages: NormalizedDigitisationDTO[] = [];
      let totalBlocks = 0;
      let totalTables = 0;

      if (res.result?.pages && res.result.pages.length > 0) {
        for (const page of res.result.pages) {
          const blocks: SarvamPageBlock[] = [];
          let pTables = 0;

          if (page.blocks) {
            let order = 0;
            for (const b of page.blocks) {
              const bType = (b.type || 'PARAGRAPH').toUpperCase() as any;
              blocks.push({
                id: `block-${page.page_number}-${order}`,
                type: ['HEADING', 'PARAGRAPH', 'TABLE', 'IMAGE', 'HEADER', 'FOOTER', 'LIST_ITEM'].includes(bType)
                  ? bType
                  : 'PARAGRAPH',
                content: b.content || '',
                pageNumber: page.page_number,
                order: order++,
                confidence: b.confidence ?? 0.9
              });
            }
          }

          if (page.tables) {
            pTables = page.tables.length;
            totalTables += pTables;
          }

          totalBlocks += blocks.length;
          normalizedPages.push({
            pageNumber: page.page_number,
            blocks,
            tablesExtracted: pTables,
            imagesExtracted: 0
          });
        }
      } else {
        // Fallback layout block construction if text-only returned
        const lines = textToDigitise.split('\n').filter((l) => l.trim().length > 0);
        const blocks: SarvamPageBlock[] = lines.map((line, idx) => ({
          id: `block-1-${idx}`,
          type: line.length < 60 && line.endsWith(':') ? 'HEADING' : 'PARAGRAPH',
          content: line,
          pageNumber: 1,
          order: idx,
          confidence: 0.95
        }));

        totalBlocks = blocks.length;
        normalizedPages.push({
          pageNumber: 1,
          blocks,
          tablesExtracted: 0,
          imagesExtracted: 0
        });
      }

      const durationMs = Date.now() - startTime;

      // 4. Save run to database
      await prisma.sarvamDigitisationRun.create({
        data: {
          documentId,
          userId,
          status: 'COMPLETED',
          pageCount: normalizedPages.length,
          tableCount: totalTables,
          blockCount: totalBlocks,
          layoutOutput: JSON.parse(JSON.stringify(normalizedPages)),
          durationMs,
          completedAt: new Date()
        }
      });

      sarvamTelemetryService.logEvent({
        event: 'sarvam.digitisation.completed',
        documentId,
        tenantId: userId,
        durationMs,
        pageCount: normalizedPages.length
      });

      return {
        documentId,
        status: 'COMPLETED',
        pageCount: normalizedPages.length,
        tableCount: totalTables,
        blockCount: totalBlocks,
        pages: normalizedPages,
        durationMs
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const durationMs = Date.now() - startTime;

      await prisma.sarvamDigitisationRun.create({
        data: {
          documentId,
          userId,
          status: 'FAILED',
          errorMessage: errMsg,
          durationMs
        }
      }).catch(() => {});

      sarvamTelemetryService.logEvent({
        event: 'sarvam.digitisation.failed',
        documentId,
        tenantId: userId,
        error: errMsg,
        durationMs
      });

      return {
        documentId,
        status: 'FAILED',
        pageCount: 0,
        tableCount: 0,
        blockCount: 0,
        pages: [],
        errorMessage: errMsg,
        durationMs
      };
    }
  }
}

export const sarvamDigitisationService = new SarvamDigitisationService();
