import { TourDefinition } from '../tour-types';

export const studyTour: TourDefinition = {
  id: 'study',
  version: 1,
  module: 'AI Study Mode',
  title: 'AI Study Mode & Tutor Workspace Tour',
  badge: 'Phase 33',
  description: 'Interactive AI tutor workspace with Socratic questioning, quizzes, flashcards, practice code exercises, and mastery tracking.',
  routePattern: '^/study',
  steps: [
    {
      id: 'study-1',
      target: 'data-tour="study-header"',
      title: 'AI Study Workspace',
      description: 'Master any topic using document-grounded adaptive learning modes and real-time AI tutor feedback.',
      icon: '🎓'
    },
    {
      id: 'study-2',
      target: 'data-tour="study-new-session"',
      title: 'Start Learning Session',
      description: 'Create a study session scoped to your documents or a custom subject of interest.',
      icon: '🚀'
    },
    {
      id: 'study-3',
      target: 'data-tour="study-modes"',
      title: 'Adaptive Learning Modes',
      description: 'Switch between Socratic Dialogue, Practice Code Exercises, Interactive Quizzes, and Spaced Flashcards.',
      icon: '🧩'
    },
    {
      id: 'study-4',
      target: 'data-tour="study-progress"',
      title: 'Mastery & Weak Areas',
      description: 'Track topic mastery percentages, review weak areas, and receive personalized learning recommendations.',
      icon: '📈'
    }
  ]
};
