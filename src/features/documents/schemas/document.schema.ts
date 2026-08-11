import { z } from 'zod';

export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

export const UploadDocumentSchema = z.object({
  filename: z.string().min(1, 'Filename is required'),
  mimeType: z.literal('application/pdf', {
    errorMap: () => ({ message: 'Invalid file type. Only PDF documents (application/pdf) are supported.' })
  }),
  fileSize: z
    .number()
    .min(1, 'File size cannot be empty')
    .max(MAX_FILE_SIZE, `File size exceeds maximum allowed limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB.`)
});

export type UploadDocumentInput = z.infer<typeof UploadDocumentSchema>;

/**
 * Normalizes filenames safely to prevent path traversal or filesystem issues.
 */
export function normalizeFilename(filename: string): string {
  const basename = filename.split(/[/\\]/).pop() || 'document.pdf';
  const sanitized = basename.replace(/[^a-zA-Z0-9_.-]/g, '_');
  if (sanitized.toLowerCase().endsWith('.pdf')) {
    return `${sanitized.slice(0, -4)}.pdf`;
  }
  return `${sanitized}.pdf`;
}

/**
 * Builds the canonical server-controlled storage key.
 */
export function buildStorageKey(userId: string, documentId: string, filename: string): string {
  const safeName = normalizeFilename(filename);
  return `documents/${userId}/${documentId}/${safeName}`;
}
