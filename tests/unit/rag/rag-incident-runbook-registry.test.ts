import { getRunbookRecommendations, RAG_INCIDENT_RUNBOOKS } from '@/features/rag/evaluation/rag-incident-runbook.registry';

describe('RAG incident runbook registry', () => {
  it('maps every RagHealthAlertCategory to at least one deterministic runbook', () => {
    const categories: Array<keyof typeof RAG_INCIDENT_RUNBOOKS> = ['CITATION', 'GRAPH', 'RETRIEVAL', 'RELIABILITY'];
    for (const category of categories) {
      const runbooks = getRunbookRecommendations(category);
      expect(runbooks.length).toBeGreaterThan(0);
    }
  });

  it('returns a safe empty array for an unrecognized category rather than throwing', () => {
    const result = getRunbookRecommendations('NOT_A_REAL_CATEGORY' as any);
    expect(result).toEqual([]);
  });

  it('every recommendation is phrased as a suggestion, never a guarantee of recovery', () => {
    const guaranteeLanguage = /\bwill fix\b|\bguarantee[sd]?\b|\bresolves the incident\b/i;
    for (const runbooks of Object.values(RAG_INCIDENT_RUNBOOKS)) {
      for (const runbook of runbooks) {
        expect(runbook.description).not.toMatch(guaranteeLanguage);
        for (const action of runbook.recommendedActions) {
          expect(action.label).not.toMatch(guaranteeLanguage);
        }
      }
    }
  });

  it('every recommendedAction with a non-null actionType references a real allow-listed action', () => {
    const VALID_ACTION_TYPES = ['INVALIDATE_ANSWER_CACHE', 'REFRESH_CONFIG_CACHE', 'RERUN_HEALTH_EVALUATION'];
    for (const runbooks of Object.values(RAG_INCIDENT_RUNBOOKS)) {
      for (const runbook of runbooks) {
        for (const action of runbook.recommendedActions) {
          if (action.actionType !== null) {
            expect(VALID_ACTION_TYPES).toContain(action.actionType);
          }
        }
      }
    }
  });

  it('stores no raw RAG content anywhere in the registry — only the expected static fields exist', () => {
    const EXPECTED_RUNBOOK_KEYS = ['id', 'title', 'description', 'severityRelevance', 'diagnosticChecks', 'recommendedActions'].sort();
    const EXPECTED_ACTION_KEYS = ['label', 'kind', 'actionType'].sort();
    for (const runbooks of Object.values(RAG_INCIDENT_RUNBOOKS)) {
      for (const runbook of runbooks) {
        expect(Object.keys(runbook).sort()).toEqual(EXPECTED_RUNBOOK_KEYS);
        for (const action of runbook.recommendedActions) {
          expect(Object.keys(action).sort()).toEqual(EXPECTED_ACTION_KEYS);
        }
      }
    }
  });
});
