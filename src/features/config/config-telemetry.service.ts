export interface ConfigTelemetryEvent {
  event: string;
  key?: string;
  category?: string;
  actorId?: string;
  error?: string;
  [key: string]: unknown;
}

export class ConfigTelemetryService {
  public logEvent(event: ConfigTelemetryEvent): void {
    console.log(`[ConfigTelemetry] ${JSON.stringify({ timestamp: new Date().toISOString(), ...event })}`);
  }
}

export const configTelemetryService = new ConfigTelemetryService();
