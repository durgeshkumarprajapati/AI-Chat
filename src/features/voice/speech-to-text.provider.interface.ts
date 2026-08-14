import { SpeechToTextConfig, VoiceError } from './voice.types';

/* eslint-disable no-unused-vars */
export interface ISpeechToTextProvider {
  name: string;
  isSupported(): boolean;
  start(_config?: SpeechToTextConfig): void;
  stop(): void;
  abort(): void;
  setLanguage(_locale: string): void;
  onStart(_cb: () => void): void;
  onEnd(_cb: () => void): void;
  onResult(_cb: (_transcript: string, _isFinal: boolean) => void): void;
  onError(_cb: (_error: VoiceError) => void): void;
}
