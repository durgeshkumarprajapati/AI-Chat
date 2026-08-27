export interface BillingTelemetryEvent {
  event: string;
  userId?: string;
  planCode?: string;
  status?: string;
  featureCode?: string;
  metric?: string;
  error?: string;
  [key: string]: unknown;
}

export class BillingTelemetryService {
  public logEvent(event: BillingTelemetryEvent): void {
    console.log(`[BillingTelemetry] ${JSON.stringify({ timestamp: new Date().toISOString(), ...event })}`);
  }
}

export const billingTelemetryService = new BillingTelemetryService();
