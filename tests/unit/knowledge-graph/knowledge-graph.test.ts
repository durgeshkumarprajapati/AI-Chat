import { knowledgeGraphDeduplicatorService } from '@/features/knowledge-graph/ingestion/knowledge-graph-deduplicator.service';
import { extractionValidatorService } from '@/features/knowledge-graph/extraction/extraction-validator.service';

describe('Knowledge Graph Unit Tests', () => {
  it('normalizes entity names deterministically', () => {
    const norm1 = knowledgeGraphDeduplicatorService.normalizeName('PostgreSQL Database');
    const norm2 = knowledgeGraphDeduplicatorService.normalizeName('postgresql  database!');
    expect(norm1).toBe('postgresql_database');
    expect(norm2).toBe('postgresql_database');
  });

  it('computes stable SHA-256 relationship fingerprints', () => {
    const fp1 = knowledgeGraphDeduplicatorService.computeRelationshipFingerprint('u1', null, 'e1', 'USES', 'e2');
    const fp2 = knowledgeGraphDeduplicatorService.computeRelationshipFingerprint('u1', null, 'e1', 'USES', 'e2');
    expect(fp1).toBe(fp2);
    expect(fp1.length).toBe(64);
  });

  it('strictly validates and sanitizes LLM JSON outputs against controlled registries', () => {
    const rawLLMOutput = {
      entities: [
        { name: 'React', type: 'FRAMEWORK', confidence: 0.95 },
        { name: 'Unknown', type: 'INVALID_TYPE_X', confidence: 1.5 }
      ],
      relationships: [
        { sourceEntityName: 'React', targetEntityName: 'JavaScript', relationshipType: 'USES', confidence: 0.9 }
      ]
    };

    const validated = extractionValidatorService.sanitizeAndValidate(rawLLMOutput);
    expect(validated.entities.length).toBe(2);
    expect(validated.entities[0]?.type).toBe('FRAMEWORK');
    expect(validated.entities[1]?.type).toBe('OTHER'); // Normalized fallback
    expect(validated.entities[1]?.confidence).toBe(1.0); // Bounded max
    expect(validated.relationships[0]?.relationshipType).toBe('USES');
  });
});
