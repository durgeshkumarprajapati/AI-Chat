jest.mock('@/features/llm/llm-gateway.service', () => ({
  llmGateway: { generate: jest.fn() }
}));

import { llmGateway } from '@/features/llm/llm-gateway.service';
import { metadataExtractorService } from '@/features/document-intelligence/metadata-extraction/metadata-extractor.service';
import { metadataValidatorService } from '@/features/document-intelligence/metadata-extraction/metadata-validator.service';

describe('MetadataExtractorService — Phase 69A', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns validated metadata for a well-formed JSON response', async () => {
    (llmGateway.generate as jest.Mock).mockResolvedValue({
      text: JSON.stringify({ title: 'My Doc', keywords: ['alpha', 'beta'], language: 'en' })
    });

    const result = await metadataExtractorService.extractMetadata('some document text', 'user-1');

    expect(result.title).toBe('My Doc');
    expect(result.keywords).toEqual(['alpha', 'beta']);
    expect(result.language).toBe('en');
  });

  it('recovers metadata from markdown-fenced JSON responses', async () => {
    (llmGateway.generate as jest.Mock).mockResolvedValue({ text: '```json\n{"title": "Fenced Doc"}\n```' });

    const result = await metadataExtractorService.extractMetadata('some text', 'user-1');

    expect(result.title).toBe('Fenced Doc');
  });

  it('never throws and returns an empty object for malformed JSON', async () => {
    (llmGateway.generate as jest.Mock).mockResolvedValue({ text: 'not json at all' });

    const result = await metadataExtractorService.extractMetadata('some text', 'user-1');

    expect(result).toEqual({});
  });

  it('never throws and returns an empty object when the LLM Gateway itself throws', async () => {
    (llmGateway.generate as jest.Mock).mockRejectedValue(new Error('provider unavailable'));

    const result = await metadataExtractorService.extractMetadata('some text', 'user-1');

    expect(result).toEqual({});
  });

  it('returns an empty object for empty input without calling the gateway', async () => {
    const result = await metadataExtractorService.extractMetadata('   ', 'user-1');

    expect(result).toEqual({});
    expect(llmGateway.generate).not.toHaveBeenCalled();
  });
});

describe('MetadataValidatorService — Phase 69A', () => {
  it('clamps oversized keyword arrays and drops non-string entries', () => {
    const rawKeywords: unknown[] = Array.from({ length: 30 }, (_, i) => `kw${i}`);
    rawKeywords.push(123, null, '');

    const validated = metadataValidatorService.sanitizeAndValidate({ keywords: rawKeywords });

    expect(validated.keywords).toBeDefined();
    expect(validated.keywords!.length).toBeLessThanOrEqual(20);
    expect(validated.keywords!.every((k) => typeof k === 'string')).toBe(true);
  });

  it('rejects an invalid createdDate string', () => {
    const validated = metadataValidatorService.sanitizeAndValidate({ createdDate: 'not-a-date' });
    expect(validated.createdDate).toBeUndefined();
  });

  it('accepts a valid ISO createdDate string', () => {
    const validated = metadataValidatorService.sanitizeAndValidate({ createdDate: '2026-01-15' });
    expect(validated.createdDate).toBe('2026-01-15');
  });

  it('returns {} for non-object input', () => {
    expect(metadataValidatorService.sanitizeAndValidate(null)).toEqual({});
    expect(metadataValidatorService.sanitizeAndValidate(undefined)).toEqual({});
    expect(metadataValidatorService.sanitizeAndValidate('a string')).toEqual({});
  });

  it('trims and clamps overly long string fields', () => {
    const longTitle = 'x'.repeat(1000);
    const validated = metadataValidatorService.sanitizeAndValidate({ title: longTitle });
    expect(validated.title!.length).toBeLessThanOrEqual(500);
  });
});
