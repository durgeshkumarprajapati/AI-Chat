export interface DuplicateWarning {
  matchType: 'EXACT' | 'NEAR';
  existingDocumentId: string;
  existingFilename: string;
}
