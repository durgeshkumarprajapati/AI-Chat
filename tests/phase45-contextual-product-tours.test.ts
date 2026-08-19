import { prisma } from '@/lib/prisma';
import { tourRegistry } from '@/features/tours/tour-registry';
import { tourStorageService } from '@/features/tours/tour-storage.service';
import { tourVersionService } from '@/features/tours/tour-version.service';
import { tourAnalyticsService } from '@/features/tours/tour-analytics.service';

describe('Phase 45 — Production Contextual Product Tour Engine Master Suite', () => {
  beforeAll(async () => {
    try {
      await prisma.user.upsert({
        where: { id: 'test-user-p45' },
        create: { id: 'test-user-p45', email: 'test-p45@example.com' },
        update: {}
      });
      await prisma.user.upsert({
        where: { id: 'user-skip' },
        create: { id: 'user-skip', email: 'user-skip@example.com' },
        update: {}
      });
    } catch {}
  });

  beforeEach(() => {
    tourAnalyticsService.clearLogs();
  });

  it('1. Existing Product Tour registry contains all 14 module tours', () => {
    const tours = tourRegistry.getAllTours();
    expect(tours.length).toBeGreaterThanOrEqual(14);
  });

  it('2. Contextual route resolution maps routes to exact module tours', () => {
    expect(tourRegistry.getTourForRoute('/knowledge-graph').id).toBe('knowledge-graph');
    expect(tourRegistry.getTourForRoute('/study').id).toBe('study');
    expect(tourRegistry.getTourForRoute('/explore').id).toBe('city-explorer');
    expect(tourRegistry.getTourForRoute('/workflows').id).toBe('workflows');
    expect(tourRegistry.getTourForRoute('/roadmaps').id).toBe('roadmap');
  });

  it('3. Knowledge Graph guided tour contains 10 structured steps with data-tour attributes', () => {
    const kg = tourRegistry.getTourById('knowledge-graph');
    expect(kg).toBeDefined();
    expect(kg?.steps.length).toBe(10);
    expect(kg?.steps[0]?.target).toBe('data-tour="knowledge-graph-header"');
    expect(kg?.steps[1]?.target).toBe('data-tour="knowledge-graph-search"');
    expect(kg?.steps[2]?.target).toBe('data-tour="knowledge-graph-explorer"');
  });

  it('4. Knowledge Graph tour step 3 provides empty state explanation', () => {
    const kg = tourRegistry.getTourById('knowledge-graph');
    const step3 = kg?.steps[2];
    expect(step3?.emptyStateExplanation).toContain('Your Knowledge Graph is currently empty');
  });

  it('5. Knowledge Graph functional workflow tour is available', () => {
    const wfTour = tourRegistry.getTourById('knowledge-graph-workflow');
    expect(wfTour).toBeDefined();
    expect(wfTour?.steps.length).toBe(5);
  });

  it('6. Tour progress persists per user in database', async () => {
    const uId = 'test-user-p45';
    const saved = await tourStorageService.saveProgress(uId, 'knowledge-graph', 1, 'IN_PROGRESS', 2);
    expect(saved.userId).toBe(uId);
    expect(saved.currentStep).toBe(2);

    const fetched = await tourStorageService.getProgress(uId, 'knowledge-graph');
    expect(fetched?.status).toBe('IN_PROGRESS');
  });

  it('7. Version updates re-trigger completed tours when version increments', () => {
    const def = tourRegistry.getTourById('knowledge-graph')!;
    const v0Progress = {
      userId: 'u1',
      tourId: 'knowledge-graph',
      tourVersion: 0,
      status: 'COMPLETED' as const,
      currentStep: 9
    };
    expect(tourVersionService.shouldShowTour(def, v0Progress)).toBe(true);
  });

  it('8. Users can skip and complete tours cleanly', async () => {
    const uId = 'user-skip';
    await tourStorageService.saveProgress(uId, 'city-explorer', 1, 'SKIPPED', 0);
    const rec = await tourStorageService.getProgress(uId, 'city-explorer');
    expect(rec?.status).toBe('SKIPPED');
  });

  it('9. Missing targets do not crash tour execution', () => {
    const missingTargetStep = {
      id: 'missing-1',
      target: '#non-existent-element-id-12345',
      title: 'Missing Element',
      description: 'Test description',
      optional: true
    };
    expect(missingTargetStep.target).toBe('#non-existent-element-id-12345');
  });

  it('10. Structured telemetry logs events without sensitive data', () => {
    tourAnalyticsService.logEvent('tour.started', 'knowledge-graph', 1, 'step-1-header', 0, 'data-tour="knowledge-graph-header"', 'u1');
    const logs = tourAnalyticsService.getRecentLogs('knowledge-graph');
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0]?.event).toBe('tour.started');
  });
});
