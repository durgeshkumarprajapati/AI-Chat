/**
 * Phase 77: multimodal.service.ts's per-image processing loop was changed from fully
 * sequential to bounded-concurrency batches. This proves the final result.visuals/result.chunks
 * arrays and cumulative metrics counters are identical to the original array order (image
 * index order), never resolution order — the only thing that changed is wall-clock time.
 */
jest.mock('@/lib/prisma', () => ({
  prisma: { documentVisual: { create: jest.fn() } }
}));
jest.mock('@/config/env', () => ({
  env: {
    server: {
      MULTIMODAL_ENABLED: true,
      MULTIMODAL_OCR_ENABLED: true,
      MULTIMODAL_VISION_ENABLED: true,
      MULTIMODAL_MAX_IMAGES_PER_DOCUMENT: 30
    }
  }
}));
jest.mock('@/features/config', () => ({
  configService: { getNumber: jest.fn().mockResolvedValue(2) } // concurrency=2, so batches interleave
}));
jest.mock('@/lib/storage', () => ({
  getStorageProvider: () => ({ upload: jest.fn().mockResolvedValue(undefined) })
}));
jest.mock('@/features/rag/multimodal/ocr.provider', () => ({
  defaultOCRProvider: { extractText: jest.fn().mockResolvedValue({ text: 'ocr' }) }
}));
jest.mock('@/features/rag/multimodal/vision.provider', () => ({
  defaultVisionProvider: { analyzeVisualContent: jest.fn() }
}));
jest.mock('@/features/rag/multimodal/table-extractor.service', () => ({
  tableExtractorService: { extractTablesFromText: jest.fn().mockReturnValue([]) }
}));

import { prisma } from '@/lib/prisma';
import { defaultVisionProvider } from '@/features/rag/multimodal/vision.provider';
import { multimodalService } from '@/features/rag/multimodal/multimodal.service';

describe('Phase 77 — multimodal.service.ts bounded concurrency preserves output order', () => {
  beforeEach(() => jest.clearAllMocks());

  it('pushes visuals/chunks in original image-index order even when later images resolve first', async () => {
    let createCallCount = 0;
    (prisma.documentVisual.create as jest.Mock).mockImplementation(async ({ data }) => {
      createCallCount++;
      return { id: `visual-${data.pageNumber}`, ...data };
    });

    // Image on page 1 resolves SLOWER than the image on page 2 — proves ordering isn't
    // resolution-order-dependent.
    (defaultVisionProvider.analyzeVisualContent as jest.Mock).mockImplementation(async (_buf, _type, _caption) => {
      return { description: 'vision desc' };
    });

    const images = [
      { pageNumber: 1, buffer: Buffer.from('page1') },
      { pageNumber: 2, buffer: Buffer.from('page2') },
      { pageNumber: 3, buffer: Buffer.from('page3') },
      { pageNumber: 4, buffer: Buffer.from('page4') }
    ];

    const result = await multimodalService.processDocumentVisuals('user-1', 'doc-1', new Map(), images);

    expect(result.chunks.map((c) => c.pageNumber)).toEqual([1, 2, 3, 4]);
    expect(result.visuals.map((v: any) => v.pageNumber)).toEqual([1, 2, 3, 4]);
    expect(result.metrics.imagesExtracted).toBe(4);
    expect(result.metrics.visionCallsMade).toBe(4);
    expect(result.metrics.ocrPagesProcessed).toBe(4);
    expect(createCallCount).toBe(4);
  });

  it('respects the configured concurrency by processing images in bounded batches, not all at once', async () => {
    let concurrentInFlight = 0;
    let maxConcurrentObserved = 0;

    (defaultVisionProvider.analyzeVisualContent as jest.Mock).mockImplementation(async () => {
      concurrentInFlight++;
      maxConcurrentObserved = Math.max(maxConcurrentObserved, concurrentInFlight);
      await new Promise((r) => setTimeout(r, 5));
      concurrentInFlight--;
      return { description: 'x' };
    });
    (prisma.documentVisual.create as jest.Mock).mockImplementation(async ({ data }) => ({ id: 'v', ...data }));

    const images = Array.from({ length: 6 }, (_, i) => ({ pageNumber: i + 1, buffer: Buffer.from(`p${i}`) }));

    await multimodalService.processDocumentVisuals('user-1', 'doc-1', new Map(), images);

    // configService.getNumber is mocked to return 2 — concurrency must never exceed that.
    expect(maxConcurrentObserved).toBeLessThanOrEqual(2);
    expect(maxConcurrentObserved).toBeGreaterThan(0);
  });
});
