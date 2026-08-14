import { TTSTextCleaner } from './tts-text-cleaner';

export type TTSLanguage = 'en-US' | 'hi-IN' | 'gu-IN' | 'en' | 'hi' | 'gu';

export interface TTSOptions {
  language?: TTSLanguage;
  speed?: number; // 0.75 to 2.0
  voiceName?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (_err: any) => void;
  onPause?: () => void;
  onResume?: () => void;
}

export interface ITTSProvider {
  name: string;
  isSupported(): boolean;
  speak(_text: string, _options?: TTSOptions): void;
  pause(): void;
  resume(): void;
  stop(): void;
  getVoices(): Array<{ name: string; lang: string }>;
}

export class BrowserTTSProvider implements ITTSProvider {
  public readonly name = 'browser';
  private synth: SpeechSynthesis | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
    }
  }

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  }

  public getVoices(): Array<{ name: string; lang: string }> {
    if (!this.synth) return [];
    return this.synth.getVoices().map((v) => ({ name: v.name, lang: v.lang }));
  }

  public speak(rawText: string, options?: TTSOptions): void {
    if (!this.isSupported() || !this.synth) {
      options?.onError?.(new Error('Text-to-speech is not supported in this browser.'));
      return;
    }

    this.stop(); // Stop any currently playing audio

    const cleanText = TTSTextCleaner.cleanForSpeech(rawText);
    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);

    // Set locale language
    const lang = options?.language || 'en-US';
    utterance.lang = lang;

    // Set rate speed
    const speed = Math.max(0.5, Math.min(2.0, options?.speed || 1.0));
    utterance.rate = speed;

    // Find matching voice if available
    const voices = this.synth.getVoices();
    if (options?.voiceName) {
      const match = voices.find((v) => v.name === options.voiceName);
      if (match) utterance.voice = match;
    } else if (voices.length > 0 && lang) {
      const langPrefix = lang.split('-')[0]?.toLowerCase() || 'en';
      const match = voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix));
      if (match) utterance.voice = match;
    }

    utterance.onstart = () => options?.onStart?.();
    utterance.onend = () => {
      options?.onEnd?.();
    };
    utterance.onerror = (e) => {
      options?.onError?.(e);
    };
    utterance.onpause = () => options?.onPause?.();
    utterance.onresume = () => options?.onResume?.();

    this.synth.speak(utterance);
  }

  public pause(): void {
    if (this.synth && this.synth.speaking) {
      this.synth.pause();
    }
  }

  public resume(): void {
    if (this.synth && this.synth.paused) {
      this.synth.resume();
    }
  }

  public stop(): void {
    if (this.synth) {
      this.synth.cancel();
    }
  }
}

export class TextToSpeechService {
  private provider: ITTSProvider;

  constructor(provider?: ITTSProvider) {
    this.provider = provider || new BrowserTTSProvider();
  }

  public isSupported(): boolean {
    return this.provider.isSupported();
  }

  public speak(text: string, options?: TTSOptions): void {
    this.provider.speak(text, options);
  }

  public pause(): void {
    this.provider.pause();
  }

  public resume(): void {
    this.provider.resume();
  }

  public stop(): void {
    this.provider.stop();
  }

  public getVoices(): Array<{ name: string; lang: string }> {
    return this.provider.getVoices();
  }
}

export const ttsService = new TextToSpeechService();
