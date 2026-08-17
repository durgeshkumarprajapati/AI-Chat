import { CopilotIntent } from '../types/copilot.types';

export interface IntentClassificationResult {
  intent: CopilotIntent;
  confidence: number;
  reasoning: string;
  suggestedCapabilities: string[];
}

export class CopilotRouterService {
  /**
   * Classify user query intent into a structured CopilotIntent.
   */
  public classifyIntent(query: string, hasDocuments: boolean = false): IntentClassificationResult {
    const q = query.toLowerCase().trim();

    // 1. Multi-Step Intent (combination of document analysis + web research + roadmap / multiple goals)
    if (
      ((hasDocuments || q.includes('pdf') || q.includes('document')) && (q.includes('latest') || q.includes('roadmap') || q.includes('search') || q.includes('online') || q.includes('compare'))) ||
      (q.includes('roadmap') && (q.includes('search') || q.includes('pdf') || q.includes('workflow')))
    ) {
      return {
        intent: 'MULTI_STEP',
        confidence: 0.95,
        reasoning: 'User query combines multiple distinct capability requirements.',
        suggestedCapabilities: ['DOCUMENT_RAG', 'WEB_SEARCH', 'ROADMAP']
      };
    }

    // 2. Workflow / Automation intent
    if (q.includes('workflow') || q.includes('automate') || q.includes('whenever i upload') || q.includes('pipeline')) {
      return {
        intent: 'WORKFLOW',
        confidence: 0.95,
        reasoning: 'User requested workflow creation or automated pipeline execution.',
        suggestedCapabilities: ['WORKFLOW']
      };
    }

    // 3. Roadmap / Learning Plan intent
    if (q.includes('roadmap') || q.includes('learning plan') || q.includes('in 30 days') || q.includes('curriculum')) {
      return {
        intent: 'ROADMAP',
        confidence: 0.92,
        reasoning: 'User requested a structured multi-day learning roadmap.',
        suggestedCapabilities: ['ROADMAP', 'DOCUMENT_RAG']
      };
    }

    // 4. Learning / Tutor / Study intent
    if (q.includes('teach me') || q.includes('quiz me') || q.includes('flashcard') || q.includes('study mode')) {
      return {
        intent: 'LEARNING',
        confidence: 0.90,
        reasoning: 'User requested interactive study/tutor session.',
        suggestedCapabilities: ['STUDY', 'DOCUMENT_RAG']
      };
    }

    // 5. Web Research intent
    if (q.includes('latest') || q.includes('research') || q.includes('find online') || q.includes('recent changes') || q.includes('news')) {
      return {
        intent: 'WEB_RESEARCH',
        confidence: 0.88,
        reasoning: 'User requested real-time external web search or agentic research.',
        suggestedCapabilities: ['WEB_SEARCH', 'AGENTIC_RESEARCH']
      };
    }

    // 6. Document Analysis
    if (hasDocuments || q.includes('pdf') || q.includes('document') || q.includes('this file') || q.includes('summary')) {
      return {
        intent: 'DOCUMENT_ANALYSIS',
        confidence: 0.85,
        reasoning: 'User query targets uploaded document content.',
        suggestedCapabilities: ['DOCUMENT_RAG']
      };
    }

    // 7. General Question
    return {
      intent: 'QUESTION',
      confidence: 0.80,
      reasoning: 'General question handled via grounded chat and RAG.',
      suggestedCapabilities: ['CHAT', 'DOCUMENT_RAG']
    };
  }
}

export const copilotRouterService = new CopilotRouterService();
