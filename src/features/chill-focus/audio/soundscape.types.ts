import { SoundscapeDefinition } from '../chill-focus.types';

export interface SoundscapeAudioState {
  soundscapeId: string;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  isLoaded: boolean;
  hasError: boolean;
  errorMessage?: string;
}

export interface ISoundscapeService {
  getAvailableSoundscapes(): SoundscapeDefinition[];
  getSoundscapeById(_id: string): SoundscapeDefinition | undefined;
  getAudioUrl(_soundscapeId: string): string;
}
