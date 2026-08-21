import { TTSSynthesizeOptions, TTSSynthesizeResult } from '../voice-tutor.types';
import { TTSError } from '../voice-tutor.errors';
import { envConfig } from '@/config/env';

export interface TextToSpeechProvider {
  readonly name: string;
  synthesize(_text: string, _options?: TTSSynthesizeOptions): Promise<TTSSynthesizeResult>;
}

export class MockTTSProvider implements TextToSpeechProvider {
  public readonly name = 'mock';

  public async synthesize(text: string, _options?: TTSSynthesizeOptions): Promise<TTSSynthesizeResult> {
    if (!text || text.trim().length === 0) {
      throw new TTSError('Empty text string provided for TTS synthesis.');
    }

    // Create synthetic PCM audio buffer simulation
    const simulatedDurationMs = Math.min(30000, Math.max(1500, Math.round((text.length / 15) * 1000)));
    const mockAudioHeader = Buffer.from(`MOCK_AUDIO_DATA:${text.slice(0, 100)}`, 'utf-8');
    const padding = Buffer.alloc(Math.min(1024, simulatedDurationMs * 2));
    const audioBuffer = Buffer.concat([mockAudioHeader, padding]);

    return {
      audioBuffer,
      mimeType: 'audio/mp3',
      durationMs: simulatedDurationMs
    };
  }
}

export class OpenAITTSProvider implements TextToSpeechProvider {
  public readonly name = 'openai_tts';

  public async synthesize(text: string, options?: TTSSynthesizeOptions): Promise<TTSSynthesizeResult> {
    const apiKey = envConfig.server?.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey.startsWith('sk-mock-key')) {
      return new MockTTSProvider().synthesize(text, options);
    }

    try {
      const res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: text,
          voice: options?.voice || 'alloy',
          speed: options?.speed || 1.0,
          response_format: 'mp3'
        })
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new TTSError(`HTTP ${res.status} from OpenAI TTS API: ${errText}`);
      }

      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = Buffer.from(arrayBuffer);
      const estimatedDurationMs = Math.max(1000, Math.round((text.length / 15) * 1000));

      return {
        audioBuffer,
        mimeType: 'audio/mp3',
        durationMs: estimatedDurationMs
      };
    } catch (err: any) {
      if (err instanceof TTSError) throw err;
      throw new TTSError(err instanceof Error ? err.message : String(err));
    }
  }
}

export class TTSProviderFactory {
  public static getProvider(providerName?: string): TextToSpeechProvider {
    const selected = (providerName || envConfig.voiceTutor.ttsProvider || 'mock').toLowerCase();
    switch (selected) {
      case 'openai':
      case 'openai_tts':
      case 'tts-1':
        return new OpenAITTSProvider();
      case 'mock':
      default:
        return new MockTTSProvider();
    }
  }
}
