import { prisma } from '@/lib/prisma';
import { entityExtractorService } from '../extraction/entity-extractor.service';
import { relationshipExtractorService } from '../extraction/relationship-extractor.service';
import { claimExtractorService } from '../extraction/claim-extractor.service';
import { knowledgeGraphDeduplicatorService } from './knowledge-graph-deduplicator.service';
import { knowledgeGraphRepository } from '../knowledge-graph.repository';
import { KnowledgeEntity } from '@prisma/client';

export class KnowledgeGraphIngestionService {
  public async ingestDocumentChunks(
    documentId: string,
    userId: string,
    projectId?: string | null,
    knowledgeBaseId?: string | null
  ): Promise<{
    entitiesCreated: number;
    relationshipsCreated: number;
    claimsCreated: number;
    evidencesCreated: number;
  }> {
    const chunks = await prisma.documentChunk.findMany({
      where: { documentId },
      orderBy: { chunkIndex: 'asc' }
    });

    if (chunks.length === 0) {
      return { entitiesCreated: 0, relationshipsCreated: 0, claimsCreated: 0, evidencesCreated: 0 };
    }

    let entitiesCreated = 0;
    let relationshipsCreated = 0;
    let claimsCreated = 0;
    let evidencesCreated = 0;

    for (const chunk of chunks) {
      try {
        const textHash = knowledgeGraphDeduplicatorService.computeSourceTextHash(chunk.content);

        // 1. Extract Entities
        const extractedEntities = await entityExtractorService.extractEntities(chunk.content, userId);
        const entityMap = new Map<string, KnowledgeEntity>();

        for (const eDTO of extractedEntities) {
          const normName = knowledgeGraphDeduplicatorService.normalizeName(eDTO.name);
          const entity = await knowledgeGraphRepository.upsertEntity({
            userId,
            projectId: projectId ?? null,
            knowledgeBaseId: knowledgeBaseId ?? null,
            canonicalName: eDTO.name,
            normalizedName: normName,
            entityType: eDTO.type,
            description: eDTO.description,
            aliases: eDTO.aliases,
            confidence: eDTO.confidence
          });

          entityMap.set(normName, entity);
          entitiesCreated++;

          // Link Evidence
          await knowledgeGraphRepository.createEvidence({
            entityId: entity.id,
            documentId,
            chunkId: chunk.id,
            pageNumber: chunk.pageNumber,
            sourceTextHash: textHash,
            snippet: chunk.content.slice(0, 300),
            confidence: eDTO.confidence
          });
          evidencesCreated++;
        }

        // 2. Extract Relationships
        const entityNames = Array.from(entityMap.values()).map((e) => e.canonicalName);
        if (entityNames.length >= 2) {
          const extractedRels = await relationshipExtractorService.extractRelationships(
            chunk.content,
            entityNames,
            userId
          );

          for (const rDTO of extractedRels) {
            const sourceNorm = knowledgeGraphDeduplicatorService.normalizeName(rDTO.sourceEntityName);
            const targetNorm = knowledgeGraphDeduplicatorService.normalizeName(rDTO.targetEntityName);

            const sourceEntity = entityMap.get(sourceNorm);
            const targetEntity = entityMap.get(targetNorm);

            if (sourceEntity && targetEntity && sourceEntity.id !== targetEntity.id) {
              const fingerprint = knowledgeGraphDeduplicatorService.computeRelationshipFingerprint(
                userId,
                projectId,
                sourceEntity.id,
                rDTO.relationshipType,
                targetEntity.id
              );

              const relationship = await knowledgeGraphRepository.upsertRelationship({
                userId,
                projectId: projectId ?? null,
                sourceEntityId: sourceEntity.id,
                targetEntityId: targetEntity.id,
                relationshipType: rDTO.relationshipType,
                description: rDTO.description,
                confidence: rDTO.confidence,
                fingerprint
              });

              relationshipsCreated++;

              // Link Evidence
              await knowledgeGraphRepository.createEvidence({
                relationshipId: relationship.id,
                documentId,
                chunkId: chunk.id,
                pageNumber: chunk.pageNumber,
                sourceTextHash: textHash,
                snippet: chunk.content.slice(0, 300),
                confidence: rDTO.confidence
              });
              evidencesCreated++;
            }
          }
        }

        // 3. Extract Claims
        const extractedClaims = await claimExtractorService.extractClaims(chunk.content, userId);

        for (const cDTO of extractedClaims) {
          const subjectNorm = knowledgeGraphDeduplicatorService.normalizeName(cDTO.subjectEntityName);
          const subjectEntity = entityMap.get(subjectNorm);

          if (subjectEntity) {
            const objectNorm = cDTO.objectEntityName
              ? knowledgeGraphDeduplicatorService.normalizeName(cDTO.objectEntityName)
              : null;
            const objectEntity = objectNorm ? entityMap.get(objectNorm) : null;

            const claimHash = knowledgeGraphDeduplicatorService.computeClaimHash(
              userId,
              projectId,
              subjectEntity.id,
              cDTO.predicate,
              objectEntity?.id,
              cDTO.value
            );

            const claim = await knowledgeGraphRepository.upsertClaim({
              userId,
              projectId: projectId ?? null,
              subjectEntityId: subjectEntity.id,
              predicate: cDTO.predicate,
              objectEntityId: objectEntity?.id ?? null,
              value: cDTO.value ?? null,
              normalizedClaim: claimHash,
              confidence: cDTO.confidence
            });

            claimsCreated++;

            // Link Evidence
            await knowledgeGraphRepository.createEvidence({
              claimId: claim.id,
              documentId,
              chunkId: chunk.id,
              pageNumber: chunk.pageNumber,
              sourceTextHash: textHash,
              snippet: chunk.content.slice(0, 300),
              confidence: cDTO.confidence
            });
            evidencesCreated++;
          }
        }
      } catch (chunkErr) {
        console.warn(`[KnowledgeGraphIngestionService] Chunk ${chunk.id} extraction skipped due to error:`, chunkErr);
      }
    }

    return { entitiesCreated, relationshipsCreated, claimsCreated, evidencesCreated };
  }
}

export const knowledgeGraphIngestionService = new KnowledgeGraphIngestionService();
