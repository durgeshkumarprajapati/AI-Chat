import { ISpeechToTextProvider } from './speech-to-text.provider.interface';
import { SpeechToTextConfig, VoiceError } from './voice.types';

/* eslint-disable no-unused-vars */
export class BrowserSpeechProvider implements ISpeechToTextProvider {
  public readonly name = 'browser-speech';
  private recognition: any = null;
  private currentLanguage = 'en-US';

  private startCallback: (() => void) | null = null;
  private endCallback: (() => void) | null = null;
  private resultCallback: ((_transcript: string, _isFinal: boolean) => void) | null = null;
  private errorCallback: ((_error: VoiceError) => void) | null = null;

  constructor() {
    this.initRecognition();
  }

  private initRecognition(): void {
    if (typeof window === 'undefined') return;

    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognitionAPI) {
      try {
        this.recognition = new SpeechRecognitionAPI();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = this.currentLanguage;

        this.recognition.onstart = () => {
          this.startCallback?.();
        };

        this.recognition.onend = () => {
          this.endCallback?.();
        };

        this.recognition.onresult = (event: any) => {
          if (!event.results) return;

          let finalTranscript = '';
          let interimTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const res = event.results[i];
            const transcript = res[0]?.transcript || '';
            if (res.isFinal) {
              finalTranscript += transcript;
            } else {
              interimTranscript += transcript;
            }
          }

          if (finalTranscript) {
            this.resultCallback?.(finalTranscript, true);
          } else if (interimTranscript) {
            this.resultCallback?.(interimTranscript, false);
          }
        };

        this.recognition.onerror = (event: any) => {
          const errCode = event.error;
          let voiceError: VoiceError;

          if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
            voiceError = {
              code: 'PERMISSION_DENIED',
              message: 'Microphone permission was denied or restricted by browser.',
              originalError: event
            };
          } else if (errCode === 'no-speech') {
            voiceError = {
              code: 'NO_SPEECH',
              message: 'No speech was detected. Please try speaking again.',
              originalError: event
            };
          } else if (errCode === 'network') {
            voiceError = {
              code: 'NETWORK_ERROR',
              message: 'Network error during speech recognition.',
              originalError: event
            };
          } else if (errCode === 'aborted') {
            voiceError = {
              code: 'ABORTED',
              message: 'Voice recognition was aborted.',
              originalError: event
            };
          } else {
            voiceError = {
              code: 'UNKNOWN',
              message: `Speech recognition error: ${errCode || 'Unknown error'}`,
              originalError: event
            };
          }

          this.errorCallback?.(voiceError);
        };
      } catch (err) {
        this.recognition = null;
      }
    }
  }

  public isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  }

  public setLanguage(locale: string): void {
    this.currentLanguage = locale;
    if (this.recognition) {
      this.recognition.lang = locale;
    }
  }

  public start(config?: SpeechToTextConfig): void {
    if (!this.isSupported()) {
      this.errorCallback?.({
        code: 'NOT_SUPPORTED',
        message: 'Speech recognition is not supported in this browser.'
      });
      return;
    }

    if (!this.recognition) {
      this.initRecognition();
    }

    if (!this.recognition) {
      this.errorCallback?.({
        code: 'NOT_SUPPORTED',
        message: 'Failed to initialize browser speech recognition engine.'
      });
      return;
    }

    if (config?.locale) {
      this.setLanguage(config.locale);
    }
    if (config?.continuous !== undefined) {
      this.recognition.continuous = config.continuous;
    }
    if (config?.interimResults !== undefined) {
      this.recognition.interimResults = config.interimResults;
    }

    try {
      this.recognition.start();
    } catch (err: any) {
      if (err?.name === 'InvalidStateError' || err?.message?.includes('already started')) {
        return;
      }
      this.errorCallback?.({
        code: 'UNKNOWN',
        message: err?.message || 'Failed to start speech recognition.',
        originalError: err
      });
    }
  }

  public stop(): void {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
    }
  }

  public abort(): void {
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {}
    }
  }

  public onStart(cb: () => void): void {
    this.startCallback = cb;
  }

  public onEnd(cb: () => void): void {
    this.endCallback = cb;
  }

  public onResult(cb: (_transcript: string, _isFinal: boolean) => void): void {
    this.resultCallback = cb;
  }

  public onError(cb: (_error: VoiceError) => void): void {
    this.errorCallback = cb;
  }
}
