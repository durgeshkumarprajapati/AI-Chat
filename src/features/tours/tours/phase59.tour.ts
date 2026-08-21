import { TourDefinition } from '../tour-types';

export const phase59ChillFocusTour: TourDefinition = {
  id: 'phase59-chill-focus',
  version: 1,
  module: 'Chill & Focus',
  title: 'AI Chill & Focus Mode Tour',
  badge: 'Productivity',
  description: 'Experience an immersive productivity and wellness environment with animated breathing exercises, ambient soundscapes, and AI study-break suggestions.',
  routePattern: '^/study/chill-focus',
  steps: [
    {
      id: 'cf-1',
      target: 'data-tour="chill-focus-header"',
      title: 'AI Chill & Focus Environment',
      description: 'Switch between Chill Mode for relaxation and Focus Mode for deep work with full accessibility and ambient soundscapes.',
      icon: '🧘'
    },
    {
      id: 'cf-2',
      target: 'data-tour="breathing-guide"',
      title: 'Deterministic Breathing Engine',
      description: 'Follow the 4-phase breathing guide (Breathe In, Hold, Breathe Out, Rest) to relax your mind and reset focus.',
      icon: '💨'
    },
    {
      id: 'cf-3',
      target: 'data-tour="calm-streak"',
      title: 'Calm Streak Gamification',
      description: 'Earn a Calm Streak day every day you complete a qualifying Chill session of 5 minutes or more.',
      icon: '🔥'
    },
    {
      id: 'cf-4',
      target: 'data-tour="soundscapes"',
      title: 'Ambient Soundscapes',
      description: 'Select from 5 calming soundscapes (Night Sky, Ocean, Rain, Forest, Fireplace) with volume and mute controls.',
      icon: '🌊'
    }
  ]
};
