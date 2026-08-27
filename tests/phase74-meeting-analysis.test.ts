import { transcriptNormalizerService } from '@/features/meeting-intelligence/ingestion/transcript-normalizer.service';
import { transcriptValidatorService } from '@/features/meeting-intelligence/ingestion/transcript-validator.service';
import { analysisValidatorService } from '@/features/meeting-intelligence/analysis/analysis-validator.service';
import { meetingAnalyzerService } from '@/features/meeting-intelligence/analysis/meeting-analyzer.service';

describe('Phase 74 — AI Meeting Intelligence & Analysis', () => {
  describe('1. Transcript Ingestion & Normalization', () => {
    it('normalizes speaker prefixes and extra whitespace', () => {
      const raw = 'Speaker 1 (00:01:23): Hello team\n\n\nSpeaker 2:   We decided to adopt Next.js.';
      const res = transcriptNormalizerService.normalize(raw);

      expect(res.normalizedContent).toContain('[Speaker 1 (00:01:23)]: Hello team');
      expect(res.normalizedContent).toContain('[Speaker 2]: We decided to adopt Next.js.');
      expect(res.wordCount).toBe(12);
    });

    it('validates non-empty transcript content', () => {
      expect(() => transcriptValidatorService.validate('')).toThrow('cannot be empty');
      expect(() => transcriptValidatorService.validate('   ')).toThrow('cannot be empty');
    });
  });

  describe('2. AI Analysis & Schema Validation', () => {
    it('sanitizes and validates raw LLM output', () => {
      const raw = {
        summary: '   Executive summary of project goals.  ',
        discussionPoints: ['Architecture', 123, null],
        decisions: ['Approved ClickUp integration'],
        actionItems: [
          { title: ' Create API routes ', suggestedAssignee: ' Alice ', confidence: 0.95 }
        ],
        risks: ['Timeline tight'],
        confidence: 0.95
      };

      const sanitized = analysisValidatorService.validateAndSanitize(raw);
      expect(sanitized.summary).toBe('Executive summary of project goals.');
      expect(sanitized.decisions).toEqual(['Approved ClickUp integration']);
      expect(sanitized.actionItems[0]!.title).toBe('Create API routes');
      expect(sanitized.actionItems[0]!.suggestedAssignee).toBe('Alice');
    });

    it('provides heuristic fallback analysis when LLM is unavailable', () => {
      const transcript = 'Speaker 1: Action Item: Update database schema\nSpeaker 2: We agreed to use Prisma.\nSpeaker 1: Risk: Database migration lock.';
      const fallback = meetingAnalyzerService.fallbackAnalysis(transcript);

      expect(fallback.actionItems.length).toBeGreaterThan(0);
      expect(fallback.actionItems[0]!.title).toContain('Update database schema');
      expect(fallback.decisions[0]).toContain('We agreed to use Prisma.');
      expect(fallback.risks[0]).toContain('Risk: Database migration lock.');
    });
  });
});
