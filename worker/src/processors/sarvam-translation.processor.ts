import { sarvamDocumentTranslationService, SarvamTranslationJobPayload } from '@/features/sarvam/translation/sarvam-document-translation.service';

export interface SarvamWorkerResult {
  status: 'SUCCESS' | 'FAILED' | 'RETRY';
  errorMessage?: string;
}

export class SarvamTranslationProcessor {
  public async process(payload: SarvamTranslationJobPayload): Promise<SarvamWorkerResult> {
    console.log(`[SarvamTranslationProcessor] Processing translation ${payload.translationId} for doc ${payload.documentId} (${payload.sourceLanguage}->${payload.targetLanguage})...`);

    try {
      const res = await sarvamDocumentTranslationService.processJobInWorker(payload);
      if (res.success) {
        return { status: 'SUCCESS' };
      }
      return { status: 'FAILED', errorMessage: res.error };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[SarvamTranslationProcessor] Error processing job:`, err);
      return { status: 'FAILED', errorMessage: errMsg };
    }
  }
}

export const sarvamTranslationProcessor = new SarvamTranslationProcessor();
