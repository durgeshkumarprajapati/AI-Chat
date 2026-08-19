import { PredefinedQuestionItem, CityInfo, CityExplorerAnswerResult } from '../city-explorer.types';

export interface CityExplorerAnswerProvider {
  readonly name: string;
  supports(_questionItem: PredefinedQuestionItem): boolean;
  generateAnswer(
    _userId: string,
    _city: CityInfo,
    _questionItem: PredefinedQuestionItem,
    _signal?: AbortSignal
  ): Promise<CityExplorerAnswerResult>;
}
