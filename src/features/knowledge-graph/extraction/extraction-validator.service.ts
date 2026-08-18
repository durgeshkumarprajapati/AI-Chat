import {
  ExtractedEntityDTO,
  ExtractedRelationshipDTO,
  ExtractedClaimDTO,
  ExtractionResultDTO,
  CONTROLLED_ENTITY_TYPES,
  CONTROLLED_RELATIONSHIP_TYPES,
  KnowledgeEntityType,
  KnowledgeRelationshipType
} from '../knowledge-graph.types';
import { env } from '@/config/env';

export class ExtractionValidatorService {
  private readonly maxEntities = env.server?.KNOWLEDGE_GRAPH_MAX_ENTITIES_PER_CHUNK ?? 50;
  private readonly maxRelationships = env.server?.KNOWLEDGE_GRAPH_MAX_RELATIONSHIPS_PER_CHUNK ?? 100;
  private readonly maxClaims = env.server?.KNOWLEDGE_GRAPH_MAX_CLAIMS_PER_CHUNK ?? 50;

  public sanitizeAndValidate(raw: any): ExtractionResultDTO {
    const sanitizedEntities: ExtractedEntityDTO[] = [];
    const sanitizedRelationships: ExtractedRelationshipDTO[] = [];
    const sanitizedClaims: ExtractedClaimDTO[] = [];

    if (!raw || typeof raw !== 'object') {
      return { entities: [], relationships: [], claims: [] };
    }

    // 1. Sanitize Entities
    if (Array.isArray(raw.entities)) {
      for (const e of raw.entities.slice(0, this.maxEntities)) {
        if (!e || typeof e.name !== 'string' || !e.name.trim()) continue;

        const name = e.name.trim();
        let type: KnowledgeEntityType = 'OTHER';
        if (typeof e.type === 'string') {
          const uType = e.type.toUpperCase().trim() as KnowledgeEntityType;
          if (CONTROLLED_ENTITY_TYPES.includes(uType)) {
            type = uType;
          }
        }

        const confidence = typeof e.confidence === 'number' ? Math.max(0.1, Math.min(1.0, e.confidence)) : 0.8;
        const aliases = Array.isArray(e.aliases)
          ? e.aliases.filter((a: unknown): a is string => typeof a === 'string' && !!a.trim())
          : [];

        sanitizedEntities.push({
          name,
          type,
          description: typeof e.description === 'string' ? e.description.trim() : undefined,
          aliases,
          confidence
        });
      }
    }

    // 2. Sanitize Relationships
    if (Array.isArray(raw.relationships)) {
      for (const r of raw.relationships.slice(0, this.maxRelationships)) {
        if (
          !r ||
          typeof r.sourceEntityName !== 'string' ||
          typeof r.targetEntityName !== 'string' ||
          !r.sourceEntityName.trim() ||
          !r.targetEntityName.trim()
        ) {
          continue;
        }

        const sourceEntityName = r.sourceEntityName.trim();
        const targetEntityName = r.targetEntityName.trim();
        let relationshipType: KnowledgeRelationshipType = 'RELATED_TO';

        if (typeof r.relationshipType === 'string') {
          const uRel = r.relationshipType.toUpperCase().trim() as KnowledgeRelationshipType;
          if (CONTROLLED_RELATIONSHIP_TYPES.includes(uRel)) {
            relationshipType = uRel;
          }
        }

        const confidence = typeof r.confidence === 'number' ? Math.max(0.1, Math.min(1.0, r.confidence)) : 0.8;

        sanitizedRelationships.push({
          sourceEntityName,
          targetEntityName,
          relationshipType,
          description: typeof r.description === 'string' ? r.description.trim() : undefined,
          confidence
        });
      }
    }

    // 3. Sanitize Claims
    if (Array.isArray(raw.claims)) {
      for (const c of raw.claims.slice(0, this.maxClaims)) {
        if (!c || typeof c.subjectEntityName !== 'string' || typeof c.predicate !== 'string') {
          continue;
        }

        const subjectEntityName = c.subjectEntityName.trim();
        const predicate = c.predicate.trim();
        if (!subjectEntityName || !predicate) continue;

        const confidence = typeof c.confidence === 'number' ? Math.max(0.1, Math.min(1.0, c.confidence)) : 0.8;

        sanitizedClaims.push({
          subjectEntityName,
          predicate,
          objectEntityName: typeof c.objectEntityName === 'string' ? c.objectEntityName.trim() : undefined,
          value: typeof c.value === 'string' ? c.value.trim() : undefined,
          confidence
        });
      }
    }

    return {
      entities: sanitizedEntities,
      relationships: sanitizedRelationships,
      claims: sanitizedClaims
    };
  }
}

export const extractionValidatorService = new ExtractionValidatorService();
