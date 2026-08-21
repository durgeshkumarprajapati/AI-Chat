import { TourDefinition } from '../tour-types';

export const workflowsTour: TourDefinition = {
  id: 'workflows',
  version: 1,
  module: 'Workflows',
  title: 'AI Workflow Builder & Automation Engine Tour',
  badge: 'Workflows',
  description: 'Visual drag-and-drop canvas and AI generator for orchestrating Document AI, RAG, Web Search, and Research pipelines.',
  routePattern: '^/workflows',
  steps: [
    {
      id: 'wf-1',
      target: 'data-tour="workflows-header"',
      title: 'Workflow Automation',
      description: 'Build, execute, and monitor multi-step Document AI pipelines with conditional branching and parallel node execution.',
      icon: '🧩'
    },
    {
      id: 'wf-2',
      target: 'data-tour="workflows-ai-generate"',
      title: 'AI Workflow Generator',
      description: 'Describe an automation goal in natural language to generate a complete executable node graph automatically.',
      icon: '✨'
    },
    {
      id: 'wf-3',
      target: 'data-tour="workflows-canvas"',
      title: 'Visual Node Canvas',
      description: 'Connect Document Ingestion, Chunking, Hybrid Search, Reranking, LLM Synthesis, and Web Fetcher nodes visually.',
      icon: '🕸️'
    },
    {
      id: 'wf-4',
      target: 'data-tour="workflows-runs"',
      title: 'Execution Logs & Traces',
      description: 'Monitor live workflow runs, node execution latencies, step outputs, and error diagnostics.',
      icon: '⚙️'
    }
  ]
};
