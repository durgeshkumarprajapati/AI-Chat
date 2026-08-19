import { tourRegistry } from '@/features/tours/tour-registry';
import { tourVersionService } from '@/features/tours/tour-version.service';

describe('Tour Engine Unit Tests', () => {
  it('1. Registers all 14 default module tours', () => {
    const all = tourRegistry.getAllTours();
    expect(all.length).toBeGreaterThanOrEqual(14);
  });

  it('2. Resolves route /knowledge-graph to knowledge-graph tour', () => {
    const tour = tourRegistry.getTourForRoute('/knowledge-graph');
    expect(tour.id).toBe('knowledge-graph');
    expect(tour.module).toBe('Knowledge Graph');
  });

  it('3. Resolves route /explore to city-explorer tour', () => {
    const tour = tourRegistry.getTourForRoute('/explore');
    expect(tour.id).toBe('city-explorer');
    expect(tour.module).toBe('City Explorer');
  });

  it('4. Resolves route /study to study tour', () => {
    const tour = tourRegistry.getTourForRoute('/study');
    expect(tour.id).toBe('study');
    expect(tour.module).toBe('AI Study Mode');
  });

  it('5. Detects version update when stored version is lower than current definition version', () => {
    const def = tourRegistry.getTourById('knowledge-graph')!;
    const oldProgress = {
      userId: 'u1',
      tourId: 'knowledge-graph',
      tourVersion: 0, // Lower than def.version (1)
      status: 'COMPLETED' as const,
      currentStep: 9
    };

    const shouldShow = tourVersionService.shouldShowTour(def, oldProgress);
    expect(shouldShow).toBe(true);
  });

  it('6. Does not show tour if already completed on current version', () => {
    const def = tourRegistry.getTourById('knowledge-graph')!;
    const completedProgress = {
      userId: 'u1',
      tourId: 'knowledge-graph',
      tourVersion: 1,
      status: 'COMPLETED' as const,
      currentStep: 9
    };

    const shouldShow = tourVersionService.shouldShowTour(def, completedProgress);
    expect(shouldShow).toBe(false);
  });
});
