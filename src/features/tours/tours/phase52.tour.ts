import { TourDefinition } from '../tour-types';

export const phase52GoogleCalendarAutoSyncTour: TourDefinition = {
  id: 'phase52-google-calendar-auto-sync-tour',
  module: 'google-calendar-auto-sync',
  title: 'Google Calendar Auto-Sync Tour',
  description: 'Learn about production automatic Google Calendar synchronization, status diagnostic badges, attendee invitations, and background retry infrastructure.',
  version: 1,
  routePattern: '^/study/mock-tests',
  steps: [
    {
      id: 'calendar-auto-sync-info',
      title: 'Automatic Event Creation',
      description: 'Scheduled mock tests automatically create events in your Google Calendar timeline with 0 manual clicks required.',
      target: 'data-tour="calendar-auto-sync-info"',
      placement: 'bottom'
    },
    {
      id: 'calendar-status-badge',
      title: 'Real-Time Sync Status',
      description: 'Check whether your event is Synced, Syncing, Pending Retry, or Re-authorization Required.',
      target: 'data-tour="calendar-status-badge"',
      placement: 'bottom'
    },
    {
      id: 'open-calendar-action',
      title: 'Direct Calendar Access',
      description: 'Click "Open Calendar" to view your created Google Calendar event with attendee updates and notification reminders.',
      target: 'data-tour="open-calendar-action"',
      placement: 'bottom'
    }
  ]
};
