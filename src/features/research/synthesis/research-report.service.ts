import { getLLMProvider } from '@/features/rag/llm/llm.provider.factory';
import { LLMProvider } from '@/features/rag/llm/llm.provider';
import { researchRepository } from '../repository/research.repository';
import { ResearchSessionStatus } from '../research.types';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { researchSecurityService } from '../security/research-security.service';

export class ResearchReportService {
  private llmProvider: LLMProvider;

  constructor(llmProvider?: LLMProvider) {
    this.llmProvider = llmProvider || getLLMProvider();
  }

  public async synthesizeReport(sessionId: string): Promise<string> {
    const session = await prisma.researchSession.findUnique({
      where: { id: sessionId },
      include: {
        sources: true,
        evidences: { include: { source: true }, take: 25 },
        claims: { take: 30 },
        conflicts: { take: 10 }
      }
    });

    if (!session) throw new Error('Research session not found');

    if (session.evidences.length === 0) {
      const zeroReport = `# Research Report: ${session.title}\n\n## Zero Evidence Warning\n\nI could not find sufficient reliable evidence to answer this research question within the permitted source boundaries.\n\n### Recommendation\nPlease try expanding your permitted sources (e.g. enable Web Search or upload relevant documents) or refining your research query.`;
      await researchRepository.saveReport({
        sessionId,
        summary: 'Insufficient evidence found.',
        reportContent: zeroReport,
        reportVersion: 1
      });
      await researchRepository.updateSessionStatus(sessionId, ResearchSessionStatus.NO_EVIDENCE);
      return zeroReport;
    }

    const evidenceList = session.evidences
      .map((e, idx) => `[Source ${idx + 1}: ${e.source.title} (${e.source.url || 'Internal Document'})]\n${researchSecurityService.sanitizeEvidenceForPrompt(e.evidenceText)}`)
      .join('\n\n');

    const claimsList = session.claims.map((c) => `- ${c.claimText} [Confidence: ${c.confidence}]`).join('\n');
    const conflictsList = session.conflicts
      .map((c) => `- Discrepancy (${c.conflictType}): ${c.resolutionSummary || 'Unresolved conflict detected.'}`)
      .join('\n');

    const prompt = `Synthesize a comprehensive, production-grade Agentic Research Report for the research question:

Research Question: "${session.question}"

COLLECTED EVIDENCE & SOURCES:
${evidenceList}

VERIFIED CLAIMS:
${claimsList || 'None extracted.'}

DISCLOSED CONFLICTS:
${conflictsList || 'No conflicting evidence detected.'}

INSTRUCTIONS:
1. Write a professional, well-structured markdown report with headings:
   # Research Report: ${session.title}
   ## Executive Summary
   ## Methodology & Source Scope
   ## Key Findings
   ## Detailed Analysis & Evidence
   ## Conflicting Information (if any)
   ## Unresolved Questions & Gaps
   ## Conclusion
   ## Sources & References
2. Attach inline citations like [1], [2] referencing the enumerated sources.
3. DO NOT include hidden internal reasoning or chain-of-thought.
4. Return ONLY clean Github-flavored Markdown.`;

    let reportMarkdown = '';
    try {
      reportMarkdown = await this.llmProvider.generateAnswer({
        question: prompt,
        context: 'You are a Senior AI Research Analyst. Output professional markdown research reports.'
      });
    } catch (err) {
      console.warn('LLM report synthesis failed, generating structured template report:', err);
      reportMarkdown = `# Research Report: ${session.title}\n\n## Executive Summary\nAnalysis conducted for question: "${session.question}".\n\n## Key Findings\n${claimsList || '- Evidence collected from authorized sources.'}\n\n## Sources & References\n${session.sources.map((s, idx) => `[${idx + 1}] ${s.title} — ${s.url || 'Internal Document'}`).join('\n')}`;
    }

    const sourceFingerprint = crypto.createHash('sha256').update(session.sources.map((s) => s.id).join(',')).digest('hex');
    const summary = reportMarkdown.split('\n').filter((line) => line.trim() && !line.startsWith('#'))[0]?.slice(0, 300) || session.question;

    await researchRepository.saveReport({
      sessionId,
      summary,
      reportContent: reportMarkdown,
      reportVersion: 1,
      sourceFingerprint
    });

    const finalStatus = session.stepsUsed >= session.maxSteps ? ResearchSessionStatus.LIMIT_REACHED : ResearchSessionStatus.COMPLETED;
    await researchRepository.updateSessionStatus(sessionId, finalStatus, { progressPercent: 100, completedAt: new Date() });

    return reportMarkdown;
  }
}

export const researchReportService = new ResearchReportService();
