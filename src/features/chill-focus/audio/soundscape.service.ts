import { SOUNDSCAPES, SOUNDSCAPE_MAP } from '../chill-focus.constants';
import { SoundscapeDefinition } from '../chill-focus.types';
import { ISoundscapeService } from './soundscape.types';
import { envConfig } from '@/config/env';

export class SoundscapeService implements ISoundscapeService {
  public getAvailableSoundscapes(): SoundscapeDefinition[] {
    return SOUNDSCAPES;
  }

  public getSoundscapeById(id: string): SoundscapeDefinition | undefined {
    return SOUNDSCAPE_MAP.get((id || '').toLowerCase());
  }

  public getAudioUrl(soundscapeId: string): string {
    const preset = this.getSoundscapeById(soundscapeId);
    const filename = preset ? preset.audioUrl : 'night_sky.mp3';
    const baseUrl = envConfig.chillFocus?.audioBaseUrl || '/audio/soundscapes/';
    const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    return `${cleanBase}${filename}`;
  }
}

export const soundscapeService = new SoundscapeService();
