import { prisma } from '@/lib/prisma';
import { rabbitmq, QUEUES } from '@/lib/rabbitmq';
import { sarvamClient } from '../sarvam.client';
import { sarvamConfigService } from '../sarvam.config';
import { sarvamTelemetryService } from '../telemetry/sarvam-telemetry.service';
import { DocumentTranslationJobDTO, DocumentTranslationRequestInput } from '../sarvam.types';

export interface SarvamTranslationJobPayload {
  jobType: 'SARVAM_DOCUMENT_TRANSLATION';
  translationId: string;
  documentId: string;
  userId: string;
  sourceLanguage: string;
  targetLanguage: string;
  attempt: number;
  createdAt: string;
}

export class SarvamDocumentTranslationService {
  /**
   * Creates translation jobs for a document across target languages asynchronously.
   * Prevents duplicate translation jobs for the same (documentId, sourceVersionId, targetLanguage).
   */
  public async requestDocumentTranslation(
    input: DocumentTranslationRequestInput
  ): Promise<DocumentTranslationJobDTO[]> {
    const config = await sarvamConfigService.getConfig();

    if (!config.enabled || !config.translationEnabled || !config.documentTranslationEnabled) {
      throw new Error('Sarvam Document Translation is currently disabled in Admin Configuration.');
    }

    // Fetch active document version if available
    const doc = await prisma.document.findUnique({
      where: { id: input.documentId }
    });

    if (!doc) {
      throw new Error(`Document not found: ${input.documentId}`);
    }

    const currentVersionId = doc.version ? String(doc.version) : null;
    const sourceLanguage = input.sourceLanguage || config.defaultSourceLanguage;
    const targetLangs = input.targetLanguages.slice(0, config.maxTranslationLanguages);

    const jobs: DocumentTranslationJobDTO[] = [];

    for (const targetLanguage of targetLangs) {
      // Check existing translation for this version + language idempotently
      let record = await prisma.documentTranslation.findFirst({
        where: {
          documentId: input.documentId,
          targetLanguage,
          sourceVersionId: currentVersionId,
          status: { in: ['PENDING', 'PROCESSING', 'COMPLETED'] }
        }
      });

      if (!record) {
        record = await prisma.documentTranslation.create({
          data: {
            documentId: input.documentId,
            userId: input.userId,
            sourceVersionId: currentVersionId,
            sourceLanguage,
            targetLanguage,
            status: 'PENDING'
          }
        });

        // Enqueue RabbitMQ job
        const payload: SarvamTranslationJobPayload = {
          jobType: 'SARVAM_DOCUMENT_TRANSLATION',
          translationId: record.id,
          documentId: input.documentId,
          userId: input.userId,
          sourceLanguage,
          targetLanguage,
          attempt: 1,
          createdAt: new Date().toISOString()
        };

        await rabbitmq.publishToQueue(QUEUES.SARVAM_TRANSLATION as any, payload).catch((err) => {
          console.warn(`[SarvamDocumentTranslationService] Failed to publish job to RabbitMQ queue:`, err);
        });

        sarvamTelemetryService.logEvent({
          event: 'sarvam.document_translation.started',
          documentId: input.documentId,
          tenantId: input.userId,
          language: `${sourceLanguage}->${targetLanguage}`
        });
      }

      jobs.push(record as any);
    }

    return jobs;
  }

  public async getTranslationsForDocument(documentId: string): Promise<DocumentTranslationJobDTO[]> {
    const translations = await prisma.documentTranslation.findMany({
      where: { documentId },
      orderBy: { createdAt: 'desc' }
    });
    return translations as any;
  }

  public async getTranslationById(translationId: string): Promise<DocumentTranslationJobDTO | null> {
    const translation = await prisma.documentTranslation.findUnique({
      where: { id: translationId }
    });
    return translation as any;
  }

  public async markStaleIfVersionChanged(documentId: string, activeVersionId: string): Promise<number> {
    const result = await prisma.documentTranslation.updateMany({
      where: {
        documentId,
        sourceVersionId: { not: activeVersionId },
        status: 'COMPLETED'
      },
      data: { status: 'STALE' }
    });
    return result.count;
  }

  public async processJobInWorker(jobPayload: SarvamTranslationJobPayload): Promise<{ success: boolean; error?: string }> {
    const startTime = Date.now();
    const config = await sarvamConfigService.getConfig();

    const record = await prisma.documentTranslation.findUnique({
      where: { id: jobPayload.translationId }
    });

    if (!record || record.status === 'COMPLETED') {
      return { success: true };
    }

    await prisma.documentTranslation.update({
      where: { id: jobPayload.translationId },
      data: { status: 'PROCESSING' }
    });

    try {
      // 1. Fetch document text
      const chunks = await prisma.documentChunk.findMany({
        where: { documentId: jobPayload.documentId },
        orderBy: { chunkIndex: 'asc' },
        take: 30
      });

      const fullText = chunks.map((c) => c.content).join('\n\n');
      if (!fullText) {
        throw new Error('Document content is empty');
      }

      // 2. Trigger Sarvam document translation job
      const startResult = await sarvamClient.startDocumentTranslation(
        jobPayload.documentId,
        fullText.slice(0, 5000),
        jobPayload.sourceLanguage,
        jobPayload.targetLanguage,
        config.timeoutMs
      );

      const jobId = startResult.job_id || `sarvam-job-${Date.now()}`;

      // If instant translation returned
      let translatedText = startResult.translated_text;

      if (!translatedText) {
        // Poll for asynchronous job completion
        let status = 'PROCESSING';
        let attempts = 0;
        const maxPollAttempts = 10;

        while (status === 'PROCESSING' || status === 'PENDING') {
          attempts++;
          if (attempts > maxPollAttempts) break;
          await new Promise((res) => setTimeout(res, config.pollIntervalMs));

          const pollRes = await sarvamClient.getDocTranslationJobStatus(jobId, 10000).catch(() => null);
          if (pollRes) {
            status = pollRes.status;
            if (pollRes.translated_text) {
              translatedText = pollRes.translated_text;
              break;
            }
          }
        }
      }

      // Fallback text translation if asynchronous job returns simple output
      if (!translatedText) {
        const textResult = await sarvamClient.translateText(
          {
            input: fullText.slice(0, 3000),
            source_language_code: jobPayload.sourceLanguage,
            target_language_code: jobPayload.targetLanguage
          },
          config.timeoutMs
        );
        translatedText = textResult.translated_text;
      }

      const durationMs = Date.now() - startTime;

      await prisma.documentTranslation.update({
        where: { id: jobPayload.translationId },
        data: {
          status: 'COMPLETED',
          jobId,
          translatedText,
          durationMs,
          completedAt: new Date()
        }
      });

      sarvamTelemetryService.logEvent({
        event: 'sarvam.document_translation.completed',
        documentId: jobPayload.documentId,
        tenantId: jobPayload.userId,
        durationMs,
        language: `${jobPayload.sourceLanguage}->${jobPayload.targetLanguage}`
      });

      return { success: true };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const durationMs = Date.now() - startTime;

      await prisma.documentTranslation.update({
        where: { id: jobPayload.translationId },
        data: {
          status: 'FAILED',
          errorMessage: errMsg,
          durationMs
        }
      }).catch(() => {});

      sarvamTelemetryService.logEvent({
        event: 'sarvam.document_translation.failed',
        documentId: jobPayload.documentId,
        tenantId: jobPayload.userId,
        error: errMsg,
        durationMs
      });

      return { success: false, error: errMsg };
    }
  }
}

export const sarvamDocumentTranslationService = new SarvamDocumentTranslationService();
