import { TourDefinition } from '../tour-types';

export const documentsTour: TourDefinition = {
  id: 'documents',
  version: 1,
  module: 'Documents',
  title: 'Document Catalog Tour',
  badge: 'Documents',
  description: 'Upload, manage, search, reprocess, and organize PDF documents for vector embeddings and Knowledge Graph extraction.',
  routePattern: '^/documents',
  steps: [
    {
      id: 'doc-1',
      target: 'data-tour="documents-header"',
      title: 'Document Catalog',
      description: 'Manage all uploaded PDF files, processing status, page counts, and chunk statistics.',
      icon: '📁'
    },
    {
      id: 'doc-2',
      target: 'data-tour="documents-upload-btn"',
      title: 'Upload Document',
      description: 'Upload PDFs up to 25 MB. Text is automatically extracted, chunked, embedded, and stored in pgvector.',
      icon: '⬆️'
    },
    {
      id: 'doc-3',
      target: 'data-tour="documents-search"',
      title: 'Search & Status Filter',
      description: 'Filter files by status (Completed, Processing, Failed) or search document titles in real time.',
      icon: '🔍'
    },
    {
      id: 'doc-4',
      target: 'data-tour="documents-table"',
      title: 'Document Actions',
      description: 'Inspect chunks, download raw files, retry failed background jobs, or reprocess files.',
      icon: '⚙️'
    }
  ]
};
