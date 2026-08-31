import { languageDetectionService } from '@/features/sarvam/multilingual-rag/language-detection.service';
import { multilingualAnswerService } from '@/features/sarvam/multilingual-rag/multilingual-answer.service';

describe('Phase 79 — Indic Language Detection & Multilingual RAG Routing', () => {
  it('detects Hindi Devanagari script accurately', () => {
    const res = languageDetectionService.detectScript('भारत की राजधानी क्या है?');
    expect(res.isIndic).toBe(true);
    expect(res.language).toBe('hi-IN');
  });

  it('detects Gujarati script accurately', () => {
    const res = languageDetectionService.detectScript('ભારતનું પાટનગર કયું છે?');
    expect(res.isIndic).toBe(true);
    expect(res.language).toBe('gu-IN');
  });

  it('detects English text as non-Indic with zero overhead', () => {
    const res = languageDetectionService.detectScript('What is the capital of India?');
    expect(res.isIndic).toBe(false);
    expect(res.language).toBe('en-IN');
  });

  it('bypasses Sarvam processing for English queries when Multilingual RAG is disabled', async () => {
    const generateFn = jest.fn().mockResolvedValue('New Delhi is the capital of India.');

    const res = await multilingualAnswerService.processMultilingualRag({
      query: 'What is the capital of India?',
      generateAnswerFn: generateFn
    });

    expect(res.handled).toBe(false);
    expect(generateFn).not.toHaveBeenCalled();
  });
});
