import { TableExtractionProvider } from './table-extraction-provider.interface';
import { heuristicTableProvider } from './heuristic-table.provider';

/**
 * Unlike OCR/Vision, the "mock" default here IS the real (if naive) heuristic extractor — it
 * operates on already-extracted page text, needs no credentials, and is safe to run by default.
 * 'heuristic' is registered as an explicit alias for the same provider. Any other configured name
 * (google/aws/azure) falls back to the heuristic provider since no real cloud implementation
 * exists this pass.
 */
export class TableProviderRegistry {
  private providers = new Map<string, TableExtractionProvider>([
    ['mock', heuristicTableProvider],
    ['heuristic', heuristicTableProvider]
  ]);

  public register(provider: TableExtractionProvider): void {
    this.providers.set(provider.name, provider);
  }

  public get(name: string): TableExtractionProvider {
    return this.providers.get(name) ?? heuristicTableProvider;
  }
}

export const tableProviderRegistry = new TableProviderRegistry();
