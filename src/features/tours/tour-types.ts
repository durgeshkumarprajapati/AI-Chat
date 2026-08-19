export type TourStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';

export type PlacementPosition = 'top' | 'bottom' | 'left' | 'right' | 'auto';

export interface TourStepAction {
  label: string;
  type: 'navigate' | 'click' | 'custom';
  target?: string;
  route?: string;
}

export interface TourStepDefinition {
  id: string;
  target: string;
  title: string;
  description: string;
  technicalDetails?: string;
  icon?: string;
  placement?: PlacementPosition;
  route?: string;
  requiredPermission?: string;
  optional?: boolean;
  waitForTargetMs?: number;
  action?: TourStepAction;
  emptyStateExplanation?: string;
}

export interface TourDefinition {
  id: string;
  version: number;
  module: string;
  title: string;
  badge?: string;
  description?: string;
  routePattern?: string;
  steps: TourStepDefinition[];
}

export interface UserTourProgressRecord {
  id?: string;
  userId: string;
  tourId: string;
  tourVersion: number;
  status: TourStatus;
  currentStep: number;
  startedAt?: string | null;
  completedAt?: string | null;
  skippedAt?: string | null;
  lastSeenAt?: string | null;
}

export interface TourTelemetryEvent {
  event:
    | 'tour.started'
    | 'tour.step_viewed'
    | 'tour.step_completed'
    | 'tour.skipped'
    | 'tour.completed'
    | 'tour.dismissed'
    | 'tour.target_missing'
    | 'tour.version_updated';
  userId?: string;
  tourId: string;
  tourVersion: number;
  stepId?: string;
  stepIndex?: number;
  target?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}
