import { configService } from '@/features/config';
import { sarvamClient } from './sarvam.client';

export interface SarvamRuntimeConfig {
  enabled: boolean;
  digitisationEnabled: boolean;
  translationEnabled: boolean;
  textTranslationEnabled: boolean;
  documentTranslationEnabled: boolean;
  multilingualRagEnabled: boolean;
  timeoutMs: number;
  maxDocumentSizeMb: number;
  maxTranslationLanguages: number;
  maxConcurrentJobs: number;
  retryLimit: number;
  pollIntervalMs: number;
  defaultSourceLanguage: string;
  defaultTranslationLanguage: string;
  fallbackEnabled: boolean;
}

export class SarvamConfigService {
  public async getConfig(): Promise<SarvamRuntimeConfig> {
    const isClientConfigured = sarvamClient.isConfigured();

    const [
      enabledRaw,
      digitisationEnabledRaw,
      translationEnabledRaw,
      textTranslationEnabledRaw,
      documentTranslationEnabledRaw,
      multilingualRagEnabledRaw,
      timeoutMs,
      maxDocumentSizeMb,
      maxTranslationLanguages,
      maxConcurrentJobs,
      retryLimit,
      pollIntervalMs,
      defaultSourceLanguage,
      defaultTranslationLanguage,
      fallbackEnabled
    ] = await Promise.all([
      configService.getBoolean('SARVAM_ENABLED').catch(() => isClientConfigured),
      configService.getBoolean('SARVAM_DIGITISATION_ENABLED').catch(() => isClientConfigured),
      configService.getBoolean('SARVAM_TRANSLATION_ENABLED').catch(() => isClientConfigured),
      configService.getBoolean('SARVAM_TEXT_TRANSLATION_ENABLED').catch(() => isClientConfigured),
      configService.getBoolean('SARVAM_DOCUMENT_TRANSLATION_ENABLED').catch(() => isClientConfigured),
      configService.getBoolean('SARVAM_MULTILINGUAL_RAG_ENABLED').catch(() => isClientConfigured),
      configService.getNumber('SARVAM_TIMEOUT_MS').catch(() => 30000),
      configService.getNumber('SARVAM_MAX_DOCUMENT_SIZE_MB').catch(() => 25),
      configService.getNumber('SARVAM_MAX_TRANSLATION_LANGUAGES').catch(() => 10),
      configService.getNumber('SARVAM_MAX_CONCURRENT_JOBS').catch(() => 3),
      configService.getNumber('SARVAM_RETRY_LIMIT').catch(() => 3),
      configService.getNumber('SARVAM_POLL_INTERVAL_MS').catch(() => 2000),
      configService.getString('SARVAM_DEFAULT_SOURCE_LANGUAGE').catch(() => 'hi-IN'),
      configService.getString('SARVAM_DEFAULT_TRANSLATION_LANGUAGE').catch(() => 'en-IN'),
      configService.getBoolean('SARVAM_FALLBACK_ENABLED').catch(() => true)
    ]);

    const enabled = typeof enabledRaw === 'boolean' ? enabledRaw : isClientConfigured;
    const digitisationEnabled = typeof digitisationEnabledRaw === 'boolean' ? digitisationEnabledRaw : isClientConfigured;
    const translationEnabled = typeof translationEnabledRaw === 'boolean' ? translationEnabledRaw : isClientConfigured;
    const textTranslationEnabled = typeof textTranslationEnabledRaw === 'boolean' ? textTranslationEnabledRaw : isClientConfigured;
    const documentTranslationEnabled = typeof documentTranslationEnabledRaw === 'boolean' ? documentTranslationEnabledRaw : isClientConfigured;
    const multilingualRagEnabled = typeof multilingualRagEnabledRaw === 'boolean' ? multilingualRagEnabledRaw : isClientConfigured;

    return {
      enabled,
      digitisationEnabled,
      translationEnabled,
      textTranslationEnabled,
      documentTranslationEnabled,
      multilingualRagEnabled,
      timeoutMs,
      maxDocumentSizeMb,
      maxTranslationLanguages,
      maxConcurrentJobs,
      retryLimit,
      pollIntervalMs,
      defaultSourceLanguage,
      defaultTranslationLanguage,
      fallbackEnabled
    };
  }
}

export const sarvamConfigService = new SarvamConfigService();
