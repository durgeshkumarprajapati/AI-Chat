import { TourDefinition } from '../tour-types';

export const roadmapTour: TourDefinition = {
  id: 'roadmap',
  version: 1,
  module: 'Roadmaps',
  title: 'AI Roadmap Builder Tour',
  badge: 'Phase 31',
  description: 'Generate personalized learning roadmaps with guided questionnaires, task progress tracking, and phase regeneration.',
  routePattern: '^/roadmaps',
  steps: [
    {
      id: 'rm-1',
      target: 'data-tour="roadmaps-header"',
      title: 'Personal Learning Paths',
      description: 'Create customized multi-phase skill roadmaps tailored to your career goals and current knowledge level.',
      icon: '🚀'
    },
    {
      id: 'rm-2',
      target: 'data-tour="roadmaps-new-btn"',
      title: 'Generate Roadmap',
      description: 'Fill out a guided wizard to specify your learning goal, target timeframe, and preferred study pace.',
      icon: '🎯'
    },
    {
      id: 'rm-3',
      target: 'data-tour="roadmaps-phases"',
      title: 'Phases & Task Tracking',
      description: 'Mark tasks as completed, regenerate specific phases, and view estimated completion timelines.',
      icon: '✅'
    }
  ]
};
