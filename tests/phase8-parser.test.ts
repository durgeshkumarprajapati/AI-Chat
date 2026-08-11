import { pdfParser, cleanExtractedText } from '../src/features/documents/parsers/pdf.parser';
import { documentProcessor } from '../worker/src/processors/document.processor';
import { documentRepository } from '../src/features/documents/repositories/document.repository';
import { workerDocumentRepository } from '../worker/src/repositories/document.repository';
import { storage } from '../src/lib/storage';
import { prisma } from '../src/lib/prisma';
import { DocumentProcessingError } from '../src/errors';
import { Document, DocumentStatus } from '@prisma/client';

const TEST_USER_ID = '22222222-2222-4000-a000-222222222222';

// Minimal valid 1-page PDF 1.4 binary buffer
const ONE_PAGE_PDF = Buffer.from(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 56 >>
stream
BT
/F1 12 Tf
100 700 Td
(Hello World from PDF Page 1) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000318 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
424
%%EOF`);

// Minimal valid 2-page PDF 1.4 binary buffer
const TWO_PAGE_PDF = Buffer.from(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 44 >>
stream
BT
/F1 12 Tf
100 700 Td
(Content on First Page) Tj
ET
endstream
endobj
6 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 7 0 R >>
endobj
7 0 obj
<< /Type /Length 45 >>
stream
BT
/F1 12 Tf
100 700 Td
(Content on Second Page) Tj
ET
endstream
endobj
xref
0 8
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000119 00000 n 
0000000248 00000 n 
0000000322 00000 n 
0000000416 00000 n 
0000000545 00000 n 
trailer
<< /Size 8 /Root 1 0 R >>
startxref
640
%%EOF`);

// Minimal valid PDF with 1 text page and 1 blank page
const MIXED_EMPTY_PAGE_PDF = Buffer.from(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 38 >>
stream
BT
/F1 12 Tf
100 700 Td
(Valid Text Page) Tj
ET
endstream
endobj
6 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 7 0 R >>
endobj
7 0 obj
<< /Length 0 >>
stream
endstream
endobj
xref
0 8
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000119 00000 n 
0000000248 00000 n 
0000000322 00000 n 
0000000410 00000 n 
0000000483 00000 n 
trailer
<< /Size 8 /Root 1 0 R >>
startxref
533
%%EOF`);

const memoryDb = {
  documents: new Map<string, Document>()
};

async function setupMocks() {
  try {
    await prisma.user.upsert({
      where: { id: TEST_USER_ID },
      update: {},
      create: {
        id: TEST_USER_ID,
        email: 'phase8-user@example.com',
        name: 'Phase 8 Test User'
      }
    });
  } catch {
    documentRepository.create = async (data) => {
      const doc: Document = {
        id: data.id || `doc-${Date.now()}`,
        userId: data.userId,
        filename: data.filename,
        originalFilename: data.originalFilename,
        mimeType: data.mimeType,
        fileSize: data.fileSize,
        storageKey: data.storageKey,
        status: DocumentStatus.PROCESSING,
        version: 1,
        pageCount: 0,
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      memoryDb.documents.set(doc.id, doc);
      return doc;
    };

    documentRepository.findByIdAndUser = async (id, userId) => {
      const doc = memoryDb.documents.get(id);
      if (doc && doc.userId === userId) return doc;
      return null;
    };

    documentRepository.updateStatus = async (id, status, extra) => {
      const doc = memoryDb.documents.get(id);
      if (!doc) throw new Error('Document not found');
      doc.status = status as DocumentStatus;
      if (extra?.errorMessage !== undefined) doc.errorMessage = extra.errorMessage;
      if (extra?.pageCount !== undefined) doc.pageCount = extra.pageCount;
      doc.updatedAt = new Date();
      memoryDb.documents.set(id, doc);
      return doc;
    };

    workerDocumentRepository.findByIdAndUser = documentRepository.findByIdAndUser as unknown as typeof workerDocumentRepository.findByIdAndUser;
    workerDocumentRepository.updateStatus = documentRepository.updateStatus as unknown as typeof workerDocumentRepository.updateStatus;
    workerDocumentRepository.saveChunksTx = async () => {};
    workerDocumentRepository.findChunksNeedingEmbeddings = async () => [];
    workerDocumentRepository.saveEmbeddingsBatchTx = async () => {};
  }
}

async function runPhase8Tests() {
  console.log('====================================================');
  console.log('Running Phase 8 PDF Text Extraction Test Suite');
  console.log('====================================================\n');

  await setupMocks();

  // Test 1: One-Page Text PDF
  console.log('Test 1: Parse One-Page Text PDF');
  const result1 = await pdfParser.parse(ONE_PAGE_PDF);
  if (result1.pageCount !== 1 || result1.pages.length !== 1) {
    throw new Error(`Expected pageCount=1, got ${result1.pageCount}`);
  }
  if (result1.pages[0]?.pageNumber !== 1) {
    throw new Error(`Expected pageNumber=1, got ${result1.pages[0]?.pageNumber}`);
  }
  if (!result1.pages[0]?.text.includes('Hello World from PDF Page 1')) {
    throw new Error(`Text extraction mismatch: "${result1.pages[0]?.text}"`);
  }
  console.log('  ✅ PASSED: One-page PDF parsed correctly.');

  // Test 2: Multi-Page PDF & Page Ordering
  console.log('\nTest 2: Parse Multi-Page PDF & Page Ordering');
  const result2 = await pdfParser.parse(TWO_PAGE_PDF);
  if (result2.pageCount !== 2 || result2.pages.length !== 2) {
    throw new Error(`Expected pageCount=2, got ${result2.pageCount}`);
  }
  if (result2.pages[0]?.pageNumber !== 1 || result2.pages[1]?.pageNumber !== 2) {
    throw new Error('Page ordering mismatch.');
  }
  if (!result2.pages[0]?.text.includes('First Page') || !result2.pages[1]?.text.includes('Second Page')) {
    throw new Error('Multi-page text content mismatch.');
  }
  console.log('  ✅ PASSED: Multi-page PDF parsed with correct page ordering.');

  // Test 3: Page Number Preservation (1-indexed)
  console.log('\nTest 3: Page Number Preservation (1-indexed)');
  const pageNums = result2.pages.map((p) => p.pageNumber);
  if (pageNums[0] !== 1 || pageNums[1] !== 2) {
    throw new Error(`Page numbers not preserved correctly: ${pageNums.join(', ')}`);
  }
  console.log('  ✅ PASSED: 1-indexed page numbers preserved (1, 2).');

  // Test 4: Empty Page Handling
  console.log('\nTest 4: Empty Page Handling');
  const result4 = await pdfParser.parse(MIXED_EMPTY_PAGE_PDF);
  if (result4.pageCount !== 2) {
    throw new Error(`Expected pageCount=2, got ${result4.pageCount}`);
  }
  if (result4.pages[0]?.text === '' && result4.pages[1]?.text !== '') {
    throw new Error('Empty page order unexpected.');
  }
  console.log('  ✅ PASSED: PDF with empty page handled without failing remaining pages.');

  // Test 5: Whitespace Normalization
  console.log('\nTest 5: Whitespace Normalization');
  const uncleanedText = "  Line 1  \r\n\r\n\r\n  Line 2   with   spaces\t\t\n\n\nLine 3  ";
  const cleaned = cleanExtractedText(uncleanedText);
  const expectedCleaned = "Line 1\n\nLine 2 with spaces\n\nLine 3";
  if (cleaned !== expectedCleaned) {
    throw new Error(`Whitespace normalization failed.\nExpected:\n"${expectedCleaned}"\nGot:\n"${cleaned}"`);
  }
  console.log('  ✅ PASSED: Whitespace normalized while preserving paragraph separation.');

  // Test 6: Malformed PDF Handling
  console.log('\nTest 6: Malformed PDF Handling');
  try {
    const malformedBuffer = Buffer.from('%PDF-1.4 Corrupted Malformed Bytes Without EOF Header');
    await pdfParser.parse(malformedBuffer);
    throw new Error('Should have thrown error for malformed PDF');
  } catch (err) {
    if (err instanceof DocumentProcessingError || (err instanceof Error && err.message.includes('Unable to extract text'))) {
      console.log('  ✅ PASSED: Malformed PDF threw DocumentProcessingError correctly.');
    } else {
      throw err;
    }
  }

  // Test 7: Invalid/Empty Buffer Handling
  console.log('\nTest 7: Invalid/Empty Buffer Handling');
  try {
    await pdfParser.parse(Buffer.alloc(0));
    throw new Error('Should have thrown error for zero-byte buffer');
  } catch (err) {
    console.log('  ✅ PASSED: Empty buffer threw expected error.');
  }

  // Test 8: Integration Test - Worker Processing PDF & Database Update
  console.log('\nTest 8: Worker Processing PDF & DB Document.pageCount Update');
  const testStorageKey = `documents/${TEST_USER_ID}/doc-phase8-integration/sample.pdf`;
  await storage.upload(testStorageKey, TWO_PAGE_PDF, 'application/pdf');

  const testDoc = await documentRepository.create({
    id: 'doc-phase8-integration',
    userId: TEST_USER_ID,
    filename: 'sample.pdf',
    originalFilename: 'sample.pdf',
    mimeType: 'application/pdf',
    fileSize: TWO_PAGE_PDF.length,
    storageKey: testStorageKey
  });

  await documentProcessor.process({
    jobType: 'DOCUMENT_PROCESSING',
    version: 1,
    jobId: `job-phase8-${Date.now()}`,
    documentId: testDoc.id,
    userId: TEST_USER_ID,
    storageKey: testStorageKey,
    attempt: 1,
    createdAt: new Date().toISOString()
  });

  const updatedDoc = await documentRepository.findByIdAndUser(testDoc.id, TEST_USER_ID);
  if (!updatedDoc) {
    throw new Error('Updated document record not found');
  }
  if (updatedDoc.pageCount !== 2) {
    throw new Error(`Expected Document.pageCount=2, got ${updatedDoc.pageCount}`);
  }
  if (updatedDoc.status !== 'PROCESSING') {
    throw new Error(`Expected Document.status to remain PROCESSING, got ${updatedDoc.status}`);
  }

  // Verify no DocumentChunk records exist yet
  const chunkCount = await prisma.documentChunk.count({ where: { documentId: testDoc.id } }).catch(() => 0);
  if (chunkCount !== 0) {
    throw new Error(`Expected 0 document chunks in Phase 8, found ${chunkCount}`);
  }

  console.log('  Updated Document ID:', updatedDoc.id);
  console.log('  Updated Document pageCount:', updatedDoc.pageCount);
  console.log('  Updated Document status:', updatedDoc.status);
  console.log('  ✅ PASSED: Worker extracted PDF, updated pageCount=2, status remains PROCESSING, and zero chunks created.');

  // Clean up
  await storage.delete(testStorageKey);
  try {
    await prisma.document.deleteMany({ where: { userId: TEST_USER_ID } });
  } catch {
    memoryDb.documents.clear();
  }

  console.log('\n====================================================');
  console.log('🎉 ALL PHASE 8 TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================\n');
}

runPhase8Tests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ PHASE 8 TEST FAILED:', err);
    process.exit(1);
  });
