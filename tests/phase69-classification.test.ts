jest.mock('@/features/llm/llm-gateway.service', () => ({
  llmGateway: { generate: jest.fn() }
}));

import { llmGateway } from '@/features/llm/llm-gateway.service';
import { classifierService } from '@/features/document-intelligence/classification/classifier.service';
import { classificationValidatorService } from '@/features/document-intelligence/classification/classification-validator.service';

describe('ClassifierService — Phase 69A', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns a controlled document type for a valid response', async () => {
    (llmGateway.generate as jest.Mock).mockResolvedValue({
      text: JSON.stringify({ documentType: 'invoice', confidence: 0.92 })
    });

    const result = await classifierService.classify('some invoice text', 'user-1');

    expect(result.documentType).toBe('INVOICE');
    expect(result.confidence).toBeCloseTo(0.92);
  });

  it('falls back to OTHER for an out-of-enum type rather than trusting raw output', async () => {
    (llmGateway.generate as jest.Mock).mockResolvedValue({
      text: JSON.stringify({ documentType: 'SPACESHIP_MANUAL', confidence: 0.5 })
    });

    const result = await classifierService.classify('some text', 'user-1');

    expect(result.documentType).toBe('OTHER');
  });

  it('never throws and defaults to OTHER/0 when the gateway fails', async () => {
    (llmGateway.generate as jest.Mock).mockRejectedValue(new Error('provider down'));

    const result = await classifierService.classify('some text', 'user-1');

    expect(result).toEqual({ documentType: 'OTHER', confidence: 0 });
  });

  it('never throws on malformed JSON output', async () => {
    (llmGateway.generate as jest.Mock).mockResolvedValue({ text: 'this is not json' });

    const result = await classifierService.classify('some text', 'user-1');

    expect(result.documentType).toBe('OTHER');
  });

  it('returns OTHER/0 for empty input without calling the gateway', async () => {
    const result = await classifierService.classify('', 'user-1');

    expect(result).toEqual({ documentType: 'OTHER', confidence: 0 });
    expect(llmGateway.generate).not.toHaveBeenCalled();
  });
});

describe('ClassificationValidatorService — Phase 69A', () => {
  it('clamps confidence to the [0,1] range', () => {
    expect(classificationValidatorService.sanitizeAndValidate({ documentType: 'REPORT', confidence: 5 }).confidence).toBe(1);
    expect(classificationValidatorService.sanitizeAndValidate({ documentType: 'REPORT', confidence: -5 }).confidence).toBe(0);
  });

  it('defaults confidence to 0.5 when missing or invalid', () => {
    expect(classificationValidatorService.sanitizeAndValidate({ documentType: 'REPORT' }).confidence).toBe(0.5);
    expect(classificationValidatorService.sanitizeAndValidate({ documentType: 'REPORT', confidence: 'high' }).confidence).toBe(0.5);
  });

  it('is case-insensitive when matching controlled document types', () => {
    expect(classificationValidatorService.sanitizeAndValidate({ documentType: 'contract' }).documentType).toBe('CONTRACT');
  });

  it('defaults to OTHER for non-object input', () => {
    expect(classificationValidatorService.sanitizeAndValidate(null)).toEqual({ documentType: 'OTHER', confidence: 0 });
  });
});
