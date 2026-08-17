import { ResearchToolDefinition } from '../research.types';

export class ResearchToolRegistry {
  private tools: Map<string, ResearchToolDefinition> = new Map();

  constructor() {
    this.registerDefaultTools();
  }

  private registerDefaultTools() {
    this.registerTool({
      name: 'searchWeb',
      description: 'Performs live web search for public evidence.',
      inputSchema: { query: 'string' },
      timeoutMs: 10000
    });

    this.registerTool({
      name: 'searchDocuments',
      description: 'Searches authorized uploaded documents.',
      inputSchema: { query: 'string', documentIds: 'array' },
      timeoutMs: 10000
    });

    this.registerTool({
      name: 'searchKnowledgeBase',
      description: 'Searches an authorized Knowledge Base.',
      inputSchema: { query: 'string', knowledgeBaseId: 'string' },
      timeoutMs: 10000
    });

    this.registerTool({
      name: 'fetchWebPage',
      description: 'Fetches content from a specific web URL.',
      inputSchema: { url: 'string' },
      timeoutMs: 10000
    });

    this.registerTool({
      name: 'inspectVisual',
      description: 'Analyzes visual charts, tables, or diagrams in documents.',
      inputSchema: { query: 'string', documentId: 'string' },
      timeoutMs: 10000
    });

    this.registerTool({
      name: 'compareEvidence',
      description: 'Compares evidence items to extract claims.',
      inputSchema: {},
      timeoutMs: 10000
    });

    this.registerTool({
      name: 'detectConflicts',
      description: 'Detects contradictions or numeric/date disagreements across claims.',
      inputSchema: {},
      timeoutMs: 10000
    });

    this.registerTool({
      name: 'finishResearch',
      description: 'Concludes research and synthesizes final report.',
      inputSchema: {},
      timeoutMs: 10000
    });
  }

  public registerTool(def: ResearchToolDefinition) {
    this.tools.set(def.name, def);
  }

  public getTool(name: string): ResearchToolDefinition | undefined {
    return this.tools.get(name);
  }

  public listTools(): ResearchToolDefinition[] {
    return Array.from(this.tools.values());
  }
}

export const researchToolRegistry = new ResearchToolRegistry();
