import { sarvamClient } from './sarvam.client';
import { sarvamConfigService } from './sarvam.config';

export interface SarvamProviderStatus {
  isConfigured: boolean;
  enabled: boolean;
  digitisationEnabled: boolean;
  translationEnabled: boolean;
  multilingualRagEnabled: boolean;
  available: boolean;
}

export class SarvamProviderService {
  public async getStatus(): Promise<SarvamProviderStatus> {
    const isConfigured = sarvamClient.isConfigured();
    const config = await sarvamConfigService.getConfig();

    const available = isConfigured && config.enabled;

    return {
      isConfigured,
      enabled: config.enabled,
      digitisationEnabled: config.digitisationEnabled,
      translationEnabled: config.translationEnabled,
      multilingualRagEnabled: config.multilingualRagEnabled,
      available
    };
  }
}

export const sarvamProviderService = new SarvamProviderService();
