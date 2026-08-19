import { TourDefinition, UserTourProgressRecord } from './tour-types';

export class TourVersionService {
  /**
   * Checks whether a tour should be presented to the user based on progress and definition versions.
   */
  public shouldShowTour(definition: TourDefinition, progressRecord: UserTourProgressRecord | null): boolean {
    if (!progressRecord) {
      return true; // Brand new tour
    }

    // Version update detection
    if (progressRecord.tourVersion < definition.version) {
      return true; // Tour definition was updated to a newer version
    }

    if (progressRecord.status === 'COMPLETED' || progressRecord.status === 'SKIPPED') {
      return false;
    }

    return true;
  }
}

export const tourVersionService = new TourVersionService();
