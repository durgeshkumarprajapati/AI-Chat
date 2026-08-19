import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { NotificationPayload, UserNotificationPreferences } from '@/features/notifications/notification.types';

export default function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationPayload[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [preferences, setPreferences] = useState<UserNotificationPreferences | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/unread-count');
      const data = await res.json();
      if (data.success && data.data) {
        setUnreadCount(data.data.unreadCount);
      }
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
    }
  }, []);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/notifications?limit=20');
      const data = await res.json();
      if (data.success && data.data) {
        setNotifications(data.data.notifications);
        setUnreadCount(data.data.unreadCount);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch preferences
  const fetchPreferences = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/preferences');
      const data = await res.json();
      if (data.success && data.data) {
        setPreferences(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch preferences:', err);
    }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  // Real-time SSE listener for notification events
  useEffect(() => {
    const eventSource = new EventSource('/api/collaboration/events');

    eventSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);

        if (event.type === 'notification:new') {
          const newNotif = event.data?.notification as NotificationPayload;
          if (newNotif) {
            setNotifications((prev) => [newNotif, ...prev.filter((n) => n.id !== newNotif.id)]);
          }
          if (typeof event.data?.unreadCount === 'number') {
            setUnreadCount(event.data.unreadCount);
          } else {
            setUnreadCount((prev) => prev + 1);
          }
        } else if (event.type === 'notification:read') {
          const notifId = event.data?.notificationId;
          if (notifId) {
            setNotifications((prev) =>
              prev.map((n) => (n.id === notifId ? { ...n, isRead: true } : n))
            );
          }
          if (typeof event.data?.unreadCount === 'number') {
            setUnreadCount(event.data.unreadCount);
          }
        } else if (event.type === 'notification:count') {
          if (typeof event.data?.unreadCount === 'number') {
            setUnreadCount(event.data.unreadCount);
          }
        }
      } catch {}
    };

    return () => {
      eventSource.close();
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = () => {
    if (!isOpen) {
      fetchNotifications();
    }
    setIsOpen(!isOpen);
  };

  const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
      const data = await res.json();
      if (data.success) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const res = await fetch('/api/notifications/read-all', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setUnreadCount(0);
      }
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const handleSavePreferences = async (updated: UserNotificationPreferences) => {
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      const data = await res.json();
      if (data.success && data.data) {
        setPreferences(data.data);
        setShowPreferences(false);
      }
    } catch (err) {
      console.error('Failed to save preferences:', err);
    }
  };

  const getDeepLink = (n: NotificationPayload): string => {
    if (n.channelId) {
      return `/collab-chat?channel=${n.channelId}${n.messageId ? `&message=${n.messageId}` : ''}`;
    }
    if (n.type === 'ROADMAP_SHARED' && n.metadata?.roadmapId) {
      return `/roadmaps/${n.metadata.roadmapId}`;
    }
    return '/collab-chat';
  };

  return (
    <div className="relative inline-block" ref={containerRef} data-tour="notification-center">
      {/* Bell Button */}
      <button
        onClick={handleToggle}
        className="relative p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition focus:outline-none"
        aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
      >
        <span className="text-xl">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 px-1.5 py-0.5 min-w-[18px] h-[18px] text-[10px] font-bold text-white bg-rose-600 rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900 animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notifications Dropdown Drawer */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[500px]">
          {/* Header */}
          <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/50">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-sm text-slate-900 dark:text-white">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded-full font-mono">
                  {unreadCount} new
                </span>
              )}
            </div>

            <div className="flex items-center space-x-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => {
                  fetchPreferences();
                  setShowPreferences(true);
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs p-1"
                aria-label="Notification Preferences"
                title="Notification Settings"
              >
                ⚙️
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400 animate-pulse">Loading notifications...</div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 space-y-1">
                <p className="text-xl">🔕</p>
                <p>No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => (
                <Link
                  key={n.id}
                  href={getDeepLink(n)}
                  onClick={() => {
                    if (!n.isRead) handleMarkAsRead(n.id, { stopPropagation: () => {} } as any);
                    setIsOpen(false);
                  }}
                  className={`p-3.5 flex items-start space-x-3 transition cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-850 ${
                    !n.isRead ? 'bg-indigo-50/40 dark:bg-indigo-950/20 font-semibold' : ''
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 text-sm flex items-center justify-center flex-shrink-0 mt-0.5">
                    {n.type === 'MESSAGE_RECEIVED'
                      ? '💬'
                      : n.type === 'GROUP_MEMBER_REMOVED'
                      ? '🚫'
                      : n.type === 'GROUP_OWNER_CHANGED'
                      ? '👑'
                      : n.type === 'ROADMAP_SHARED'
                      ? '🚀'
                      : '🔔'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{n.title}</p>
                      <span className="text-[10px] text-slate-400 flex-shrink-0 ml-2">
                        {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 mt-0.5">{n.body}</p>
                  </div>

                  {!n.isRead && (
                    <button
                      onClick={(e) => handleMarkAsRead(n.id, e)}
                      className="w-2 h-2 rounded-full bg-indigo-600 hover:scale-125 transition flex-shrink-0 self-center"
                      title="Mark as read"
                    />
                  )}
                </Link>
              ))
            )}
          </div>
        </div>
      )}

      {/* Notification Preferences Modal */}
      {showPreferences && preferences && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Notification Preferences</h3>
              <button onClick={() => setShowPreferences(false)} className="text-slate-400 hover:text-white text-xs">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {[
                { key: 'directMessages', label: 'Direct Messages' },
                { key: 'groupMessages', label: 'Group Messages' },
                { key: 'mentions', label: '@Mentions & Replies' },
                { key: 'groupMembership', label: 'Group Membership & Roles' },
                { key: 'roadmapShares', label: 'Shared Workspaces & Roadmaps' },
                { key: 'aiReplies', label: 'AI Discussions & Answers' }
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                  <span className="text-slate-700 dark:text-slate-300 font-medium">{label}</span>
                  <input
                    type="checkbox"
                    checked={(preferences as any)[key]}
                    onChange={(e) =>
                      setPreferences((prev) => (prev ? { ...prev, [key]: e.target.checked } : null))
                    }
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                  />
                </label>
              ))}
            </div>

            <div className="flex justify-end space-x-3 border-t border-slate-200 dark:border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setShowPreferences(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSavePreferences(preferences)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-md transition"
              >
                Save Preferences
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
