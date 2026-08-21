import { TourDefinition } from '../tour-types';

export const agenticResearchTour: TourDefinition = {
  id: 'agentic-research',
  version: 1,
  module: 'Agentic Research',
  title: 'Autonomous Agentic Research Tour',
  badge: 'Research',
  description: 'Autonomous multi-source evidence investigation, claim extraction, conflict resolution, and structured report synthesis.',
  routePattern: '^/research',
  steps: [
    {
      id: 'res-1',
      target: 'data-tour="research-header"',
      title: 'Agentic Research Engine',
      description: 'Launch autonomous AI research agents to investigate complex queries across internal documents and live web evidence.',
      icon: '🤖'
    },
    {
      id: 'res-2',
      target: 'data-tour="research-new-btn"',
      title: 'Start Research Session',
      description: 'Specify research goals, topic scope, max iteration budgets, and evidence requirements.',
      icon: '🔬'
    },
    {
      id: 'res-3',
      target: 'data-tour="research-claims"',
      title: 'Claim Extraction & Evidence',
      description: 'Inspect atomic claims extracted by the research agent with supporting citations and confidence scores.',
      icon: '📜'
    },
    {
      id: 'res-4',
      target: 'data-tour="research-report"',
      title: 'Structured Report Synthesis',
      description: 'Export structured markdown reports containing executive summaries, key findings, evidence tables, and citations.',
      icon: '📄'
    }
  ]
};
