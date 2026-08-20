import { TourDefinition } from '../tour-types';

export const phase49MockTestCallingTour: TourDefinition = {
  id: 'phase49-mock-tests-calling-tour',
  module: 'mock-tests-calling',
  title: 'Scheduled AI Mock Tests & Realtime Calling Tour',
  description: 'Learn how to schedule AI mock tests with Gemini, sync Google Calendar, share tests in chat, and use WebRTC Voice/Video calling.',
  version: 1,
  routePattern: '^/collab-chat',
  steps: [
    {
      id: 'mock-test-intro',
      title: 'Scheduled AI Mock Tests',
      description: 'Generate 4-option MCQ tests using Gemini, schedule start times, and sync events directly with Google Calendar.',
      target: 'data-tour="collab-header"',
      placement: 'bottom'
    },
    {
      id: 'voice-call-trigger',
      title: 'Voice Calling',
      description: 'Start high-quality WebRTC Voice Calls in DMs or Group channels with active call controls (mute/unmute).',
      target: 'data-tour="collab-voice-call-btn"',
      placement: 'bottom'
    },
    {
      id: 'video-call-trigger',
      title: 'Video Calling',
      description: 'Initiate WebRTC Video Calls with screen sharing, participant grid, and incoming call ringing overlays.',
      target: 'data-tour="collab-video-call-btn"',
      placement: 'bottom'
    }
  ]
};
