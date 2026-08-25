import { getEncoding } from 'js-tiktoken';
import { LayoutBlock, ParsedDocumentLike, SemanticChunk } from '../document-intelligence.types';
import { findNaturalBoundary } from './boundary-utils';

export interface SemanticChunkerOptions {
  maxTokens: number;
  overlapTokens: number;
}

interface RawChunk {
  pageNumber: number;
  content: string;
  sectionTitle?: string;
}

/**
 * Groups layout blocks (or raw page text, if layout analysis is disabled/unavailable) into
 * chunks respecting a token budget, keeping headings glued to the paragraph(s) that immediately
 * follow them where they fit, and preferring natural boundaries (reusing the same heuristic as
 * the legacy worker chunker) when a single block must be hard-split. Output is structurally
 * compatible with the worker's `Chunk` type.
 */
export class SemanticChunkerService {
  private encoding = getEncoding('cl100k_base');

  public chunk(document: ParsedDocumentLike, options: SemanticChunkerOptions, layoutBlocks?: LayoutBlock[]): SemanticChunk[] {
    if (options.maxTokens <= 0) {
      throw new Error('maxTokens must be greater than 0');
    }
    if (options.overlapTokens < 0 || options.overlapTokens >= options.maxTokens) {
      throw new Error('overlapTokens must be >= 0 and strictly less than maxTokens');
    }

    const blocks = layoutBlocks && layoutBlocks.length > 0 ? layoutBlocks : this.toFallbackBlocks(document);

    const blocksByPage = new Map<number, LayoutBlock[]>();
    for (const block of blocks) {
      const existing = blocksByPage.get(block.pageNumber) ?? [];
      existing.push(block);
      blocksByPage.set(block.pageNumber, existing);
    }

    const pageNumbers = Array.from(blocksByPage.keys()).sort((a, b) => a - b);
    const rawChunks: RawChunk[] = [];

    for (const pageNumber of pageNumbers) {
      rawChunks.push(...this.chunkPageBlocks(blocksByPage.get(pageNumber)!, pageNumber, options));
    }

    return rawChunks.map((c, idx) => {
      const metadata: Record<string, unknown> = {
        source: 'pdf',
        pageNumber: c.pageNumber,
        contentType: 'TEXT',
        chunkingStrategy: 'semantic'
      };
      if (c.sectionTitle) {
        metadata.sectionTitle = c.sectionTitle;
      }

      return {
        chunkIndex: idx,
        pageNumber: c.pageNumber,
        content: c.content,
        tokenCount: this.encoding.encode(c.content).length,
        metadata
      };
    });
  }

  private toFallbackBlocks(document: ParsedDocumentLike): LayoutBlock[] {
    return document.pages
      .filter((p) => p.text && p.text.trim().length > 0)
      .map((p) => ({ type: 'paragraph' as const, text: p.text.trim(), pageNumber: p.pageNumber }));
  }

  private chunkPageBlocks(blocks: LayoutBlock[], pageNumber: number, options: SemanticChunkerOptions): RawChunk[] {
    const results: RawChunk[] = [];

    let currentSectionTitle: string | undefined;
    let bufferParts: string[] = [];
    let bufferTokens = 0;

    const flush = () => {
      const content = bufferParts.join(' ').trim();
      if (content.length > 0) {
        results.push({ pageNumber, content, sectionTitle: currentSectionTitle });
      }
      bufferParts = [];
      bufferTokens = 0;
    };

    for (const block of blocks) {
      if (block.type === 'heading') {
        currentSectionTitle = block.text;
      }

      const blockTokens = this.encoding.encode(block.text).length;

      if (blockTokens >= options.maxTokens) {
        flush();
        results.push(...this.splitOversizedText(block.text, pageNumber, currentSectionTitle, options));
        continue;
      }

      if (bufferTokens + blockTokens > options.maxTokens && bufferParts.length > 0) {
        flush();
      }

      bufferParts.push(block.text);
      bufferTokens += blockTokens;
    }

    flush();
    return results;
  }

  private splitOversizedText(
    text: string,
    pageNumber: number,
    sectionTitle: string | undefined,
    options: SemanticChunkerOptions
  ): RawChunk[] {
    const results: RawChunk[] = [];
    const tokens = this.encoding.encode(text);
    let startTokenIdx = 0;

    while (startTokenIdx < tokens.length) {
      const endTokenIdx = Math.min(startTokenIdx + options.maxTokens, tokens.length);
      const sliceText = this.encoding.decode(tokens.slice(startTokenIdx, endTokenIdx));

      let finalText = sliceText;
      let consumedTokens = endTokenIdx - startTokenIdx;

      if (endTokenIdx < tokens.length) {
        const cutIdx = findNaturalBoundary(sliceText);
        if (cutIdx > Math.floor(sliceText.length * 0.4)) {
          const candidate = sliceText.slice(0, cutIdx).trim();
          const candidateTokens = this.encoding.encode(candidate);
          if (candidateTokens.length > 0) {
            finalText = candidate;
            consumedTokens = candidateTokens.length;
          }
        }
      }

      finalText = finalText.trim();
      if (finalText.length > 0) {
        results.push({ pageNumber, content: finalText, sectionTitle });
      }

      const advance = Math.max(1, consumedTokens - options.overlapTokens);
      startTokenIdx += advance;
    }

    return results;
  }
}

export const semanticChunkerService = new SemanticChunkerService();
