import { googleCalendarRepository } from './google-calendar.repository';
import { calendarSyncService } from './google-calendar.service';

export class CalendarRetryService {
  /**
   * Worker job execution loop for Google Calendar synchronization retries
   */
  public async processPendingAndRetryJobs(batchSize = 20): Promise<{ processed: number; successCount: number; failureCount: number }> {
    const jobs = await googleCalendarRepository.findEligibleRetryJobs(batchSize);

    let successCount = 0;
    let failureCount = 0;

    for (const job of jobs) {
      try {
        const result = await calendarSyncService.synchronizeMockTest(job.mockTestId, job.userId);
        if (result?.status === 'SYNCED') {
          successCount++;
        } else {
          failureCount++;
        }
      } catch (err) {
        console.error(`[CalendarRetryService] Error processing sync job id=${job.id}:`, err);
        failureCount++;
      }
    }

    return {
      processed: jobs.length,
      successCount,
      failureCount
    };
  }
}

export const calendarRetryService = new CalendarRetryService();
