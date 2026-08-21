import { TourDefinition } from '../tour-types';

export const phase58VoiceTutorTour: TourDefinition = {
  id: 'phase58-voice-tutor',
  version: 1,
  module: 'AI Voice Tutor',
  title: 'AI Voice Tutor Tour',
  badge: 'Voice AI',
  description: 'Engage in natural voice tutoring conversations with instant speech-to-text, document evidence grounding, and post-session learning feedback.',
  routePattern: '^/study/voice-tutor',
  steps: [
    {
      id: 'vt-1',
      target: 'data-tour="voice-tutor-header"',
      title: 'AI Voice Tutor Engine',
      description: 'Engage in natural, interactive voice tutoring powered by speech-to-text, Gemini LLM reasoning, RAG document evidence, and text-to-speech.',
      icon: '🎤'
    },
    {
      id: 'vt-2',
      target: 'data-tour="voice-tutor-mic"',
      title: 'Microphone & Speech Control',
      description: 'Click to start speaking. Click again to finish, or click while AI is speaking to interrupt / barge in and ask a new question.',
      icon: '🔴'
    },
    {
      id: 'vt-3',
      target: 'data-tour="voice-tutor-transcript"',
      title: 'Realtime Transcript & Grounding',
      description: 'Inspect your transcribed spoken query, RAG document grounding citations, Knowledge Graph entity badges, and AI text responses.',
      icon: '📜'
    },
    {
      id: 'vt-4',
      target: 'data-tour="voice-tutor-summary"',
      title: 'Post-Session Feedback & Quizzes',
      description: 'Receive detailed AI learning analytics upon session completion, including understanding scores, key concepts, strengths, and recommended practice quizzes.',
      icon: '📊'
    }
  ]
};
