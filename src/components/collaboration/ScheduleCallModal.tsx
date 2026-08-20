'use client';

import React, { useState, useEffect } from 'react';

interface MemberItem {
  id: string;
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  user: {
    id: string;
    name: string | null;
    email: string;
    avatarUrl?: string | null;
  };
}

interface ScheduleCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelId: string;
  channelName: string;
  channelType: 'DIRECT' | 'GROUP';
  members: MemberItem[];
  currentUserId: string;
  onSuccess: (_scheduledCall: any) => void;
}

export const ScheduleCallModal: React.FC<ScheduleCallModalProps> = ({
  isOpen,
  onClose,
  channelId,
  channelName,
  channelType,
  members,
  currentUserId,
  onSuccess
}) => {
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [timezone, setTimezone] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Google Calendar Integration Diagnostics
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState<boolean | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Default title
      setTitle(`Sync Call with ${channelName}`);

      // Default date & time (tomorrow at 10:00 AM local)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);

      const yyyy = tomorrow.getFullYear();
      const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
      const dd = String(tomorrow.getDate()).padStart(2, '0');
      setStartDate(`${yyyy}-${mm}-${dd}`);
      setStartTime('10:00');

      // User local timezone
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        setTimezone(tz);
      } catch {
        setTimezone('UTC');
      }

      // Default participants: all channel members
      const memberUserIds = members.map((m) => m.userId);
      setSelectedUserIds(memberUserIds);

      setErrorMessage(null);

      // Check Google Calendar connection status
      checkGoogleCalendarStatus();
    }
  }, [isOpen, channelName, members]);

  const checkGoogleCalendarStatus = async () => {
    try {
      const res = await fetch('/api/integrations/google/status');
      if (res.ok) {
        const data = await res.json();
        setGoogleCalendarConnected(Boolean(data.connected || data.isConnected));
      } else {
        setGoogleCalendarConnected(false);
      }
    } catch {
      setGoogleCalendarConnected(false);
    }
  };

  if (!isOpen) return null;

  const handleToggleParticipant = (userId: string) => {
    if (userId === currentUserId) return; // Organizer must stay checked
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMessage('Call title is required');
      return;
    }
    if (!startDate || !startTime) {
      setErrorMessage('Date and start time are required');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      // Combine date & time into ISO string
      const scheduledStartAt = new Date(`${startDate}T${startTime}:00`).toISOString();

      const res = await fetch('/api/collaboration/calls/scheduled', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId,
          title: title.trim(),
          scheduledStartAt,
          durationMinutes,
          timezone,
          participantUserIds: selectedUserIds
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to schedule call');
      }

      onSuccess(data.data);
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to schedule call');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/50">
          <div className="flex items-center space-x-2">
            <span className="text-xl">📹</span>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Schedule a Google Meet Call
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg transition"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Calendar Connection Status Alert */}
          {googleCalendarConnected === false && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl space-y-2">
              <div className="flex items-start space-x-2 text-amber-900 dark:text-amber-200">
                <span className="text-sm">⚠</span>
                <p className="leading-relaxed">
                  <strong>Google Calendar is not connected.</strong> Connect your Google account to automatically generate a Google Meet link and send invites.
                </p>
              </div>
              <a
                href="/api/integrations/google/connect"
                target="_blank"
                rel="noreferrer"
                className="inline-block px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition text-[11px]"
              >
                Connect Google Calendar →
              </a>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 rounded-xl text-rose-700 dark:text-rose-300 font-medium">
              {errorMessage}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Call Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Weekly Team Sync"
              className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          {/* Date & Start Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Date *
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Start Time *
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
          </div>

          {/* Duration & Timezone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Duration
              </label>
              <select
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value={15}>15 Minutes</option>
                <option value={30}>30 Minutes</option>
                <option value={45}>45 Minutes</option>
                <option value={60}>1 Hour</option>
                <option value={90}>1.5 Hours</option>
                <option value={120}>2 Hours</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Timezone
              </label>
              <input
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="e.g. Asia/Kolkata or UTC"
                className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Participants Selection (for Group channels) */}
          {channelType === 'GROUP' && (
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Participants ({selectedUserIds.length}/{members.length})
              </label>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 border border-slate-200 dark:border-slate-800 rounded-xl p-2 bg-slate-50 dark:bg-slate-950/40">
                {members.map((m) => {
                  const isChecked = selectedUserIds.includes(m.userId);
                  const isOrganizer = m.userId === currentUserId;

                  return (
                    <label
                      key={m.userId}
                      className="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-850 cursor-pointer transition"
                    >
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isOrganizer}
                          onChange={() => handleToggleParticipant(m.userId)}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {m.user.name || m.user.email}
                        </span>
                        {isOrganizer && (
                          <span className="text-[9px] bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded font-mono">
                            Organizer
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        {m.user.email}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition shadow-md disabled:opacity-50 flex items-center space-x-1.5"
            >
              <span>{isSubmitting ? 'Scheduling...' : 'Schedule Call'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
