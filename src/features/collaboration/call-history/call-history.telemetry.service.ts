export class CallHistoryTelemetryService {
  public logViewed(userId: string, filterCount: number) {
    console.log(`[Telemetry] call.history.viewed userId=${userId} filterCount=${filterCount}`);
  }

  public logItemOpened(userId: string, callId: string) {
    console.log(`[Telemetry] call.history.item.opened userId=${userId} callId=${callId}`);
  }

  public logEventCreated(channelId: string, callId: string, status: string) {
    console.log(`[Telemetry] call.event.created channelId=${channelId} callId=${callId} status=${status}`);
  }

  public logQueryFailed(userId: string, error: any) {
    console.warn(`[Telemetry] call.history.query.failed userId=${userId} error=`, error);
  }
}

export const callHistoryTelemetryService = new CallHistoryTelemetryService();
