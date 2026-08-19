import { TourDefinition } from '../tour-types';

export const dashboardTour: TourDefinition = {
  id: 'dashboard',
  version: 1,
  module: 'Dashboard',
  title: 'Platform Overview Tour',
  badge: 'Core',
  description: 'Explore the main platform dashboard, quick stats, activity feeds, and primary feature gateways.',
  routePattern: '^/(dashboard)?$',
  steps: [
    {
      id: 'dash-1',
      target: 'data-tour="dashboard-header"',
      title: 'Platform Hub',
      description: 'Welcome to Document AI & RAG Platform. Access your workspace stats and active features.',
      icon: '📊'
    },
    {
      id: 'dash-2',
      target: 'data-tour="dashboard-stats"',
      title: 'Real-time Metrics',
      description: 'View total uploaded documents, processed chunks, active knowledge bases, and RAG queries.',
      icon: '📈'
    },
    {
      id: 'dash-3',
      target: 'data-tour="dashboard-quick-actions"',
      title: 'Quick Actions',
      description: 'Quickly upload documents, start RAG chats, launch agentic research, or create learning roadmaps.',
      icon: '⚡'
    },
    {
      id: 'dash-4',
      target: 'data-tour="dashboard-recent-activity"',
      title: 'Recent Activity',
      description: 'Track document processing status, background worker queues, and recent conversation sessions.',
      icon: '📜'
    }
  ]
};
