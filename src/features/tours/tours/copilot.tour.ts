import { TourDefinition } from '../tour-types';

export const copilotTour: TourDefinition = {
  id: 'copilot',
  version: 1,
  module: 'Copilot',
  title: 'AI Research & Knowledge Copilot Tour',
  badge: 'Phase 36',
  description: 'Unified AI assistant orchestrating Documents, Research, Workflows, Study Mode, and Memory into single execution sessions.',
  routePattern: '^/copilot',
  steps: [
    {
      id: 'cop-1',
      target: 'data-tour="copilot-header"',
      title: 'Unified AI Copilot',
      description: 'Your intelligent partner that plans and executes complex tasks across all platform modules.',
      icon: '🧠'
    },
    {
      id: 'cop-2',
      target: 'data-tour="copilot-capabilities"',
      title: 'Multimodal Capabilities',
      description: 'Copilot dynamically invokes RAG Search, Agentic Research, Knowledge Graph, Study Mode, and Web Search as needed.',
      icon: '⚡'
    },
    {
      id: 'cop-3',
      target: 'data-tour="copilot-memory-indicator"',
      title: 'User Context Memory',
      description: 'Copilot remembers your preferences, project goals, and past decisions across sessions.',
      icon: '📜'
    }
  ]
};
