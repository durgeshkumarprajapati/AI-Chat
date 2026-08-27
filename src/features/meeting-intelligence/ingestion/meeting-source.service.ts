import { MeetingSourceProvider } from '@prisma/client';

export interface MeetingSourceProviderInterface {
  provider: MeetingSourceProvider;
  isAvailable(): boolean;
  fetchTranscript(_meetingId: string): Promise<string | null>;
}

export class ManualPasteSourceProvider implements MeetingSourceProviderInterface {
  public provider: MeetingSourceProvider = 'MANUAL_PASTE';
  public isAvailable(): boolean { return true; }
  public async fetchTranscript(): Promise<string | null> { return null; }
}

export class FileUploadSourceProvider implements MeetingSourceProviderInterface {
  public provider: MeetingSourceProvider = 'UPLOAD_FILE';
  public isAvailable(): boolean { return true; }
  public async fetchTranscript(): Promise<string | null> { return null; }
}

export class GoogleMeetSourceProvider implements MeetingSourceProviderInterface {
  public provider: MeetingSourceProvider = 'GOOGLE_MEET';
  public isAvailable(): boolean { return false; }
  public async fetchTranscript(): Promise<string | null> { return null; }
}

export class MeetingSourceService {
  private providers: Map<MeetingSourceProvider, MeetingSourceProviderInterface> = new Map();

  constructor() {
    this.providers.set('MANUAL_PASTE', new ManualPasteSourceProvider());
    this.providers.set('UPLOAD_FILE', new FileUploadSourceProvider());
    this.providers.set('GOOGLE_MEET', new GoogleMeetSourceProvider());
  }

  public getProviderStatus(): Record<MeetingSourceProvider, { supported: boolean; configured: boolean; available: boolean }> {
    return {
      MANUAL_PASTE: { supported: true, configured: true, available: true },
      UPLOAD_FILE: { supported: true, configured: true, available: true },
      GOOGLE_MEET: { supported: true, configured: false, available: false },
      CONNECTED_SOURCE: { supported: true, configured: false, available: false }
    };
  }
}

export const meetingSourceService = new MeetingSourceService();
