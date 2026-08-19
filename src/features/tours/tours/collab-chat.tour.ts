import { TourDefinition } from '../tour-types';

export const collabChatTour: TourDefinition = {
  id: 'collab-chat-tour',
  module: 'collab-chat',
  title: 'Real-Time Collaboration Tour',
  description: 'Learn how to chat in real-time, create group discussions, share roadmaps, and interact with Gemini AI.',
  version: 1,
  routePattern: '^/collab-chat',
  steps: [
    {
      id: 'collab-intro',
      title: 'Real-Time Collab Workspace',
      description: 'Welcome to Collab Chat! Have 1-to-1 discussions, create group channels, and share knowledge assets.',
      target: 'data-tour="collab-header"',
      placement: 'bottom'
    },
    {
      id: 'collab-channels',
      title: 'Conversations & Search',
      description: 'Browse your active DMs and group discussions or search through past message content.',
      target: 'data-tour="collab-channels-list"',
      placement: 'right'
    },
    {
      id: 'collab-feed',
      title: 'Live Message Feed',
      description: 'Send instant messages, quote thread replies, edit/delete messages, and view checkmark read status.',
      target: 'data-tour="collab-message-feed"',
      placement: 'top'
    },
    {
      id: 'collab-share',
      title: 'Share Workspace Assets',
      description: 'Share AI Roadmaps, Knowledge Graph entities, Documents, and Study questions directly inside messages.',
      target: 'data-tour="collab-share-asset-btn"',
      placement: 'left'
    },
    {
      id: 'collab-ai-bot',
      title: 'Gemini @ai Discussion Bot',
      description: 'Type @ai or click the @ai shortcut to ask Gemini AI questions right inside group discussions.',
      target: 'data-tour="collab-input-box"',
      placement: 'top'
    },
    {
      id: 'collab-notifications',
      title: 'Realtime Notification Center',
      description: 'View instant bell alerts for new messages, mentions, role updates, and shared roadmaps with custom preferences.',
      target: 'data-tour="notification-center"',
      placement: 'left'
    }
  ]
};
