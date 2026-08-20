import { TourDefinition } from '../tour-types';

export const phase50CallHistoryMockLibraryTour: TourDefinition = {
  id: 'phase50-call-history-mock-library-tour',
  module: 'call-history-mock-library',
  title: 'Call History & Mock Test Library Tour',
  description: 'Explore persistent call history logs, chat call event summaries, and the centralized Mock Test & MCQ Library.',
  version: 1,
  routePattern: '^/collab-chat',
  steps: [
    {
      id: 'call-history-header',
      title: 'Persistent Call History',
      description: 'View full log of voice and video calls, duration metrics, and missed call count badges.',
      target: 'data-tour="call-history-header"',
      placement: 'bottom'
    },
    {
      id: 'mock-test-library-header',
      title: 'Centralized Mock Test Library',
      description: 'Discover previous assessment tests, filter by status, search topics, and inspect generated MCQs.',
      target: 'data-tour="mock-test-library-header"',
      placement: 'bottom'
    }
  ]
};
