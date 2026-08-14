import { ISpeechToTextProvider } from './speech-to-text.provider.interface';
import { BrowserSpeechProvider } from './browser-speech.provider';
import { VoiceState, VoiceError, SpeechToTextConfig, SUPPORTED_VOICE_LANGUAGES } from './voice.types';

/* eslint-disable no-unused-vars */
export class SpeechToTextService {
  private provider: ISpeechToTextProvider;
  private state: VoiceState = 'IDLE';
  private currentLanguage = 'en-US';
  private lastError: VoiceError | null = null;

  private stateListeners: Set<(_state: VoiceState) => void> = new Set();
  private transcriptListeners: Set<(_transcript: string, _isFinal: boolean) => void> = new Set();
  private errorListeners: Set<(_error: VoiceError) => void> = new Set();

  constructor(provider?: ISpeechToTextProvider) {
    this.provider = provider || new BrowserSpeechProvider();
    this.initProviderEvents();
  }

  private initProviderEvents(): void {
    if (!this.provider.isSupported()) {
      this.state = 'UNSUPPORTED';
    }

    this.provider.onStart(() => {
      this.setState('LISTENING');
    });

    this.provider.onEnd(() => {
      if (this.state === 'LISTENING' || this.state === 'STOPPING' || this.state === 'STARTING') {
        this.setState('IDLE');
      }
    });

    this.provider.onResult((transcript, isFinal) => {
      this.notifyTranscript(transcript, isFinal);
    });

    this.provider.onError((error) => {
      this.lastError = error;
      this.setState('ERROR');
      this.notifyError(error);
      setTimeout(() => {
        if (this.state === 'ERROR') {
          this.setState('IDLE');
        }
      }, 3000);
    });
  }

  public setProvider(provider: ISpeechToTextProvider): void {
    this.provider = provider;
    this.initProviderEvents();
  }

  public isSupported(): boolean {
    return this.provider.isSupported();
  }

  public getState(): VoiceState {
    return this.state;
  }

  public getLanguage(): string {
    return this.currentLanguage;
  }

  public setLanguage(locale: string): void {
    const valid = SUPPORTED_VOICE_LANGUAGES.some((l) => l.value === locale);
    this.currentLanguage = valid ? locale : 'en-US';
    this.provider.setLanguage(this.currentLanguage);
  }

  public getLastError(): VoiceError | null {
    return this.lastError;
  }

  private setState(newState: VoiceState): void {
    if (this.state === newState) return;
    this.state = newState;
    this.stateListeners.forEach((fn) => fn(newState));
  }

  private notifyTranscript(transcript: string, isFinal: boolean): void {
    this.transcriptListeners.forEach((fn) => fn(transcript, isFinal));
  }

  private notifyError(error: VoiceError): void {
    this.errorListeners.forEach((fn) => fn(error));
  }

  public startListening(config?: SpeechToTextConfig): void {
    if (!this.isSupported()) {
      this.setState('UNSUPPORTED');
      this.notifyError({
        code: 'NOT_SUPPORTED',
        message: 'Speech recognition is not supported in this browser.'
      });
      return;
    }

    if (this.state === 'LISTENING' || this.state === 'STARTING') {
      return;
    }

    this.lastError = null;
    this.setState('STARTING');
    const effectiveLocale = config?.locale || this.currentLanguage;
    this.provider.start({ ...config, locale: effectiveLocale });
  }

  public stopListening(): void {
    if (this.state !== 'LISTENING' && this.state !== 'STARTING') {
      return;
    }
    this.setState('STOPPING');
    this.provider.stop();
  }

  public abortListening(): void {
    this.setState('IDLE');
    this.provider.abort();
  }

  public onStateChange(listener: (_state: VoiceState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  public onTranscript(listener: (_transcript: string, _isFinal: boolean) => void): () => void {
    this.transcriptListeners.add(listener);
    return () => this.transcriptListeners.delete(listener);
  }

  public onError(listener: (_error: VoiceError) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }
}

export const speechToTextService = new SpeechToTextService();
