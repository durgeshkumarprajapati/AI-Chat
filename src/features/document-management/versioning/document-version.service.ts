import { env } from '@/config/env';
import { documentManagementRepository, CreateVersionInput } from '../document-management.repository';
import { duplicateDetectionService } from '../duplicate-detection/duplicate-detection.service';

export class DocumentVersionService {
  public async createNextVersion(
    input: Omit<CreateVersionInput, 'versionNumber'> & { buffer?: Buffer; text?: string }
  ) {
    if (!env.server?.DOCUMENT_VERSIONING_ENABLED) {
      throw new Error('Document versioning is disabled.');
    }

    const versionNumber = await documentManagementRepository.getNextVersionNumber(input.documentId);
    const contentHash = input.contentHash || (input.buffer ? duplicateDetectionService.computeSHA256(input.buffer) : 'hash-placeholder');

    const version = await documentManagementRepository.createVersion({
      ...input,
      versionNumber,
      contentHash
    });

    if (input.isActive !== false) {
      await documentManagementRepository.setActiveVersion(input.documentId, versionNumber);
    }

    return version;
  }

  public async listVersions(documentId: string) {
    return documentManagementRepository.listVersions(documentId);
  }

  public async setActiveVersion(documentId: string, versionNumber: number) {
    return documentManagementRepository.setActiveVersion(documentId, versionNumber);
  }
}

export const documentVersionService = new DocumentVersionService();
