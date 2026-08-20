'use client';

import React, { useState } from 'react';

export interface ScheduledCallData {
  id: string;
  channelId: string;
  createdById: string;
  title: string;
  callType: 'ONE_TO_ONE' | 'GROUP';
  status: 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'CANCELLED';
  scheduledStartAt: string;
  scheduledEndAt: string;
  durationMinutes: number;
  timezone: string;
  googleCalendarEventId?: string | null;
  googleCalendarEventUrl?: string | null;
  googleMeetUrl?: string | null;
  calendarSyncStatus: 'PENDING' | 'SYNCING' | 'SYNCED' | 'RETRY_PENDING' | 'FAILED' | 'REAUTH_REQUIRED' | 'NOT_CONNECTED' | 'CANCELLED';
  calendarSyncError?: string | null;
  createdBy?: { id: string; name: string | null; email: string; avatarUrl?: string | null };
  participants?: Array<{ id: string; userId: string; email?: string | null; name?: string | null }>;
}

interface ScheduledCallCardProps {
  call: ScheduledCallData;
  currentUserId: string;
  onReschedule?: (_call: ScheduledCallData) => void;
  onCancel?: (_call: ScheduledCallData) => void;
}

export const ScheduledCallCard: React.FC<ScheduledCallCardProps> = ({
  call,
  currentUserId,
  onReschedule,
  onCancel
}) => {
  const [isCancelling, setIsCancelling] = useState(false);

  const isOrganizer = call.createdById === currentUserId;
  const isCancelled = call.status === 'CANCELLED' || call.calendarSyncStatus === 'CANCELLED';
  const isSynced = call.calendarSyncStatus === 'SYNCED' && Boolean(call.googleMeetUrl);
  const isSyncing = call.calendarSyncStatus === 'PENDING' || call.calendarSyncStatus === 'SYNCING' || call.calendarSyncStatus === 'RETRY_PENDING';
  const isReauth = call.calendarSyncStatus === 'REAUTH_REQUIRED' || call.calendarSyncStatus === 'NOT_CONNECTED';

  // Format date and time
  const startDate = new Date(call.scheduledStartAt);
  const dateString = isNaN(startDate.getTime())
    ? call.scheduledStartAt
    : startDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const timeString = isNaN(startDate.getTime())
    ? ''
    : startDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  const handleCancelClick = async () => {
    if (!window.confirm('Are you sure you want to cancel this scheduled call?')) return;
    setIsCancelling(true);
    try {
      const res = await fetch(`/api/collaboration/calls/scheduled/${call.id}`, {
        method: 'DELETE'
      });
      if (res.ok && onCancel) {
        const data = await res.json();
        onCancel(data.data || call);
      }
    } catch (err) {
      console.error('Failed to cancel call:', err);
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/90 shadow-md p-4 space-y-3 font-sans text-xs">
      {/* Header Badge & Sync Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold text-[11px] border border-indigo-200 dark:border-indigo-800/60">
          <span>📹</span>
          <span>SCHEDULED GOOGLE MEET</span>
        </div>

        {/* Sync Status Badge */}
        {isCancelled ? (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            ❌ Cancelled
          </span>
        ) : isSynced ? (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            ✓ Calendar Synced
          </span>
        ) : isSyncing ? (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 animate-pulse">
            ⏳ Creating Google Meet...
          </span>
        ) : isReauth ? (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
            ⚠ Reauth Required
          </span>
        ) : (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            ⚠ Sync Failed
          </span>
        )}
      </div>

      {/* Call Title */}
      <div>
        <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
          {call.title}
        </h4>
        {call.createdBy && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Organized by {call.createdBy.name || call.createdBy.email}
          </p>
        )}
      </div>

      {/* Schedule Info Box */}
      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800/60 space-y-1">
        <div className="flex items-center space-x-2 text-slate-700 dark:text-slate-300 font-medium">
          <span>📅</span>
          <span>{dateString}</span>
        </div>
        <div className="flex items-center space-x-2 text-slate-700 dark:text-slate-300 font-medium">
          <span>⏰</span>
          <span>{timeString} ({call.durationMinutes} mins)</span>
          <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
            • {call.timezone}
          </span>
        </div>
      </div>

      {/* Primary Actions */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {/* Join Google Meet Button */}
        {call.googleMeetUrl && !isCancelled ? (
          <a
            href={call.googleMeetUrl}
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition shadow-sm flex items-center space-x-1.5 text-xs"
          >
            <span>📹</span>
            <span>Join Google Meet</span>
          </a>
        ) : (
          <button
            disabled
            className="px-3.5 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 font-medium cursor-not-allowed text-xs flex items-center space-x-1.5"
            title={isCancelled ? 'Call cancelled' : 'Preparing Google Meet link...'}
          >
            <span>📹</span>
            <span>{isCancelled ? 'Call Cancelled' : 'Preparing Google Meet...'}</span>
          </button>
        )}

        {/* Open Calendar Button */}
        {call.googleCalendarEventUrl ? (
          <a
            href={call.googleCalendarEventUrl}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium transition text-xs flex items-center space-x-1"
          >
            <span>🗓</span>
            <span>Open Calendar</span>
          </a>
        ) : isReauth ? (
          <a
            href="/api/integrations/google/connect"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-medium transition text-xs"
          >
            Connect Calendar
          </a>
        ) : null}

        {/* Organizer Reschedule & Cancel Controls */}
        {isOrganizer && !isCancelled && (
          <div className="flex items-center space-x-1.5 ml-auto">
            {onReschedule && (
              <button
                onClick={() => onReschedule(call)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium transition text-xs"
              >
                Reschedule
              </button>
            )}
            <button
              onClick={handleCancelClick}
              disabled={isCancelling}
              className="px-2.5 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 font-medium border border-rose-200 dark:border-rose-800/50 transition text-xs disabled:opacity-50"
            >
              {isCancelling ? 'Cancelling...' : 'Cancel'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
