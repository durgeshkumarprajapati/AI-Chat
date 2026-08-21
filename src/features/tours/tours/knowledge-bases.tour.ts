import { TourDefinition } from '../tour-types';

export const knowledgeBasesTour: TourDefinition = {
  id: 'knowledge-bases',
  version: 1,
  module: 'Knowledge Bases',
  title: 'Knowledge Bases Collections Tour',
  badge: 'Collections',
  description: 'Organize documents into reusable collections without duplicating files or embeddings.',
  routePattern: '^/knowledge-bases',
  steps: [
    {
      id: 'kb-1',
      target: 'data-tour="kb-header"',
      title: 'Knowledge Collections',
      description: 'Group multiple documents into domain-specific collections (e.g. Legal, Research, Engineering).',
      icon: '📚'
    },
    {
      id: 'kb-2',
      target: 'data-tour="kb-create-btn"',
      title: 'Create Collection',
      description: 'Create a new Knowledge Base and assign documents to it without re-embedding text chunks.',
      icon: '➕'
    },
    {
      id: 'kb-3',
      target: 'data-tour="kb-list"',
      title: 'Scoped Retrieval',
      description: 'Select a Knowledge Base during RAG Chat or Copilot execution to restrict retrieval to specific document groups.',
      icon: '🎯'
    }
  ]
};
