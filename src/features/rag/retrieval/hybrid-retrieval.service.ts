import { VectorRetriever, vectorRetriever } from './vector-retriever';
import { KeywordRetriever, keywordRetriever } from './keyword-retriever';
import { GraphRetriever, graphRetriever } from './graph-retriever';
import { RetrievedChunk, RetrievalOptions } from './retrieval.types';

export class HybridRetrievalService {
  private vector: VectorRetriever;
  private keyword: KeywordRetriever;
  private graph: GraphRetriever;

  constructor(
    vector: VectorRetriever = vectorRetriever,
    keyword: KeywordRetriever = keywordRetriever,
    graph: GraphRetriever = graphRetriever
  ) {
    this.vector = vector;
    this.keyword = keyword;
    this.graph = graph;
  }

  /**
   * Executes Vector, Keyword, and Graph retrieval strategies concurrently.
   */
  public async retrieveAll(
    userId: string,
    queries: string[],
    options?: RetrievalOptions
  ): Promise<{
    vectorResults: RetrievedChunk[];
    keywordResults: RetrievedChunk[];
    graphResults: RetrievedChunk[];
  }> {
    const primaryQuery = queries[0] || '';
    const fetchPromises: [
      Promise<RetrievedChunk[]>,
      Promise<RetrievedChunk[]>,
      Promise<RetrievedChunk[]>
    ] = [
      Promise.all(queries.map((q) => this.vector.retrieve(userId, q, options))).then((res) =>
        res.flat()
      ),
      Promise.all(queries.map((q) => this.keyword.retrieve(userId, q, options))).then((res) =>
        res.flat()
      ),
      this.graph.retrieve(userId, primaryQuery, options).catch(() => [])
    ];

    const [vectorResults, keywordResults, graphResults] = await Promise.all(fetchPromises);

    return {
      vectorResults,
      keywordResults,
      graphResults
    };
  }
}

export const hybridRetrievalService = new HybridRetrievalService();
