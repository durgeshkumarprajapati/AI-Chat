import { CreateMeetingInput, IngestTranscriptInput, MeetingDetailDTO } from './meeting-intelligence.types';
import { meetingIntelligenceRepository } from './meeting-intelligence.repository';
import { meetingAuthorizationService } from './security/meeting-authorization.service';
import { transcriptNormalizerService } from './ingestion/transcript-normalizer.service';
import { transcriptValidatorService } from './ingestion/transcript-validator.service';
import { meetingAnalyzerService } from './analysis/meeting-analyzer.service';
import { projectContextService } from './project/project-context.service';
import { meetingIntelligenceTelemetryService } from './meeting-intelligence.telemetry';
import { auditService } from '@/features/audit/audit.service';
import { publishAutomationEvent } from '@/features/automation/domain-events/automation-domain-event.publisher';

export class MeetingIntelligenceService {
  public async createMeeting(input: CreateMeetingInput) {
    const meeting = await meetingIntelligenceRepository.createMeeting(input);

    await auditService.logEvent({
      actorId: input.userId,
      action: 'MEETING_CREATED',
      targetType: 'MEETING',
      targetId: meeting.id,
      details: { title: meeting.title, projectId: meeting.projectId }
    });

    meetingIntelligenceTelemetryService.logEvent({
      event: 'meeting.created',
      meetingId: meeting.id,
      userId: input.userId,
      projectId: meeting.projectId
    });

    return meeting;
  }

  public async getMeetingDetail(userId: string, meetingId: string): Promise<MeetingDetailDTO> {
    const meeting = await meetingAuthorizationService.authorizeMeetingAccess(userId, meetingId);
    return meeting as unknown as MeetingDetailDTO;
  }

  public async listMeetings(userId: string, projectId?: string) {
    return meetingIntelligenceRepository.listMeetingsByUser(userId, projectId);
  }

  public async ingestTranscript(input: IngestTranscriptInput) {
    await meetingAuthorizationService.authorizeMeetingEdit(input.userId, input.meetingId);

    transcriptValidatorService.validate(input.rawContent);
    const { normalizedContent, wordCount } = transcriptNormalizerService.normalize(input.rawContent);

    const transcript = await meetingIntelligenceRepository.saveTranscript({
      meetingId: input.meetingId,
      rawContent: input.rawContent,
      normalizedContent,
      wordCount,
      language: input.language
    });

    await auditService.logEvent({
      actorId: input.userId,
      action: 'TRANSCRIPT_IMPORTED',
      targetType: 'MEETING',
      targetId: input.meetingId,
      details: { wordCount }
    });

    meetingIntelligenceTelemetryService.logEvent({
      event: 'meeting.transcript_imported',
      meetingId: input.meetingId,
      userId: input.userId,
      wordCount
    });

    return transcript;
  }

  public async analyzeMeeting(userId: string, meetingId: string) {
    const meeting = await meetingAuthorizationService.authorizeMeetingAccess(userId, meetingId);

    if (!meeting.transcript) {
      throw new Error(`Meeting "${meetingId}" has no transcript attached to analyze.`);
    }

    const startTime = Date.now();
    await meetingIntelligenceRepository.updateMeetingStatus(meetingId, 'PROCESSING');

    await auditService.logEvent({
      actorId: userId,
      action: 'MEETING_ANALYSIS_STARTED',
      targetType: 'MEETING',
      targetId: meetingId
    });

    try {
      let projectContext: string | undefined = undefined;
      if (meeting.projectId) {
        const ctx = await projectContextService.getAuthorizedProjectContext(userId, meeting.projectId);
        if (ctx) projectContext = ctx;
      }

      const analysisResult = await meetingAnalyzerService.analyzeTranscript(
        meeting.transcript.normalizedContent,
        projectContext
      );

      const savedAnalysis = await meetingIntelligenceRepository.saveAnalysis({
        meetingId,
        summary: analysisResult.summary,
        discussion: analysisResult.discussionPoints,
        decisions: analysisResult.decisions,
        actionItems: analysisResult.actionItems,
        risks: analysisResult.risks,
        blockers: analysisResult.blockers,
        openQuestions: analysisResult.openQuestions,
        confidence: analysisResult.confidence
      });

      await meetingIntelligenceRepository.replaceTaskSuggestions(meetingId, userId, analysisResult.actionItems);
      await meetingIntelligenceRepository.updateMeetingStatus(meetingId, 'COMPLETED');

      const durationMs = Date.now() - startTime;
      await auditService.logEvent({
        actorId: userId,
        action: 'MEETING_ANALYSIS_COMPLETED',
        targetType: 'MEETING',
        targetId: meetingId,
        details: { durationMs, taskCount: analysisResult.actionItems.length }
      });

      meetingIntelligenceTelemetryService.logEvent({
        event: 'meeting.analysis_completed',
        meetingId,
        userId,
        durationMs,
        taskCount: analysisResult.actionItems.length
      });

      // Phase 88 — fire-and-forget automation trigger. Never awaited-and-blocking, never allowed
      // to affect this method's own success (publishAutomationEvent never throws) — a bounded,
      // sanitized summary only (no raw transcript/analysis content).
      void publishAutomationEvent({
        eventType: 'MEETING_ANALYSIS_COMPLETED',
        sourceUserId: userId,
        sourceProjectId: meeting.projectId ?? null,
        sourceEntityId: meetingId,
        occurredAt: new Date().toISOString(),
        payload: {
          summary: typeof savedAnalysis.summary === 'string' ? savedAnalysis.summary.slice(0, 200) : null,
          actionItemCount: analysisResult.actionItems.length
        }
      });

      return savedAnalysis;
    } catch (err: any) {
      await meetingIntelligenceRepository.updateMeetingStatus(meetingId, 'FAILED', err.message);
      meetingIntelligenceTelemetryService.logEvent({
        event: 'meeting.analysis_failed',
        meetingId,
        userId,
        error: String(err)
      });
      throw err;
    }
  }

  public async deleteMeeting(userId: string, meetingId: string) {
    await meetingAuthorizationService.authorizeMeetingEdit(userId, meetingId);
    return meetingIntelligenceRepository.deleteMeeting(meetingId, userId);
  }
}

export const meetingIntelligenceService = new MeetingIntelligenceService();
