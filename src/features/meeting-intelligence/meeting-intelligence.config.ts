import { env } from '@/config/env';

export class MeetingIntelligenceConfig {
  public get isEnabled(): boolean {
    return env.server?.MEETING_INTELLIGENCE_ENABLED ?? true;
  }

  public get isAnalysisEnabled(): boolean {
    return env.server?.MEETING_ANALYSIS_ENABLED ?? true;
  }

  public get isProjectContextEnabled(): boolean {
    return env.server?.MEETING_PROJECT_CONTEXT_ENABLED ?? true;
  }

  public get analysisTimeoutMs(): number {
    return env.server?.MEETING_ANALYSIS_TIMEOUT_MS ?? 120000;
  }

  public get transcriptMaxLength(): number {
    return env.server?.MEETING_TRANSCRIPT_MAX_LENGTH ?? 200000;
  }

  public get maxProjectContextTokens(): number {
    return env.server?.MEETING_MAX_PROJECT_CONTEXT_TOKENS ?? 8000;
  }
}

export const meetingIntelligenceConfig = new MeetingIntelligenceConfig();
