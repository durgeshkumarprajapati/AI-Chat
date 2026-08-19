import { TourDefinition } from '../tour-types';

export const ragChatTour: TourDefinition = {
  id: 'rag-chat',
  version: 1,
  module: 'RAG Chat',
  title: 'Streaming RAG Chat Tour',
  badge: 'Phase 13',
  description: 'Ask questions with real-time progressive response streaming, source mode selection, and citation badges.',
  routePattern: '^/chat',
  steps: [
    {
      id: 'chat-1',
      target: 'data-tour="chat-header"',
      title: 'Streaming RAG Chat',
      description: 'Interact with your uploaded documents using low-latency streaming RAG powered by Gemini and hybrid retrieval.',
      icon: '💬'
    },
    {
      id: 'chat-2',
      target: 'data-tour="chat-source-selector"',
      title: 'Source Mode Selector',
      description: 'Choose whether to query your private Documents, trusted Web sources, or Both simultaneously.',
      icon: '🔀'
    },
    {
      id: 'chat-3',
      target: 'data-tour="chat-input"',
      title: 'Question Input & STT Voice',
      description: 'Type your question or click the microphone button to speak your query using browser Speech-to-Text.',
      icon: '🎤'
    },
    {
      id: 'chat-4',
      target: 'data-tour="chat-citations"',
      title: 'Interactive Evidence & Citations',
      description: 'Inspect exact document page numbers, web URLs, similarity scores, and evidence confidence levels.',
      icon: '🔍'
    }
  ]
};
