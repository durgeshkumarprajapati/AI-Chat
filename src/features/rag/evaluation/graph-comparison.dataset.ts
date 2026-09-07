import { GraphEvaluationCase } from './graph-comparison.types';

/**
 * Minimal, synthetic GraphRAG evaluation dataset (Phase 3). No real user, document, or knowledge
 * base is referenced — ids follow this codebase's existing synthetic-fixture convention (see
 * tests/phase19-rag-evaluation.test.ts's `99999999-...` user ids) so a seed script can create
 * matching fixtures without colliding with real production ids. Entity/relationship names mirror
 * tests/unit/rag/graph-retrieval-evaluation.test.ts's own synthetic vocabulary (Entity A/B/C,
 * org-chart.pdf) for consistency across this codebase's GraphRAG test suites.
 *
 * Adding a case requires no schema change — GraphEvaluationCase's optional fields already cover
 * relationship-only, entity-only, and no-graph-expected scenarios.
 */
export const GRAPH_EVALUATION_DATASET: GraphEvaluationCase[] = [
  {
    id: 'graph-eval-relationship-001',
    query: 'How is Entity A related to Entity B?',
    userId: '99999999-eeee-4000-a000-100000000001',
    knowledgeBaseId: '99999999-eeee-4000-a000-100000000101',
    sourceMode: 'documents_only',
    expectedEntities: ['Entity A', 'Entity B'],
    expectedRelationships: [{ from: 'Entity A', to: 'Entity B', keyword: 'reports to' }],
    expectedAnswerCharacteristics: ['states the reporting relationship between Entity A and Entity B'],
    expectedSourceDocumentIds: []
  },
  {
    id: 'graph-eval-multihop-002',
    query: 'What connects Entity A to Entity C through Entity B?',
    userId: '99999999-eeee-4000-a000-100000000001',
    knowledgeBaseId: '99999999-eeee-4000-a000-100000000101',
    sourceMode: 'documents_only',
    expectedEntities: ['Entity A', 'Entity B', 'Entity C'],
    expectedRelationships: [
      { from: 'Entity A', to: 'Entity B' },
      { from: 'Entity B', to: 'Entity C' }
    ],
    expectedAnswerCharacteristics: ['describes a two-hop path from Entity A to Entity C via Entity B'],
    expectedSourceDocumentIds: []
  },
  {
    id: 'graph-eval-simple-doc-003',
    query: 'What is the main purpose of this document?',
    userId: '99999999-eeee-4000-a000-100000000002',
    knowledgeBaseId: '99999999-eeee-4000-a000-100000000102',
    sourceMode: 'documents_only',
    expectedEntities: [],
    expectedRelationships: [],
    expectedAnswerCharacteristics: ['summarizes the document without inventing entities or relationships'],
    expectedSourceDocumentIds: []
  },
  {
    id: 'graph-eval-no-graph-004',
    query: 'What was the total budget mentioned in the report?',
    userId: '99999999-eeee-4000-a000-100000000002',
    knowledgeBaseId: '99999999-eeee-4000-a000-100000000102',
    sourceMode: 'documents_only',
    expectedEntities: [],
    expectedRelationships: [],
    expectedAnswerCharacteristics: ['answers using only the vector-retrieved figure, no graph context expected'],
    expectedSourceDocumentIds: []
  }
];
