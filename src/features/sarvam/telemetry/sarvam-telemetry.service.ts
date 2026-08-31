import { SarvamTelemetryEvent } from '../sarvam.types';

export class SarvamTelemetryService {
  public logEvent(event: SarvamTelemetryEvent): void {
    const payload = {
      timestamp: new Date().toISOString(),
      ...event
    };

    console.log(`[SarvamTelemetry] ${JSON.stringify(payload)}`);
  }
}

export const sarvamTelemetryService = new SarvamTelemetryService();
