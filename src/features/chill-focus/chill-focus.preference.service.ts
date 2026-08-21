import { chillFocusRepository } from './chill-focus.repository';
import { ChillFocusPreferenceDTO, UpdateChillFocusPreferenceInput } from './chill-focus.types';

export class ChillFocusPreferenceService {
  public async getPreferences(userId: string): Promise<ChillFocusPreferenceDTO> {
    const pref = await chillFocusRepository.getPreferences(userId);
    return this.toDTO(pref);
  }

  public async updatePreferences(
    userId: string,
    input: UpdateChillFocusPreferenceInput
  ): Promise<ChillFocusPreferenceDTO> {
    const updated = await chillFocusRepository.updatePreferences(userId, input);
    return this.toDTO(updated);
  }

  public toDTO(pref: any): ChillFocusPreferenceDTO {
    return {
      id: pref.id,
      userId: pref.userId,
      preferredMode: pref.preferredMode,
      preferredSoundscape: pref.preferredSoundscape,
      preferredVolume: pref.preferredVolume,
      breathingEnabled: pref.breathingEnabled,
      interventionEnabled: pref.interventionEnabled,
      reducedMotion: pref.reducedMotion,
      createdAt: new Date(pref.createdAt).toISOString(),
      updatedAt: new Date(pref.updatedAt).toISOString()
    };
  }
}

export const chillFocusPreferenceService = new ChillFocusPreferenceService();
