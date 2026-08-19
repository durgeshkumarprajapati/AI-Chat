import { TourDefinition } from '../tour-types';

export const copilotMemoryTour: TourDefinition = {
  id: 'copilot-memory',
  version: 1,
  module: 'Copilot Memory',
  title: 'Copilot Memory Settings Tour',
  badge: 'Phase 36',
  description: 'Inspect, edit, or purge user memory items retained by AI Copilot across sessions.',
  routePattern: '^/settings/copilot-memory',
  steps: [
    {
      id: 'mem-1',
      target: 'data-tour="memory-header"',
      title: 'Copilot Memory Settings',
      description: 'Manage persistent facts, preferences, and workspace context stored by AI Copilot.',
      icon: '🧠'
    },
    {
      id: 'mem-2',
      target: 'data-tour="memory-list"',
      title: 'Memory Entries',
      description: 'Review individual memory entries, key-value context, and confidence scores.',
      icon: '📜'
    },
    {
      id: 'mem-3',
      target: 'data-tour="memory-clear-btn"',
      title: 'Memory Control & Purge',
      description: 'Delete individual entries or clear your copilot memory completely for full privacy control.',
      icon: '🗑️'
    }
  ]
};
