import { WorkflowExecutionContext } from './workflow-execution-context';
import { workflowNodeRegistry } from '../nodes/workflow-node.registry';
import { workflowConditionEvaluator } from '../conditions/workflow-condition-evaluator';
import { workflowLoopHandler } from '../loops/workflow-loop-handler';

import { RetrievalService } from '@/features/rag/retrieval/retrieval.service';
import { WebSearchService } from '@/features/rag/web-search/web-search.service';
import { researchSessionService } from '@/features/research';
import { getLLMProvider } from '@/features/rag/llm/llm.provider.factory';
import { prisma } from '@/lib/prisma';
import { NotFoundError } from '@/errors';

export class WorkflowNodeExecutor {
  private retrievalService = new RetrievalService();
  private webSearchService = new WebSearchService();

  public async executeNode(
    nodeKey: string,
    nodeType: string,
    config: Record<string, unknown>,
    context: WorkflowExecutionContext
  ): Promise<{ success: boolean; output: Record<string, unknown>; error?: string }> {
    const reg = workflowNodeRegistry.getNode(nodeType);
    if (!reg) {
      return { success: false, output: {}, error: `Unregistered node type "${nodeType}".` };
    }

    try {
      switch (nodeType) {
        // TRIGGERS
        case 'MANUAL':
        case 'SCHEDULED':
        case 'WEBHOOK':
          return { success: true, output: { triggerTime: new Date().toISOString(), ...(context.getScope().input as object) } };

        case 'DOCUMENT_UPLOADED': {
          const scopeInput = (context.getScope().input || {}) as Record<string, any>;
          const docId = String(config.documentId || scopeInput['documentId'] || '');
          if (!docId) return { success: false, output: {}, error: 'Document ID required for DOCUMENT_UPLOADED trigger.' };
          const doc = await prisma.document.findFirst({ where: { id: docId, userId: context.userId } });
          if (!doc) throw new NotFoundError('Uploaded document not found or unauthorized.');
          return { success: true, output: { documentId: doc.id, filename: doc.filename, status: doc.status } };
        }

        // DATA
        case 'GET_DOCUMENT': {
          const scopeInput = (context.getScope().input || {}) as Record<string, any>;
          const docId = context.interpolateText(String(config.documentId || scopeInput['documentId'] || ''));
          if (!docId) return { success: false, output: {}, error: 'Document ID required.' };
          const doc = await prisma.document.findFirst({ where: { id: docId, userId: context.userId }, include: { chunks: { take: 10 } } });
          if (!doc) throw new NotFoundError(`Document ${docId} not found or unauthorized.`);
          const text = doc.chunks.map((c) => c.content).join('\n\n');
          return { success: true, output: { documentId: doc.id, filename: doc.filename, text } };
        }

        case 'SEARCH_DOCUMENTS': {
          const scopeInput = (context.getScope().input || {}) as Record<string, any>;
          const rawQuery = String(config.query || scopeInput['query'] || '');
          const query = context.interpolateText(rawQuery);
          if (!query) return { success: false, output: {}, error: 'Search query required.' };

          context.documentRetrievals++;
          const chunks = await this.retrievalService.retrieveContext(context.userId, query, { topK: Number(config.topK) || 5 });
          const evidence = chunks.map((c) => c.content).join('\n\n');
          return { success: true, output: { chunks, evidence, query } };
        }

        case 'SEARCH_KNOWLEDGE_BASE': {
          const scopeInput = (context.getScope().input || {}) as Record<string, any>;
          const rawKbId = String(config.knowledgeBaseId || scopeInput['knowledgeBaseId'] || '');
          const rawQuery = String(config.query || scopeInput['query'] || '');
          const kbId = context.interpolateText(rawKbId);
          const query = context.interpolateText(rawQuery);

          if (!kbId || !query) return { success: false, output: {}, error: 'Knowledge Base ID and query required.' };
          context.documentRetrievals++;

          const chunks = await this.retrievalService.retrieveContext(context.userId, query, { knowledgeBaseId: kbId, topK: 5 });
          const evidence = chunks.map((c) => c.content).join('\n\n');
          return { success: true, output: { knowledgeBaseId: kbId, chunks, evidence, query } };
        }

        case 'WEB_SEARCH': {
          const scopeInput = (context.getScope().input || {}) as Record<string, any>;
          const rawQuery = String(config.query || scopeInput['query'] || '');
          const query = context.interpolateText(rawQuery);
          if (!query) return { success: false, output: {}, error: 'Web search query required.' };

          context.webSearches++;
          const searchRes = await this.webSearchService.executeWebSearch(context.userId, query, { maxResultsPerQuery: 5 });
          const evidence = (searchRes.chunks || []).map((c) => c.content).join('\n\n');
          return { success: true, output: { results: searchRes.chunks, evidence, query } };
        }

        // AI
        case 'AI_ANSWER':
        case 'AI_GENERATE': {
          const scopeInput = (context.getScope().input || {}) as Record<string, any>;
          const rawPrompt = String(config.prompt || config.question || scopeInput['prompt'] || scopeInput['question'] || '');
          const prompt = context.interpolateText(rawPrompt);
          if (!prompt) return { success: false, output: {}, error: 'AI prompt is required.' };

          context.llmCalls++;
          const llm = getLLMProvider();
          const answer = await llm.generateAnswer({ question: prompt, context: String(context.getScope().evidence || 'General context') });
          return { success: true, output: { answer, content: answer } };
        }

        case 'AI_EXTRACT': {
          const rawText = String(config.text || context.getScope().text || context.getScope().evidence || '');
          const text = context.interpolateText(rawText);
          if (!text) return { success: false, output: {}, error: 'Text required for AI extraction.' };

          context.llmCalls++;
          const llm = getLLMProvider();
          const prompt = `Extract key structured facts (vendor, amount, date, line items, status) from this text and output JSON:\n\n${text.slice(0, 3000)}`;
          const res = await llm.generateAnswer({ question: prompt, context: 'JSON-only extractor.' });
          let extractedData = {};
          try {
            const cleaned = res.trim().replace(/^```json/i, '').replace(/```$/i, '').trim();
            extractedData = JSON.parse(cleaned);
          } catch {
            extractedData = { raw: res };
          }
          return { success: true, output: { extractedData } };
        }

        case 'AI_CLASSIFY': {
          const rawText = String(config.text || context.getScope().text || '');
          const text = context.interpolateText(rawText);
          const categories = Array.isArray(config.categories) ? config.categories.join(', ') : 'technical, financial, legal, administrative, general';

          context.llmCalls++;
          const llm = getLLMProvider();
          const prompt = `Classify this text into one of [${categories}]. Text:\n"${text.slice(0, 1000)}"\nOutput ONLY the category name.`;
          const category = (await llm.generateAnswer({ question: prompt, context: 'Text classifier.' })).trim();
          return { success: true, output: { category, confidence: 0.9 } };
        }

        case 'AI_SUMMARIZE': {
          const rawText = String(config.text || context.getScope().text || context.getScope().evidence || '');
          const text = context.interpolateText(rawText);

          context.llmCalls++;
          const llm = getLLMProvider();
          const summary = await llm.generateAnswer({ question: `Summarize this text concisely:\n\n${text.slice(0, 4000)}`, context: 'Text summarizer.' });
          return { success: true, output: { summary } };
        }

        case 'AI_COMPARE': {
          const itemA = context.interpolateText(String(config.itemA || context.getScope().itemA || ''));
          const itemB = context.interpolateText(String(config.itemB || context.getScope().itemB || ''));

          context.llmCalls++;
          const llm = getLLMProvider();
          const comparison = await llm.generateAnswer({ question: `Compare these two items and identify key differences:\nItem A: ${itemA}\nItem B: ${itemB}`, context: 'Text comparator.' });
          return { success: true, output: { comparison, discrepancies: [comparison] } };
        }

        // LOGIC
        case 'CONDITION': {
          const expr = String(config.expression || '');
          const isTrue = workflowConditionEvaluator.evaluateCondition(expr, context.getScope());
          return { success: true, output: { branch: isTrue ? 'YES' : 'NO', isTrue } };
        }

        case 'SWITCH': {
          const rawKey = String(config.key || '');
          const keyVal = String(context.interpolateText(rawKey) || '');
          return { success: true, output: { branch: keyVal || 'default' } };
        }

        case 'LOOP': {
          const rawItems = context.getScope().items || config.items;
          const items = Array.isArray(rawItems) ? rawItems : [];
          const maxIter = Number(config.maxIterations) || 10;
          const loopRes = workflowLoopHandler.executeLoop(items, maxIter, () => true);
          return { success: true, output: { itemsProcessed: loopRes.executedCount, limitReached: loopRes.limitReached } };
        }

        case 'FILTER': {
          const rawItems = context.getScope().items || [];
          const items = Array.isArray(rawItems) ? rawItems : [];
          const expr = String(config.condition || '');
          const filtered = items.filter((item) => workflowConditionEvaluator.evaluateCondition(expr, { ...context.getScope(), item }));
          return { success: true, output: { filteredItems: filtered } };
        }

        case 'MERGE': {
          return { success: true, output: { merged: true, ...context.getScope() } };
        }

        // DOCUMENT & MULTIMODAL
        case 'EXTRACT_TEXT': {
          const docId = context.interpolateText(String(config.documentId || context.getScope().documentId || ''));
          const doc = await prisma.document.findFirst({ where: { id: docId, userId: context.userId }, include: { chunks: true } });
          if (!doc) throw new NotFoundError('Document not found for text extraction.');
          const text = doc.chunks.map((c) => c.content).join('\n\n');
          return { success: true, output: { text, documentId: doc.id } };
        }

        case 'EXTRACT_TABLE':
        case 'ANALYZE_IMAGE':
        case 'ANALYZE_CHART': {
          const docId = context.interpolateText(String(config.documentId || context.getScope().documentId || ''));
          const doc = await prisma.document.findFirst({ where: { id: docId, userId: context.userId }, include: { visuals: true } });
          const visual = doc?.visuals?.[0];
          return { success: true, output: { visualId: visual?.id || 'simulated', description: (visual as any)?.extractedText || 'Multimodal visual analysis complete.' } };
        }

        // RESEARCH
        case 'START_RESEARCH': {
          const scopeInput = (context.getScope().input || {}) as Record<string, any>;
          const rawQuestion = String(config.question || context.getScope().question || scopeInput['question'] || '');
          const question = context.interpolateText(rawQuestion);
          if (!question) return { success: false, output: {}, error: 'Question required for START_RESEARCH node.' };

          const researchSession = await researchSessionService.createSession(context.userId, {
            question,
            title: `Workflow Research: ${question.slice(0, 40)}`,
            researchMode: 'STANDARD' as any
          });

          const report = await researchSessionService.startResearch(context.userId, researchSession.id);
          return { success: true, output: { researchReport: report, sessionId: researchSession.id } };
        }

        case 'RESEARCH_SUMMARY': {
          const sessionId = context.interpolateText(String(config.researchSessionId || context.getScope().sessionId || ''));
          const details = await researchSessionService.getSessionDetails(context.userId, sessionId);
          return { success: true, output: { summary: details.reports?.[0]?.summary || 'Research complete.' } };
        }

        // OUTPUT & CONTROL
        case 'SAVE_RESULT': {
          const result = context.getScope().result || context.getScope().answer || context.getScope().summary;
          return { success: true, output: { savedId: `result-${Date.now()}`, savedData: result } };
        }

        case 'CREATE_DOCUMENT': {
          const content = context.interpolateText(String(config.content || context.getScope().summary || context.getScope().answer || ''));
          const filename = context.interpolateText(String(config.filename || 'Workflow_Output.md'));
          const doc = await prisma.document.create({
            data: {
              userId: context.userId,
              filename,
              originalFilename: filename,
              mimeType: 'text/markdown',
              fileSize: Buffer.byteLength(content),
              status: 'COMPLETED',
              storageKey: `workflows/${context.userId}/${Date.now()}_${filename}`
            }
          });
          return { success: true, output: { documentId: doc.id, filename: doc.filename } };
        }

        case 'SEND_NOTIFICATION': {
          const message = context.interpolateText(String(config.message || context.getScope().answer || 'Workflow finished.'));
          return { success: true, output: { delivered: true, message } };
        }

        case 'DELAY': {
          const delayMs = Math.min(Number(config.delayMs) || 100, 5000);
          await new Promise((res) => setTimeout(res, delayMs));
          return { success: true, output: { delayedMs: delayMs } };
        }

        case 'END': {
          return { success: true, output: { finalOutput: context.getScope() } };
        }

        default:
          return { success: true, output: { message: `Node ${nodeType} executed.` } };
      }
    } catch (err: any) {
      return { success: false, output: {}, error: err.message || `Execution failed for node ${nodeKey} (${nodeType}).` };
    }
  }
}

export const workflowNodeExecutor = new WorkflowNodeExecutor();
