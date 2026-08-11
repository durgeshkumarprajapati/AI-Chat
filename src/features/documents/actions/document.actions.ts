'use server';

import { documentService } from '../services/document.service';

export async function uploadDocumentAction(
  userId: string,
  file: { filename: string; mimeType: string; fileSize: number; buffer: Buffer }
) {
  return documentService.uploadDocument(userId, file);
}

export async function getDocumentByIdAction(userId: string, documentId: string) {
  return documentService.getDocumentById(userId, documentId);
}

export async function getUserDocumentsAction(userId: string) {
  return documentService.getUserDocuments(userId);
}
