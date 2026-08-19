'use client';

import { usePathname } from 'next/navigation';
import { tourRegistry } from '../tour-registry';
import { TourDefinition } from '../tour-types';

export interface UseContextualTourResult {
  activeTour: TourDefinition;
  buttonTitle: string;
  moduleName: string;
}

export function useContextualTour(): UseContextualTourResult {
  const pathname = usePathname() || '/';
  const activeTour = tourRegistry.getTourForRoute(pathname);

  const buttonTitle = `${activeTour.module} Tour`;

  return {
    activeTour,
    buttonTitle,
    moduleName: activeTour.module
  };
}
