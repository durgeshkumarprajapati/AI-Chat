export class MockTestLibraryTelemetryService {
  public logLibraryViewed(userId: string, filterStatus?: string) {
    console.log(`[Telemetry] mock_test.library.viewed userId=${userId} filterStatus=${filterStatus || 'ALL'}`);
  }

  public logMockTestOpened(userId: string, mockTestId: string) {
    console.log(`[Telemetry] mock_test.opened userId=${userId} mockTestId=${mockTestId}`);
  }

  public logSearch(userId: string, query: string, resultCount: number) {
    console.log(`[Telemetry] mock_test.search userId=${userId} query="${query}" resultCount=${resultCount}`);
  }

  public logShared(userId: string, mockTestId: string, channelId: string) {
    console.log(`[Telemetry] mock_test.shared userId=${userId} mockTestId=${mockTestId} channelId=${channelId}`);
  }

  public logQuestionViewed(userId: string, mockTestId: string, questionCount: number) {
    console.log(`[Telemetry] mock_test.question.viewed userId=${userId} mockTestId=${mockTestId} questionCount=${questionCount}`);
  }
}

export const mockTestLibraryTelemetryService = new MockTestLibraryTelemetryService();
