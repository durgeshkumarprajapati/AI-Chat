import { VisualContentType } from './multimodal.types';

export interface VisualQueryClassification {
  isVisualQuery: boolean;
  targetPageNumber?: number;
  targetVisualType?: VisualContentType;
  confidence: number;
  reasoning: string;
}

export class VisualQueryClassifier {
  /**
   * Deterministically evaluates whether a query explicitly demands visual content understanding.
   */
  public classifyQuery(question: string): VisualQueryClassification {
    if (!question || !question.trim()) {
      return { isVisualQuery: false, confidence: 1.0, reasoning: 'Empty query' };
    }

    const lower = question.toLowerCase().trim();

    // Page number extraction
    let targetPageNumber: number | undefined;
    const pageMatch = lower.match(/\bpage\s*(\d+)\b/);
    if (pageMatch && pageMatch[1]) {
      targetPageNumber = parseInt(pageMatch[1], 10);
    }

    // Visual type keywords
    if (lower.includes('chart') || lower.includes('graph') || lower.includes('plot')) {
      return {
        isVisualQuery: true,
        targetPageNumber,
        targetVisualType: 'CHART',
        confidence: 0.95,
        reasoning: 'Query explicitly references a chart or graph.'
      };
    }

    if (lower.includes('table') || lower.includes('column') || lower.includes('rows') || lower.includes('spreadsheet')) {
      return {
        isVisualQuery: true,
        targetPageNumber,
        targetVisualType: 'TABLE',
        confidence: 0.95,
        reasoning: 'Query explicitly references tabular data.'
      };
    }

    if (lower.includes('diagram') || lower.includes('flowchart') || lower.includes('architecture diagram') || lower.includes('schema')) {
      return {
        isVisualQuery: true,
        targetPageNumber,
        targetVisualType: 'DIAGRAM',
        confidence: 0.95,
        reasoning: 'Query explicitly references a diagram.'
      };
    }

    if (lower.includes('image') || lower.includes('picture') || lower.includes('photo') || lower.includes('figure') || lower.includes('illustration')) {
      return {
        isVisualQuery: true,
        targetPageNumber,
        targetVisualType: 'IMAGE',
        confidence: 0.9,
        reasoning: 'Query explicitly references an image or figure.'
      };
    }

    if (lower.includes('scanned') || lower.includes('ocr') || lower.includes('handwritten')) {
      return {
        isVisualQuery: true,
        targetPageNumber,
        targetVisualType: 'OCR',
        confidence: 0.9,
        reasoning: 'Query references scanned page or OCR text.'
      };
    }

    return {
      isVisualQuery: false,
      targetPageNumber,
      confidence: 0.8,
      reasoning: 'Standard textual query.'
    };
  }
}

export const visualQueryClassifier = new VisualQueryClassifier();
