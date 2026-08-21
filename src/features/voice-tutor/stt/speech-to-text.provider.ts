import { STTTranscribeOptions, STTTranscribeResult } from '../voice-tutor.types';
import { STTError } from '../voice-tutor.errors';
import { envConfig } from '@/config/env';

export interface SpeechToTextProvider {
  readonly name: string;
  transcribe(_audioBuffer: Buffer, _mimeType: string, _options?: STTTranscribeOptions): Promise<STTTranscribeResult>;
}

export class MockSTTProvider implements SpeechToTextProvider {
  public readonly name = 'mock';

  public async transcribe(
    audioBuffer: Buffer,
    _mimeType: string,
    _options?: STTTranscribeOptions
  ): Promise<STTTranscribeResult> {
    if (!audioBuffer || audioBuffer.length === 0) {
      throw new STTError('Empty audio payload provided for transcription.');
    }

    const durationSeconds = Math.max(1, Math.round(audioBuffer.length / 16000));
    
    // Check if buffer contains string content from mock client
    const textSnippet = audioBuffer.toString('utf-8');
    if (textSnippet.startsWith('TEST_TRANSCRIPT:')) {
      return {
        text: textSnippet.replace('TEST_TRANSCRIPT:', '').trim(),
        durationMs: durationSeconds * 1000,
        confidence: 0.98,
        language: 'en'
      };
    }

    return {
      text: 'Explain database sharding and index optimization.',
      durationMs: durationSeconds * 1000,
      confidence: 0.95,
      language: 'en'
    };
  }
}

export class OpenAIWhisperSTTProvider implements SpeechToTextProvider {
  public readonly name = 'openai_whisper';

  public async transcribe(
    audioBuffer: Buffer,
    mimeType: string,
    options?: STTTranscribeOptions
  ): Promise<STTTranscribeResult> {
    const apiKey = envConfig.server?.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey.startsWith('sk-mock-key')) {
      // Graceful fallback to mock transcription if real key is not configured
      return new MockSTTProvider().transcribe(audioBuffer, mimeType, options);
    }

    try {
      const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('ogg') ? 'ogg' : 'wav';
      const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
      const file = new File([blob], `input.${ext}`, { type: mimeType });
      const formData = new FormData();
      formData.append('file', file);
      formData.append('model', 'whisper-1');
      if (options?.language) {
        formData.append('language', options.language);
      }

      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`
        },
        body: formData
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new STTError(errJson?.error?.message || `HTTP ${res.status} from Whisper API`);
      }

      const data = await res.json();
      return {
        text: data.text || '',
        durationMs: Math.max(1000, Math.round((audioBuffer.length / 16000) * 1000)),
        confidence: 0.95,
        language: options?.language || 'en'
      };
    } catch (err: any) {
      if (err instanceof STTError) throw err;
      throw new STTError(err instanceof Error ? err.message : String(err));
    }
  }
}

export class STTProviderFactory {
  public static getProvider(providerName?: string): SpeechToTextProvider {
    const selected = (providerName || envConfig.voiceTutor.sttProvider || 'mock').toLowerCase();
    switch (selected) {
      case 'openai':
      case 'openai_whisper':
      case 'whisper':
        return new OpenAIWhisperSTTProvider();
      case 'mock':
      default:
        return new MockSTTProvider();
    }
  }
}
