import { RegisteredNodeDefinition } from '../workflow.types';

export class WorkflowNodeRegistry {
  private registry: Map<string, RegisteredNodeDefinition> = new Map();

  constructor() {
    this.registerDefaultNodes();
  }

  private registerDefaultNodes() {
    const nodes: RegisteredNodeDefinition[] = [
      // TRIGGERS
      {
        type: 'MANUAL',
        version: 1,
        label: 'Manual Trigger',
        description: 'Triggers workflow execution manually via user action or API.',
        category: 'TRIGGERS',
        inputSchema: {},
        outputSchema: { triggerTime: 'string' },
        configSchema: {}
      },
      {
        type: 'DOCUMENT_UPLOADED',
        version: 1,
        label: 'Document Uploaded',
        description: 'Triggers workflow execution when a new document is uploaded.',
        category: 'TRIGGERS',
        inputSchema: { documentId: 'string' },
        outputSchema: { documentId: 'string', filename: 'string' },
        configSchema: { fileTypes: 'array' }
      },
      {
        type: 'SCHEDULED',
        version: 1,
        label: 'Scheduled Trigger',
        description: 'Triggers workflow execution on a recurring cron schedule.',
        category: 'TRIGGERS',
        inputSchema: {},
        outputSchema: { triggerTime: 'string' },
        configSchema: { cronExpression: 'string' }
      },
      {
        type: 'WEBHOOK',
        version: 1,
        label: 'Webhook Trigger',
        description: 'Triggers workflow execution via an authenticated incoming HTTP webhook.',
        category: 'TRIGGERS',
        inputSchema: { payload: 'object' },
        outputSchema: { payload: 'object' },
        configSchema: { secret: 'string' }
      },

      // DATA
      {
        type: 'GET_DOCUMENT',
        version: 1,
        label: 'Get Document',
        description: 'Retrieves metadata and content for a specific uploaded document.',
        category: 'DATA',
        inputSchema: { documentId: 'string' },
        outputSchema: { documentId: 'string', text: 'string', filename: 'string' },
        configSchema: { documentId: 'string' },
        permissions: ['DOCUMENT_READ']
      },
      {
        type: 'SEARCH_DOCUMENTS',
        version: 1,
        label: 'Search Documents',
        description: 'Searches authorized uploaded documents using vector & keyword hybrid search.',
        category: 'DATA',
        inputSchema: { query: 'string' },
        outputSchema: { chunks: 'array', evidence: 'string' },
        configSchema: { query: 'string', topK: 'number' },
        permissions: ['DOCUMENT_READ']
      },
      {
        type: 'SEARCH_KNOWLEDGE_BASE',
        version: 1,
        label: 'Search Knowledge Base',
        description: 'Searches an authorized Knowledge Base.',
        category: 'DATA',
        inputSchema: { query: 'string' },
        outputSchema: { chunks: 'array', evidence: 'string' },
        configSchema: { knowledgeBaseId: 'string', query: 'string' },
        permissions: ['KB_READ']
      },
      {
        type: 'WEB_SEARCH',
        version: 1,
        label: 'Web Search',
        description: 'Performs live web search with SSRF validation and robots policy adherence.',
        category: 'DATA',
        inputSchema: { query: 'string' },
        outputSchema: { results: 'array', evidence: 'string' },
        configSchema: { query: 'string', maxResults: 'number' }
      },

      // AI
      {
        type: 'AI_ANSWER',
        version: 1,
        label: 'AI Answer',
        description: 'Generates a grounded AI response using provided context or document evidence.',
        category: 'AI',
        inputSchema: { question: 'string', context: 'string' },
        outputSchema: { answer: 'string' },
        configSchema: { prompt: 'string' }
      },
      {
        type: 'AI_EXTRACT',
        version: 1,
        label: 'AI Data Extraction',
        description: 'Extracts structured JSON fields (vendor, amount, date, etc.) from document text.',
        category: 'AI',
        inputSchema: { text: 'string' },
        outputSchema: { extractedData: 'object' },
        configSchema: { schema: 'object' }
      },
      {
        type: 'AI_CLASSIFY',
        version: 1,
        label: 'AI Classification',
        description: 'Classifies text or documents into specified categories.',
        category: 'AI',
        inputSchema: { text: 'string' },
        outputSchema: { category: 'string', confidence: 'number' },
        configSchema: { categories: 'array' }
      },
      {
        type: 'AI_SUMMARIZE',
        version: 1,
        label: 'AI Summarize',
        description: 'Generates a concise summary of text or retrieved evidence.',
        category: 'AI',
        inputSchema: { text: 'string' },
        outputSchema: { summary: 'string' },
        configSchema: { length: 'string' }
      },
      {
        type: 'AI_COMPARE',
        version: 1,
        label: 'AI Compare',
        description: 'Compares two or more documents or evidence blocks to detect discrepancies.',
        category: 'AI',
        inputSchema: { itemA: 'string', itemB: 'string' },
        outputSchema: { comparison: 'string', discrepancies: 'array' },
        configSchema: {}
      },
      {
        type: 'AI_GENERATE',
        version: 1,
        label: 'AI Content Generation',
        description: 'Generates content, reports, or articles from structured inputs.',
        category: 'AI',
        inputSchema: { prompt: 'string' },
        outputSchema: { content: 'string' },
        configSchema: { template: 'string' }
      },

      // LOGIC
      {
        type: 'CONDITION',
        version: 1,
        label: 'Condition (If/Else)',
        description: 'Branches workflow execution based on a boolean expression evaluation.',
        category: 'LOGIC',
        inputSchema: { value: 'any' },
        outputSchema: { branch: 'string' },
        configSchema: { expression: 'string' }
      },
      {
        type: 'SWITCH',
        version: 1,
        label: 'Switch Case',
        description: 'Branches workflow execution into multiple paths based on a key value.',
        category: 'LOGIC',
        inputSchema: { key: 'string' },
        outputSchema: { branch: 'string' },
        configSchema: { cases: 'array' }
      },
      {
        type: 'LOOP',
        version: 1,
        label: 'For Each Loop',
        description: 'Iterates through an array with a hard iteration limit (max 20 iterations).',
        category: 'LOGIC',
        inputSchema: { items: 'array' },
        outputSchema: { item: 'any', index: 'number' },
        configSchema: { maxIterations: 'number' }
      },
      {
        type: 'FILTER',
        version: 1,
        label: 'Filter Array',
        description: 'Filters items in an array based on a condition.',
        category: 'LOGIC',
        inputSchema: { items: 'array' },
        outputSchema: { filteredItems: 'array' },
        configSchema: { condition: 'string' }
      },
      {
        type: 'MERGE',
        version: 1,
        label: 'Merge Branches',
        description: 'Combines multiple execution paths into a single output flow.',
        category: 'LOGIC',
        inputSchema: { branchA: 'any', branchB: 'any' },
        outputSchema: { merged: 'any' },
        configSchema: {}
      },

      // DOCUMENT
      {
        type: 'EXTRACT_TEXT',
        version: 1,
        label: 'Extract Document Text',
        description: 'Parses raw text from PDF, DOCX, or text files.',
        category: 'DOCUMENT',
        inputSchema: { documentId: 'string' },
        outputSchema: { text: 'string' },
        configSchema: {}
      },
      {
        type: 'EXTRACT_TABLE',
        version: 1,
        label: 'Extract Document Table',
        description: 'Extracts tabular structures from document pages using multimodal parsing.',
        category: 'DOCUMENT',
        inputSchema: { documentId: 'string' },
        outputSchema: { tables: 'array' },
        configSchema: { pageNumber: 'number' }
      },
      {
        type: 'ANALYZE_IMAGE',
        version: 1,
        label: 'Analyze Visual Image',
        description: 'Analyzes visual diagrams or images using vision model.',
        category: 'DOCUMENT',
        inputSchema: { documentId: 'string', visualId: 'string' },
        outputSchema: { description: 'string' },
        configSchema: {}
      },
      {
        type: 'ANALYZE_CHART',
        version: 1,
        label: 'Analyze Chart / Graph',
        description: 'Extracts data points and insights from visual charts or graphs.',
        category: 'DOCUMENT',
        inputSchema: { documentId: 'string', visualId: 'string' },
        outputSchema: { chartData: 'object' },
        configSchema: {}
      },

      // RESEARCH
      {
        type: 'START_RESEARCH',
        version: 1,
        label: 'Start Agentic Research',
        description: 'Invokes Phase 34 Agentic Research with source boundaries.',
        category: 'RESEARCH',
        inputSchema: { question: 'string' },
        outputSchema: { researchReport: 'string', sessionId: 'string' },
        configSchema: { mode: 'string' }
      },
      {
        type: 'RESEARCH_SUMMARY',
        version: 1,
        label: 'Research Summary',
        description: 'Generates executive summary of an existing research session.',
        category: 'RESEARCH',
        inputSchema: { researchSessionId: 'string' },
        outputSchema: { summary: 'string' },
        configSchema: {}
      },

      // OUTPUT
      {
        type: 'SAVE_RESULT',
        version: 1,
        label: 'Save Execution Result',
        description: 'Persists workflow output data into user workspace.',
        category: 'OUTPUT',
        inputSchema: { result: 'any' },
        outputSchema: { savedId: 'string' },
        configSchema: { key: 'string' }
      },
      {
        type: 'CREATE_DOCUMENT',
        version: 1,
        label: 'Create Output Document',
        description: 'Creates a new PDF or Markdown document from workflow output.',
        category: 'OUTPUT',
        inputSchema: { content: 'string', filename: 'string' },
        outputSchema: { documentId: 'string' },
        configSchema: { format: 'string' }
      },
      {
        type: 'SEND_NOTIFICATION',
        version: 1,
        label: 'Send Notification',
        description: 'Sends an in-app notification or log update to user.',
        category: 'OUTPUT',
        inputSchema: { message: 'string' },
        outputSchema: { delivered: 'boolean' },
        configSchema: { level: 'string' }
      },

      // CONTROL
      {
        type: 'DELAY',
        version: 1,
        label: 'Delay Execution',
        description: 'Pauses workflow execution for specified milliseconds.',
        category: 'CONTROL',
        inputSchema: {},
        outputSchema: {},
        configSchema: { delayMs: 'number' }
      },
      {
        type: 'END',
        version: 1,
        label: 'End Workflow',
        description: 'Concludes workflow execution and returns output.',
        category: 'CONTROL',
        inputSchema: { output: 'any' },
        outputSchema: { finalOutput: 'any' },
        configSchema: {}
      },

      // KNOWLEDGE GRAPH NODES
      {
        type: 'KNOWLEDGE_GRAPH_EXTRACT',
        version: 1,
        label: 'Extract Knowledge Graph',
        description: 'Extracts entities, relationships, and claims from text chunk or document.',
        category: 'AI',
        inputSchema: { documentId: 'string' },
        outputSchema: { entitiesCount: 'number', relationshipsCount: 'number' },
        configSchema: {}
      },
      {
        type: 'KNOWLEDGE_GRAPH_SEARCH',
        version: 1,
        label: 'Search Knowledge Graph',
        description: 'Performs multi-hop graph search and entity neighborhood retrieval.',
        category: 'AI',
        inputSchema: { query: 'string' },
        outputSchema: { nodesCount: 'number', edgesCount: 'number' },
        configSchema: { depth: 'number' }
      },
      {
        type: 'KNOWLEDGE_GRAPH_UPDATE',
        version: 1,
        label: 'Update Knowledge Graph',
        description: 'Updates entity canonical attributes or status.',
        category: 'AI',
        inputSchema: { entityId: 'string', status: 'string' },
        outputSchema: { updated: 'boolean' },
        configSchema: {}
      },
      {
        type: 'KNOWLEDGE_CONFLICT_CHECK',
        version: 1,
        label: 'Check Knowledge Conflicts',
        description: 'Identifies conflicting claims across document evidence.',
        category: 'AI',
        inputSchema: {},
        outputSchema: { conflictsCount: 'number' },
        configSchema: {}
      }
    ];

    for (const node of nodes) {
      this.registry.set(node.type, node);
    }
  }

  public getNode(type: string): RegisteredNodeDefinition | undefined {
    return this.registry.get(type);
  }

  public listNodes(): RegisteredNodeDefinition[] {
    return Array.from(this.registry.values());
  }

  public isRegistered(type: string): boolean {
    return this.registry.has(type);
  }
}

export const workflowNodeRegistry = new WorkflowNodeRegistry();
