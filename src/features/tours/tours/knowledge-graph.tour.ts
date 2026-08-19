import { TourDefinition } from '../tour-types';

export const knowledgeGraphTour: TourDefinition = {
  id: 'knowledge-graph',
  version: 1,
  module: 'Knowledge Graph',
  title: 'AI Knowledge Graph Guided Tour',
  badge: 'Phase 41',
  description: 'Learn how document evidence is converted into connected entities, relationships, claims, and contradictions.',
  routePattern: '^/knowledge-graph',
  steps: [
    {
      id: 'step-1-header',
      target: 'data-tour="knowledge-graph-header"',
      title: '1. AI Knowledge Graph',
      description: 'The Knowledge Graph converts information from your authorized documents into connected entities, relationships, claims, and evidence.',
      technicalDetails: 'KnowledgeGraphService • Document chunk evidence extraction • Multi-hop expansion',
      icon: '🌐',
      placement: 'bottom'
    },
    {
      id: 'step-2-search',
      target: 'data-tour="knowledge-graph-search"',
      title: '2. Search the Knowledge Graph',
      description: 'Search for concepts, entities, organizations, locations, people, or other knowledge extracted from your authorized sources.',
      technicalDetails: 'Full-text concept search & entity canonical name matching',
      icon: '🔍',
      placement: 'bottom'
    },
    {
      id: 'step-3-explorer',
      target: 'data-tour="knowledge-graph-explorer"',
      title: '3. Graph Explorer',
      description: 'Explore relationships between entities visually. Selecting a node lets you inspect its supporting evidence and relationships.',
      emptyStateExplanation: 'Your Knowledge Graph is currently empty. Upload or process a document to extract entities and relationships.',
      technicalDetails: 'Bounded interactive graph layout • Canvas node/edge rendering',
      icon: '🕸️',
      placement: 'top'
    },
    {
      id: 'step-4-entities',
      target: 'data-tour="knowledge-graph-entities"',
      title: '4. Entities',
      description: 'Entities are the people, organizations, locations, products, concepts, and other objects extracted from your knowledge sources.',
      technicalDetails: 'KnowledgeEntity model • EntityType enum (LOCATION, ORGANISATION, PERSON, CONCEPT, EVENT)',
      icon: '🏷️',
      placement: 'bottom'
    },
    {
      id: 'step-5-relationships',
      target: 'data-tour="knowledge-graph-relationships"',
      title: '5. Relationships',
      description: 'Relationships describe how entities are connected, such as LOCATED_IN, PART_OF, WORKS_FOR, or other supported relationship types.',
      technicalDetails: 'KnowledgeRelationship model • RelationshipType enum & confidence scores',
      icon: '🔗',
      placement: 'bottom'
    },
    {
      id: 'step-6-conflicts',
      target: 'data-tour="knowledge-graph-conflicts"',
      title: '6. Conflicts',
      description: 'Conflicts identify contradictory claims found across your authorized evidence instead of silently selecting one source.',
      technicalDetails: 'ContradictionService • KnowledgeConflict model & resolution status',
      icon: '⚠️',
      placement: 'bottom'
    },
    {
      id: 'step-7-gaps',
      target: 'data-tour="knowledge-graph-gaps"',
      title: '7. Knowledge Gaps',
      description: 'Knowledge gaps identify missing information or connections that cannot be confidently established from the available evidence.',
      technicalDetails: 'KnowledgeGapService • Priority scoring & missing link heuristics',
      icon: '🧩',
      placement: 'bottom'
    },
    {
      id: 'step-8-entity-details',
      target: 'data-tour="knowledge-graph-entity-details"',
      title: '8. Entity Details',
      description: 'Select an entity to inspect its properties, relationships, supporting evidence, and source citations.',
      technicalDetails: 'Entity detail drawer • Canonical name, confidence score & entity link',
      icon: '📋',
      placement: 'left'
    },
    {
      id: 'step-9-evidence',
      target: 'data-tour="knowledge-graph-evidence"',
      title: '9. Grounded Evidence',
      description: 'Knowledge Graph information must remain grounded in authorized source evidence. The system should never present an unsupported relationship as fact.',
      technicalDetails: 'KnowledgeClaim model • DocumentChunk evidence linking • 100% grounded zero-hallucination policy',
      icon: '🛡️',
      placement: 'top'
    },
    {
      id: 'step-10-actions',
      target: 'data-tour="knowledge-graph-actions"',
      title: '10. Graph Actions',
      description: 'Use search, refresh, or document reprocessing actions to keep your Knowledge Graph updated with fresh evidence.',
      technicalDetails: 'POST /api/knowledge-graph/extract • Async background extraction worker',
      icon: '⚡',
      placement: 'bottom'
    }
  ]
};

export const knowledgeGraphWorkflowTour: TourDefinition = {
  id: 'knowledge-graph-workflow',
  version: 1,
  module: 'Knowledge Graph Lifecycle',
  title: 'Knowledge Graph Functional Lifecycle Tour',
  badge: 'Lifecycle',
  description: 'Understand the end-to-end processing pipeline from raw documents to grounded GraphRAG answers.',
  routePattern: '^/knowledge-graph',
  steps: [
    {
      id: 'wf-1-doc-ingest',
      target: 'data-tour="knowledge-graph-header"',
      title: '1. Document Ingestion',
      description: 'PDF and web documents are uploaded and stored securely with full tenant isolation.',
      icon: '📁'
    },
    {
      id: 'wf-2-text-chunking',
      target: 'data-tour="knowledge-graph-header"',
      title: '2. Text Extraction & Chunking',
      description: 'Worker nodes extract page-aware text and split documents into token-bounded overlapping chunks.',
      icon: '📄'
    },
    {
      id: 'wf-3-entity-extraction',
      target: 'data-tour="knowledge-graph-entities"',
      title: '3. Entity & Relationship Extraction',
      description: 'Gemini and local extractors identify domain entities and directional relationships backed by chunk evidence.',
      icon: '🏷️'
    },
    {
      id: 'wf-4-contradiction',
      target: 'data-tour="knowledge-graph-conflicts"',
      title: '4. Contradiction & Conflict Detection',
      description: 'Contradictory claims across different documents are flagged automatically in the Conflicts tab.',
      icon: '⚠️'
    },
    {
      id: 'wf-5-graphrag',
      target: 'data-tour="knowledge-graph-explorer"',
      title: '5. Grounded GraphRAG Search',
      description: 'Multi-hop graph traversal combines structural relationship evidence with hybrid vector retrieval for precise answers.',
      icon: '🧠'
    }
  ]
};
