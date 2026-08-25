import { ExtractedTableDTO } from '../multimodal.types';

export interface TableExtractionProvider {
  readonly name: string;
  extractFromText(_text: string, _pageNumber: number): Promise<ExtractedTableDTO[]>;
  supports(): boolean;
}
