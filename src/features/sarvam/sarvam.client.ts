import { env } from '@/config/env';
import { classifySarvamError } from './sarvam-error.classifier';

export interface SarvamTranslateTextPayload {
  input: string;
  source_language_code?: string;
  target_language_code: string;
  speaker_gender?: 'Male' | 'Female';
  mode?: 'formal' | 'informal';
  model?: 'mayura:v1';
}

export interface SarvamTranslateTextResponse {
  translated_text: string;
  source_language_code: string;
}

export interface SarvamDetectLanguageResponse {
  language_code: string;
  confidence: number;
}

export interface SarvamDigitisationJobResponse {
  job_id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  page_count?: number;
  result?: {
    pages: Array<{
      page_number: number;
      text?: string;
      blocks?: Array<{
        type: string;
        content: string;
        bbox?: number[];
        confidence?: number;
      }>;
      tables?: Array<{
        rows: string[][];
        page_number: number;
      }>;
    }>;
  };
  error?: string;
}

export interface SarvamDocTranslationJobResponse {
  job_id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  target_language_code?: string;
  translated_text?: string;
  download_url?: string;
  error?: string;
}

export class SarvamClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'https://api.sarvam.ai') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private getApiKey(): string | undefined {
    return env.server?.SARVAM_API_KEY || process.env.SARVAM_API_KEY;
  }

  public isConfigured(): boolean {
    const key = this.getApiKey();
    return !!key && key.trim().length > 0;
  }

  private getHeaders(): Record<string, string> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('Sarvam API key is not configured (SARVAM_API_KEY environment variable missing).');
    }
    return {
      'Content-Type': 'application/json',
      'api-subscription-key': apiKey
    };
  }

  public async translateText(
    payload: SarvamTranslateTextPayload,
    timeoutMs: number = 30000
  ): Promise<SarvamTranslateTextResponse> {
    if (!this.isConfigured()) {
      throw new Error('Sarvam API is not configured.');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/translate`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          input: payload.input,
          source_language_code: payload.source_language_code || 'auto',
          target_language_code: payload.target_language_code,
          speaker_gender: payload.speaker_gender || 'Male',
          mode: payload.mode || 'formal',
          model: payload.model || 'mayura:v1'
        }),
        signal: controller.signal
      });

      clearTimeout(timer);

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Sarvam translate HTTP ${res.status}: ${errText}`);
      }

      const data = (await res.json()) as SarvamTranslateTextResponse;
      return data;
    } catch (err) {
      clearTimeout(timer);
      const classified = classifySarvamError(err);
      throw classified.originalError instanceof Error ? classified.originalError : new Error(classified.message);
    }
  }

  public async detectLanguage(text: string, timeoutMs: number = 10000): Promise<SarvamDetectLanguageResponse> {
    if (!this.isConfigured()) {
      return { language_code: 'en-IN', confidence: 1.0 };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/text-intent/detect-language`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ input: text.slice(0, 1000) }),
        signal: controller.signal
      });

      clearTimeout(timer);

      if (!res.ok) {
        return { language_code: 'en-IN', confidence: 0.5 };
      }

      const data = (await res.json()) as SarvamDetectLanguageResponse;
      return data;
    } catch {
      clearTimeout(timer);
      return { language_code: 'en-IN', confidence: 0.5 };
    }
  }

  public async startDigitisation(
    documentTextOrUrl: string,
    timeoutMs: number = 30000
  ): Promise<SarvamDigitisationJobResponse> {
    if (!this.isConfigured()) {
      throw new Error('Sarvam API is not configured.');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/doc-ai/v1/digitization`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ input: documentTextOrUrl }),
        signal: controller.signal
      });

      clearTimeout(timer);

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Sarvam digitisation HTTP ${res.status}: ${errText}`);
      }

      return (await res.json()) as SarvamDigitisationJobResponse;
    } catch (err) {
      clearTimeout(timer);
      const classified = classifySarvamError(err);
      throw classified.originalError instanceof Error ? classified.originalError : new Error(classified.message);
    }
  }

  public async startDocumentTranslation(
    documentId: string,
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
    timeoutMs: number = 30000
  ): Promise<SarvamDocTranslationJobResponse> {
    if (!this.isConfigured()) {
      throw new Error('Sarvam API is not configured.');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/doc-ai/v1/translation`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          document_id: documentId,
          text,
          source_language_code: sourceLanguage,
          target_language_code: targetLanguage
        }),
        signal: controller.signal
      });

      clearTimeout(timer);

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Sarvam doc translation HTTP ${res.status}: ${errText}`);
      }

      return (await res.json()) as SarvamDocTranslationJobResponse;
    } catch (err) {
      clearTimeout(timer);
      const classified = classifySarvamError(err);
      throw classified.originalError instanceof Error ? classified.originalError : new Error(classified.message);
    }
  }

  public async getDocTranslationJobStatus(
    jobId: string,
    timeoutMs: number = 10000
  ): Promise<SarvamDocTranslationJobResponse> {
    if (!this.isConfigured()) {
      throw new Error('Sarvam API is not configured.');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/doc-ai/v1/translation/job/${encodeURIComponent(jobId)}`, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: controller.signal
      });

      clearTimeout(timer);

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Sarvam doc translation status HTTP ${res.status}: ${errText}`);
      }

      return (await res.json()) as SarvamDocTranslationJobResponse;
    } catch (err) {
      clearTimeout(timer);
      const classified = classifySarvamError(err);
      throw classified.originalError instanceof Error ? classified.originalError : new Error(classified.message);
    }
  }
}

export const sarvamClient = new SarvamClient();
