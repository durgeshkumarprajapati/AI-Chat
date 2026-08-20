import fs from 'fs';
import path from 'path';

export interface VoiceUploadOptions {
  channelId: string;
  userId: string;
  buffer: Buffer;
  mimeType: string;
  durationMs?: number;
}

export interface VoiceUploadResult {
  storageKey: string;
  fileSizeBytes: number;
  mimeType: string;
  durationMs: number;
}

export class VoiceMessageStorageService {
  private storageDir: string;
  private maxDurationMs: number;
  private maxSizeBytes: number;
  private allowedMimeTypes: string[];

  constructor() {
    this.storageDir = path.join(process.cwd(), 'storage', 'collaboration', 'voice');
    this.maxDurationMs = (parseInt(process.env.VOICE_MESSAGE_MAX_DURATION_SECONDS || '120', 10)) * 1000;
    this.maxSizeBytes = parseInt(process.env.VOICE_MESSAGE_MAX_BYTES || '10485760', 10);
    this.allowedMimeTypes = (process.env.VOICE_MESSAGE_ALLOWED_MIME_TYPES || 'audio/webm,audio/ogg,audio/mp4,audio/wav,audio/mpeg')
      .split(',')
      .map((s) => s.trim().toLowerCase());

    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  public validateVoiceUpload(buffer: Buffer, mimeType: string, durationMs?: number): void {
    if (!process.env.VOICE_MESSAGE_ENABLED || process.env.VOICE_MESSAGE_ENABLED === 'false') {
      // Allowed by default unless explicitly disabled
    }

    if (buffer.length > this.maxSizeBytes) {
      throw new Error(`Voice message file size exceeds limit of ${Math.round(this.maxSizeBytes / (1024 * 1024))}MB.`);
    }

    const cleanMime = (mimeType.split(';')[0] || '').trim().toLowerCase();
    const isAllowed = this.allowedMimeTypes.some((allowed) => cleanMime.startsWith(allowed));
    if (!isAllowed) {
      throw new Error(`Unsupported audio format: ${mimeType}. Allowed formats: ${this.allowedMimeTypes.join(', ')}`);
    }

    if (durationMs && durationMs > this.maxDurationMs) {
      throw new Error(`Voice message duration exceeds limit of ${this.maxDurationMs / 1000} seconds.`);
    }
  }

  public async uploadVoiceMessage(options: VoiceUploadOptions): Promise<VoiceUploadResult> {
    this.validateVoiceUpload(options.buffer, options.mimeType, options.durationMs);

    const ext = options.mimeType.includes('mp4') ? 'm4a' : options.mimeType.includes('ogg') ? 'ogg' : 'webm';
    const filename = `voice_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`;
    const storageKey = path.join(options.channelId, filename);
    const fullPath = path.join(this.storageDir, storageKey);

    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, options.buffer);

    return {
      storageKey,
      fileSizeBytes: options.buffer.length,
      mimeType: options.mimeType,
      durationMs: options.durationMs || 5000
    };
  }

  public getVoiceFilePath(storageKey: string): string {
    // Sanitize path against directory traversal
    const safeKey = path.normalize(storageKey).replace(/^(\.\.[\/\\])+/, '');
    return path.join(this.storageDir, safeKey);
  }

  public deleteVoiceMessage(storageKey: string): void {
    try {
      const fullPath = this.getVoiceFilePath(storageKey);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    } catch (err) {
      console.error('Failed to delete voice message file:', err);
    }
  }
}

export const voiceMessageStorageService = new VoiceMessageStorageService();
