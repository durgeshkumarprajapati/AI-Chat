export class ArchitectureTelemetryService {
  public logView(userId: string): void {
    console.log(`[ArchitectureTelemetry] ${JSON.stringify({ timestamp: new Date().toISOString(), event: 'architecture.explorer.viewed', userId })}`);
  }
}

export const architectureTelemetryService = new ArchitectureTelemetryService();
