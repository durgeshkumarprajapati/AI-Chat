'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useWorkspace } from '@/context/WorkspaceContext';
import { mergeMessages, CollabMessageItem } from '@/features/collaboration/message-deduplication';
import { formatMessageTimestamp, groupMessagesByDate } from '@/features/collaboration/message-time';

interface UserSummary {
  id: string;
  name: string | null;
  email: string;
  role: string;
  avatarUrl?: string | null;
}

interface PresenceState {
  status: 'ONLINE' | 'AWAY' | 'OFFLINE';
  lastSeenAt?: string;
}

interface MemberItem {
  id: string;
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  user: UserSummary;
  presence?: PresenceState;
}

interface MessageItem extends CollabMessageItem {
  id: string;
  channelId: string;
  senderId: string;
  messageType?: 'TEXT' | 'VOICE' | 'CALL_EVENT';
  content: string;
  replyToId?: string | null;
  isEdited: boolean;
  isDeleted: boolean;
  isAi: boolean;
  aiModel?: string | null;
  sharedRoadmapId?: string | null;
  sharedRoadmapStepId?: string | null;
  sharedEntityId?: string | null;
  sharedDocumentId?: string | null;
  sharedStudyQuestionId?: string | null;
  sharedMockTestId?: string | null;
  callSessionId?: string | null;
  sharedMockTest?: {
    id: string;
    title: string;
    topic?: string | null;
    scheduledStartTime: string;
    durationMinutes: number;
    totalQuestions: number;
    googleCalendarLink?: string | null;
  } | null;
  voiceDurationMs?: number | null;
  voiceMimeType?: string | null;
  voiceStorageKey?: string | null;
  voiceFileSizeBytes?: number | null;
  clientMessageId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  sender: UserSummary;
  replyTo?: { id: string; content: string; sender: { name: string | null; email: string } } | null;
  status?: 'SENDING' | 'SENT' | 'FAILED' | 'DELIVERED' | 'READ';
  receipts?: Array<{ id: string; userId: string; status: string; deliveredAt?: string | Date | null; readAt?: string | Date | null }>;
  mentions?: Array<{ id: string; mentionedUserId: string; mentionedUser?: { id: string; name: string | null; email: string } }>;
}

interface ChannelItem {
  id: string;
  name: string | null;
  description: string | null;
  type: 'DIRECT' | 'GROUP';
  avatarUrl?: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  members: MemberItem[];
  latestMessage?: MessageItem | null;
  unreadCount: number;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
}

interface ActiveCallState {
  id: string;
  channelId: string;
  type: 'VOICE' | 'VIDEO';
  status: 'RINGING' | 'IN_CALL' | 'ENDED';
  hostName: string;
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  startedAt?: string;
}

interface IncomingCallInvite {
  callId: string;
  channelId: string;
  hostId: string;
  hostName: string;
  callType: 'VOICE' | 'VIDEO';
}

function VoiceMessagePlayer({ msg }: { msg: MessageItem }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const durationSec = Math.round((msg.voiceDurationMs || 5000) / 1000);
  const audioUrl = `/api/collaboration/voice/${msg.id}`;

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {});
    }
  };

  return (
    <div className="flex items-center space-x-3 p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-white min-w-[240px]">
      <audio
        ref={audioRef}
        src={audioUrl}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        onTimeUpdate={() => {
          if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
        }}
      />
      <button
        type="button"
        onClick={togglePlay}
        className="w-8 h-8 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center justify-center text-xs shadow transition shrink-0"
        aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      <div className="flex-1 space-y-1">
        <div
          className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden cursor-pointer"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            if (audioRef.current) {
              audioRef.current.currentTime = pct * (audioRef.current.duration || durationSec);
            }
          }}
        >
          <div
            className="bg-indigo-500 h-1.5 rounded-full transition-all duration-100"
            style={{ width: `${(currentTime / (audioRef.current?.duration || durationSec)) * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 font-mono">
          <span>{Math.floor(currentTime / 60)}:{Math.floor(currentTime % 60).toString().padStart(2, '0')}</span>
          <span>{Math.floor(durationSec / 60)}:{Math.floor(durationSec % 60).toString().padStart(2, '0')}</span>
        </div>
      </div>
    </div>
  );
}

function SharedMockTestCard({ msg }: { msg: MessageItem }) {
  const test = msg.sharedMockTest;
  const testId = msg.sharedMockTestId || test?.id;
  if (!testId) return null;

  const title = test?.title || 'Scheduled AI Mock Test';
  const topic = test?.topic || 'General Practice';
  const duration = test?.durationMinutes || 30;
  const questionsCount = test?.totalQuestions || 10;
  const calLink = test?.googleCalendarLink;

  return (
    <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-900/90 to-purple-900/90 border border-indigo-500/40 text-white space-y-3 min-w-[280px] shadow-lg">
      <div className="flex items-center space-x-2">
        <span className="text-lg">📝</span>
        <span className="font-bold text-xs uppercase tracking-wider text-indigo-300">Scheduled AI Mock Test</span>
      </div>
      <div>
        <h4 className="text-sm font-bold truncate">{title}</h4>
        <p className="text-[11px] text-indigo-200 mt-0.5">{topic} • {duration} mins • {questionsCount} MCQs</p>
      </div>
      <div className="flex flex-wrap gap-2 pt-1 border-t border-indigo-500/30">
        {calLink && (
          <a
            href={calLink}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold rounded-xl transition flex items-center space-x-1"
          >
            <span>📅</span>
            <span>Google Calendar</span>
          </a>
        )}
        <a
          href={`/api/study/mock-tests/${testId}/ics`}
          download
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold rounded-xl transition flex items-center space-x-1"
        >
          <span>📥</span>
          <span>.ics</span>
        </a>
        <Link
          href={`/study/mock-tests/${testId}`}
          className="px-3.5 py-1.5 bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-[11px] rounded-xl shadow transition flex items-center space-x-1"
        >
          <span>🚀</span>
          <span>Take Test</span>
        </Link>
      </div>
    </div>
  );
}

function CallEventMessageCard({ msg }: { msg: MessageItem }) {
  const isMissed = msg.content.includes('Missed') || msg.metadata?.status === 'MISSED';
  const isDeclined = msg.content.includes('declined') || msg.metadata?.status === 'DECLINED';
  const isVideo = msg.metadata?.callType === 'VIDEO' || msg.content.includes('video');
  const isGroup = msg.metadata?.isGroup || msg.content.includes('Group');

  return (
    <div className="p-3.5 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2 max-w-sm text-slate-100 shadow-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-base">{isVideo ? '📹' : '📞'}</span>
          <span className="font-bold text-xs text-white">
            {isGroup ? 'Group Call Event' : isVideo ? 'Video Call' : 'Voice Call'}
          </span>
        </div>
        <span
          className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
            isMissed
              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
              : isDeclined
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
          }`}
        >
          {isMissed ? 'Missed' : isDeclined ? 'Declined' : 'Ended'}
        </span>
      </div>

      <p className="text-xs text-slate-300 font-medium">{msg.content}</p>

      <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
        <Link
          href="/collab-chat/calls"
          className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold transition flex items-center space-x-1"
        >
          <span>View call history</span>
          <span>→</span>
        </Link>
      </div>
    </div>
  );
}

function renderMessageContent(content: string) {
  if (!content) return null;
  const parts = content.split(/(@[a-zA-Z0-9_\-\.]+)/g);
  return (
    <span>
      {parts.map((part, i) => {
        if (part.startsWith('@')) {
          const isAi = part.toLowerCase() === '@ai' || part.toLowerCase() === '@gemini';
          return (
            <span
              key={i}
              className={`px-1.5 py-0.5 rounded font-mono font-bold text-[11px] mx-0.5 ${
                isAi
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                  : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
              }`}
              data-tour={!isAi ? 'collab-mention-tag' : undefined}
            >
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

export default function CollabChatPage() {
  const { currentUser } = useWorkspace();
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputContent, setInputContent] = useState('');
  const [replyToMessage, setReplyToMessage] = useState<MessageItem | null>(null);

  // Periodic tick for relative timestamps refresh
  const [timeTick, setTimeTick] = useState<number>(Date.now());

  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Mention Autocomplete State
  const [showMentionPopup, setShowMentionPopup] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);

  // Voice Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Voice & Video Call State
  const [activeCall, setActiveCall] = useState<ActiveCallState | null>(null);
  const [incomingInvite, setIncomingInvite] = useState<IncomingCallInvite | null>(null);
  const [callTimerSec, setCallTimerSec] = useState<number>(0);
  const callIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Modals State
  const [showUserSearchModal, setShowUserSearchModal] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<UserSummary[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');

  const [showAddMembersModal, setShowAddMembersModal] = useState(false);
  const [addMembersQuery, setAddMembersQuery] = useState('');
  const [addMembersSearchResults, setAddMembersSearchResults] = useState<UserSummary[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  const [showMembersModal, setShowMembersModal] = useState(false);
  const [removedBanner, setRemovedBanner] = useState<string | null>(null);

  const [showShareModal, setShowShareModal] = useState(false);
  const [shareType, setShareType] = useState<'roadmap' | 'entity' | 'document' | 'question' | 'mocktest'>('roadmap');
  const [shareTargetId, setShareTargetId] = useState('');

  const [isAiGenerating, setIsAiGenerating] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeChannelIdRef = useRef<string | null>(activeChannelId);
  const requestIdRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Critical Chat UX Fix: ALWAYS open a conversation at the latest message
  const scrollToLatestMessage = useCallback((behavior: ScrollBehavior = 'auto') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  useEffect(() => {
    const refreshMs = parseInt(process.env.COLLAB_MESSAGE_TIMESTAMP_REFRESH_MS || '60000', 10);
    const interval = setInterval(() => setTimeTick(Date.now()), refreshMs);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    activeChannelIdRef.current = activeChannelId;
  }, [activeChannelId]);

  const getChannelDisplayName = useCallback(
    (ch: ChannelItem): string => {
      if (ch.type === 'GROUP') {
        return ch.name || 'Group Discussion';
      }
      const otherMember = ch.members?.find((m) => m.userId !== currentUser?.id);
      if (otherMember?.user) {
        return otherMember.user.name || otherMember.user.email || 'Direct Chat';
      }
      const selfMember = ch.members?.find((m) => m.userId === currentUser?.id);
      if (selfMember?.user) {
        return `${selfMember.user.name || selfMember.user.email} (You)`;
      }
      return 'Direct Chat';
    },
    [currentUser?.id]
  );

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch('/api/collaboration/channels');
      const data = await res.json();
      if (data.success && data.data) {
        setChannels(data.data);
        if (!activeChannelIdRef.current && data.data.length > 0) {
          setActiveChannelId(data.data[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch channels:', err);
    } finally {
      setLoadingChannels(false);
    }
  }, []);

  const fetchMessages = useCallback(async (chId: string) => {
    const requestId = ++requestIdRef.current;
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/collaboration/channels/${chId}/messages?limit=100`);
      const data = await res.json();
      if (requestId === requestIdRef.current && data.success && data.data) {
        setMessages(data.data);
        await fetch(`/api/collaboration/channels/${chId}/read`, { method: 'POST' }).catch(() => {});
        setChannels((prev) =>
          prev.map((c) => (c.id === chId ? { ...c, unreadCount: 0 } : c))
        );
        // Critical UX Fix: Scroll to bottom immediately on channel message load
        setTimeout(() => scrollToLatestMessage('auto'), 50);
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoadingMessages(false);
      }
    }
  }, [scrollToLatestMessage]);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  useEffect(() => {
    if (activeChannelId) {
      fetchMessages(activeChannelId);
    }
  }, [activeChannelId, fetchMessages]);

  // Critical Chat UX Fix: Ensure feed scrolls to bottom when messages update
  useEffect(() => {
    scrollToLatestMessage('smooth');
  }, [messages, scrollToLatestMessage]);

  // Real-time SSE Connection
  useEffect(() => {
    if (!currentUser?.id) return;

    let eventSource: EventSource | null = null;
    let isUnmounted = false;
    let reconnectAttempt = 0;
    const backoffDelays = [1000, 2000, 4000, 8000, 16000, 30000];

    const connect = () => {
      if (isUnmounted) return;
      eventSource = new EventSource('/api/collaboration/events');

      eventSource.onopen = () => {
        reconnectAttempt = 0;
      };

      eventSource.onmessage = (e) => {
        if (isUnmounted) return;
        try {
          const event = JSON.parse(e.data);
          const activeChId = activeChannelIdRef.current;

          if (event.type === 'message:new') {
            const newMsg = event.data as MessageItem;
            setChannels((prev) =>
              prev.map((c) => {
                if (c.id === newMsg.channelId) {
                  const isCurrent = c.id === activeChId;
                  return {
                    ...c,
                    latestMessage: newMsg,
                    unreadCount: isCurrent ? 0 : (c.unreadCount || 0) + 1,
                    updatedAt: newMsg.createdAt
                  };
                }
                return c;
              })
            );

            if (newMsg.channelId === activeChId) {
              setMessages((prev) => mergeMessages(prev, newMsg));
              scrollToLatestMessage('smooth');

              if (newMsg.senderId !== currentUser.id) {
                fetch(`/api/collaboration/channels/${activeChId}/messages/delivery`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ messageIds: [newMsg.id] })
                }).catch(() => {});
              }
            }
          } else if (event.type === 'message:edit') {
            const updated = event.data as MessageItem;
            if (updated.channelId === activeChId) {
              setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
            }
          } else if (event.type === 'message:delete') {
            const { messageId, channelId: chId } = event.data;
            if (chId === activeChId) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === messageId ? { ...m, isDeleted: true, content: 'This message was deleted.' } : m
                )
              );
            }
          } else if (event.type === 'call:invite') {
            if (event.senderId !== currentUser.id) {
              setIncomingInvite({
                callId: event.data.callId,
                channelId: event.channelId,
                hostId: event.senderId || '',
                hostName: event.data.hostName || 'Member',
                callType: event.data.callType || 'VOICE'
              });
            }
          } else if (event.type === 'call:accept') {
            if (activeCall && activeCall.id === event.data.callId) {
              setActiveCall((prev) => (prev ? { ...prev, status: 'IN_CALL' } : null));
            }
          } else if (event.type === 'call:decline' || event.type === 'call:end') {
            if (activeCall && activeCall.id === event.data.callId) {
              setActiveCall(null);
              if (callIntervalRef.current) clearInterval(callIntervalRef.current);
            }
            if (incomingInvite && incomingInvite.callId === event.data.callId) {
              setIncomingInvite(null);
            }
          } else if (event.type === 'ai:generating') {
            if (event.channelId === activeChId) {
              setIsAiGenerating(Boolean(event.data?.isGenerating));
            }
          }
        } catch {}
      };

      eventSource.onerror = () => {
        if (isUnmounted) return;
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        const delay = backoffDelays[Math.min(reconnectAttempt, backoffDelays.length - 1)];
        reconnectAttempt++;
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      isUnmounted = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (eventSource) eventSource.close();
    };
  }, [currentUser?.id, activeCall, incomingInvite, scrollToLatestMessage]);

  // Initiate Voice / Video Call
  const handleInitiateCall = async (type: 'VOICE' | 'VIDEO') => {
    if (!activeChannelId) return;
    try {
      const res = await fetch('/api/collaboration/calls/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: activeChannelId, type })
      });
      const data = await res.json();
      if (data.success && data.data) {
        setActiveCall({
          id: data.data.id,
          channelId: activeChannelId,
          type,
          status: 'RINGING',
          hostName: currentUser?.name || 'You',
          isMuted: false,
          isVideoOff: type === 'VOICE',
          isScreenSharing: false,
          startedAt: new Date().toISOString()
        });
        setCallTimerSec(0);
        if (callIntervalRef.current) clearInterval(callIntervalRef.current);
        callIntervalRef.current = setInterval(() => {
          setCallTimerSec((prev) => prev + 1);
        }, 1000);
      }
    } catch (err) {
      console.error('Failed to initiate call:', err);
    }
  };

  const handleCallAction = async (action: 'accept' | 'decline' | 'mute' | 'unmute' | 'video_off' | 'video_on' | 'end') => {
    const targetCallId = activeCall?.id || incomingInvite?.callId;
    if (!targetCallId) return;

    try {
      await fetch(`/api/collaboration/calls/${targetCallId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });

      if (action === 'accept') {
        if (incomingInvite) {
          setActiveCall({
            id: incomingInvite.callId,
            channelId: incomingInvite.channelId,
            type: incomingInvite.callType,
            status: 'IN_CALL',
            hostName: incomingInvite.hostName,
            isMuted: false,
            isVideoOff: incomingInvite.callType === 'VOICE',
            isScreenSharing: false,
            startedAt: new Date().toISOString()
          });
          setActiveChannelId(incomingInvite.channelId);
          setIncomingInvite(null);
          setCallTimerSec(0);
          if (callIntervalRef.current) clearInterval(callIntervalRef.current);
          callIntervalRef.current = setInterval(() => {
            setCallTimerSec((prev) => prev + 1);
          }, 1000);
        }
      } else if (action === 'decline') {
        setIncomingInvite(null);
      } else if (action === 'end') {
        setActiveCall(null);
        if (callIntervalRef.current) clearInterval(callIntervalRef.current);
      } else if (action === 'mute') {
        setActiveCall((prev) => (prev ? { ...prev, isMuted: true } : null));
      } else if (action === 'unmute') {
        setActiveCall((prev) => (prev ? { ...prev, isMuted: false } : null));
      } else if (action === 'video_off') {
        setActiveCall((prev) => (prev ? { ...prev, isVideoOff: true } : null));
      } else if (action === 'video_on') {
        setActiveCall((prev) => (prev ? { ...prev, isVideoOff: false } : null));
      }
    } catch (err) {
      console.error('Call action error:', err);
    }
  };

  // Voice Recording Handlers
  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setRecordedBlob(blob);
        const url = URL.createObjectURL(blob);
        setRecordedAudioUrl(url);
      };

      recorder.start(100);
      setIsRecording(true);
      setRecordingDuration(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch {
      alert('Microphone permission is required to record a voice message.');
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  const cancelVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
    setRecordedBlob(null);
    if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
    setRecordedAudioUrl(null);
    setRecordingDuration(0);
  };

  const handleSendVoiceMessage = async () => {
    if (!recordedBlob || !activeChannelId || !currentUser) return;

    const clientMessageId = `client_voice_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const durationMs = recordingDuration * 1000;

    const blobToSend = recordedBlob;
    cancelVoiceRecording();

    const optimisticMsg: MessageItem = {
      id: clientMessageId,
      clientMessageId,
      channelId: activeChannelId,
      senderId: currentUser.id,
      messageType: 'VOICE',
      content: '🎤 Voice message',
      voiceDurationMs: durationMs,
      isEdited: false,
      isDeleted: false,
      isAi: false,
      createdAt: new Date().toISOString(),
      sender: {
        id: currentUser.id,
        name: currentUser.name || null,
        email: currentUser.email,
        role: currentUser.role || 'USER',
        avatarUrl: currentUser.avatarUrl || null
      },
      status: 'SENDING'
    };

    setMessages((prev) => mergeMessages(prev, optimisticMsg));

    try {
      const formData = new FormData();
      formData.append('audio', blobToSend, 'voice.webm');
      formData.append('durationMs', durationMs.toString());
      formData.append('clientMessageId', clientMessageId);

      const res = await fetch(`/api/collaboration/channels/${activeChannelId}/voice`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success && data.data) {
        setMessages((prev) => mergeMessages(prev, data.data));
      } else {
        setMessages((prev) =>
          prev.map((m) => (m.clientMessageId === clientMessageId ? { ...m, status: 'FAILED' } : m))
        );
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.clientMessageId === clientMessageId ? { ...m, status: 'FAILED' } : m))
      );
    }
  };

  // Mention Autocomplete Handler
  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const activeChannelMembers = activeChannel?.members?.filter((m) => m.userId !== currentUser?.id) || [];

  const filteredMentionMembers = activeChannelMembers.filter((m) => {
    const q = mentionQuery.toLowerCase();
    const nameStr = (m.user?.name || '').toLowerCase();
    const emailStr = (m.user?.email || '').toLowerCase();
    return nameStr.includes(q) || emailStr.includes(q);
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputContent(val);

    const cursorPos = e.target.selectionStart || val.length;
    const textBeforeCursor = val.substring(0, cursorPos);
    const lastAtPos = textBeforeCursor.lastIndexOf('@');

    if (lastAtPos !== -1 && activeChannel?.type === 'GROUP') {
      const queryStr = textBeforeCursor.substring(lastAtPos + 1);
      if (!queryStr.includes(' ')) {
        setShowMentionPopup(true);
        setMentionQuery(queryStr);
        setMentionSelectedIndex(0);
        return;
      }
    }
    setShowMentionPopup(false);
  };

  const handleSelectMention = (member: MemberItem) => {
    const nameToInsert = member.user?.name || member.user?.email.split('@')[0] || 'user';
    const cursorPos = textareaRef.current?.selectionStart || inputContent.length;
    const textBeforeCursor = inputContent.substring(0, cursorPos);
    const lastAtPos = textBeforeCursor.lastIndexOf('@');
    const textAfterCursor = inputContent.substring(cursorPos);

    const newText = inputContent.substring(0, lastAtPos) + `@${nameToInsert} ` + textAfterCursor;
    setInputContent(newText);
    setMentionedUserIds((prev) => Array.from(new Set([...prev, member.userId])));
    setShowMentionPopup(false);

    setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentionPopup && filteredMentionMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionSelectedIndex((prev) => (prev + 1) % filteredMentionMembers.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionSelectedIndex((prev) => (prev - 1 + filteredMentionMembers.length) % filteredMentionMembers.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const targetMem = filteredMentionMembers[mentionSelectedIndex];
        if (targetMem) handleSelectMention(targetMem);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentionPopup(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputContent.trim() || !activeChannelId || !currentUser) return;

    const contentToSend = inputContent.trim();
    const idsToSend = [...mentionedUserIds];
    setInputContent('');
    setMentionedUserIds([]);
    setShowMentionPopup(false);
    const replyId = replyToMessage?.id;
    setReplyToMessage(null);

    const clientMessageId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const optimisticMsg: MessageItem = {
      id: clientMessageId,
      clientMessageId,
      channelId: activeChannelId,
      senderId: currentUser.id,
      messageType: 'TEXT',
      content: contentToSend,
      replyToId: replyId,
      isEdited: false,
      isDeleted: false,
      isAi: false,
      createdAt: new Date().toISOString(),
      sender: {
        id: currentUser.id,
        name: currentUser.name || null,
        email: currentUser.email,
        role: currentUser.role || 'USER',
        avatarUrl: currentUser.avatarUrl || null
      },
      status: 'SENDING'
    };

    setMessages((prev) => mergeMessages(prev, optimisticMsg));

    try {
      const res = await fetch(`/api/collaboration/channels/${activeChannelId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: contentToSend,
          replyToId: replyId,
          clientMessageId,
          mentionedUserIds: idsToSend
        })
      });
      const data = await res.json();
      if (data.success && data.data) {
        setMessages((prev) => mergeMessages(prev, data.data));
      } else {
        setMessages((prev) =>
          prev.map((m) => (m.clientMessageId === clientMessageId ? { ...m, status: 'FAILED' } : m))
        );
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.clientMessageId === clientMessageId ? { ...m, status: 'FAILED' } : m))
      );
    }
  };

  const handleSearchUsers = async (q: string) => {
    setUserSearchQuery(q);
    if (!q.trim()) {
      setUserSearchResults([]);
      return;
    }
    setIsSearchingUsers(true);
    try {
      const res = await fetch(`/api/collaboration/users/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.success && data.data) {
        setUserSearchResults(data.data);
      }
    } catch {
    } finally {
      setIsSearchingUsers(false);
    }
  };

  const handleStartDirectChat = async (targetUserId: string) => {
    try {
      const res = await fetch('/api/collaboration/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'DIRECT', targetUserId })
      });
      const data = await res.json();
      if (data.success && data.data) {
        setShowUserSearchModal(false);
        setUserSearchQuery('');
        setUserSearchResults([]);
        await fetchChannels();
        setActiveChannelId(data.data.id);
      }
    } catch (err) {
      console.error('Failed to create direct chat:', err);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupTitle.trim()) return;
    try {
      const res = await fetch('/api/collaboration/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'GROUP', name: newGroupTitle.trim(), description: newGroupDescription.trim() })
      });
      const data = await res.json();
      if (data.success && data.data) {
        setShowCreateModal(false);
        setNewGroupTitle('');
        setNewGroupDescription('');
        await fetchChannels();
        setActiveChannelId(data.data.id);
      }
    } catch (err) {
      console.error('Failed to create group:', err);
    }
  };

  const handleSearchAddMembers = async (q: string) => {
    setAddMembersQuery(q);
    if (!q.trim()) {
      setAddMembersSearchResults([]);
      return;
    }
    try {
      const res = await fetch(`/api/collaboration/users/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.success && data.data) {
        const existingUserIds = activeChannel?.members.map((m) => m.userId) || [];
        setAddMembersSearchResults(data.data.filter((u: UserSummary) => !existingUserIds.includes(u.id)));
      }
    } catch {}
  };

  const handleAddMembers = async () => {
    if (!activeChannelId || selectedMemberIds.length === 0) return;
    try {
      const res = await fetch(`/api/collaboration/channels/${activeChannelId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: selectedMemberIds })
      });
      const data = await res.json();
      if (data.success) {
        setShowAddMembersModal(false);
        setSelectedMemberIds([]);
        fetchChannels();
      }
    } catch (err) {
      console.error('Failed to add group members:', err);
    }
  };

  const handleShareAsset = async () => {
    if (!activeChannelId || !shareTargetId.trim()) return;
    try {
      const bodyPayload: any = { content: `🔗 Shared a ${shareType} asset` };
      if (shareType === 'roadmap') bodyPayload.sharedRoadmapId = shareTargetId.trim();
      else if (shareType === 'entity') bodyPayload.sharedEntityId = shareTargetId.trim();
      else if (shareType === 'document') bodyPayload.sharedDocumentId = shareTargetId.trim();
      else if (shareType === 'question') bodyPayload.sharedStudyQuestionId = shareTargetId.trim();
      else if (shareType === 'mocktest') bodyPayload.sharedMockTestId = shareTargetId.trim();

      const res = await fetch(`/api/collaboration/channels/${activeChannelId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });
      const data = await res.json();
      if (data.success) {
        setShowShareModal(false);
        setShareTargetId('');
        if (data.data) setMessages((prev) => mergeMessages(prev, data.data));
      }
    } catch (err) {
      console.error('Failed to share asset:', err);
    }
  };

  const activeChannelTitle = activeChannel ? getChannelDisplayName(activeChannel) : '';
  const now = new Date(timeTick);
  const groupedMessageClusters = groupMessagesByDate(messages, now);

  return (
    <div className="w-full max-w-[1600px] mx-auto h-[calc(100vh-80px)] flex flex-col p-4 sm:p-6 lg:p-8 overflow-hidden" data-tour="collab-chat-container">
      {/* Header Bar */}
      <div className="flex items-center justify-between pb-3 shrink-0" data-tour="collab-header">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center space-x-2">
            <span>💬</span>
            <span>Real-Time Collaboration Platform</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            DMs, Group Discussions, AI Mock Tests, Voice/Video Calling & Calendar Sync
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            href="/study/mock-tests"
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-md transition flex items-center space-x-1.5"
          >
            <span>📝</span>
            <span>Scheduled AI Mock Tests</span>
          </Link>

          <button
            onClick={() => {
              setShowUserSearchModal(true);
              setUserSearchQuery('');
              setUserSearchResults([]);
            }}
            className="px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-xs rounded-xl shadow-md transition flex items-center space-x-1.5"
            data-tour="collab-new-dm-btn"
          >
            <span>💬</span>
            <span>New Chat / DM</span>
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3.5 py-2 bg-slate-800 dark:bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-xl shadow-md transition flex items-center space-x-1.5"
            data-tour="collab-create-group-btn"
          >
            <span>➕</span>
            <span>New Group</span>
          </button>
        </div>
      </div>

      {removedBanner && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs rounded-xl flex items-center justify-between shrink-0 mb-2">
          <span>{removedBanner}</span>
          <button onClick={() => setRemovedBanner(null)} className="font-bold">✕</button>
        </div>
      )}

      {/* Main Grid: Left Channel Sidebar (4 Cols) + Right Chat Panel (8 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0 overflow-hidden">
        {/* Left Sidebar (4 Cols) */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col h-full overflow-hidden shadow-sm" data-tour="collab-channels-list">
          {/* Channels List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
            <div className="text-[11px] font-mono font-bold uppercase text-slate-400 px-2 flex justify-between items-center mb-1">
              <span>Active Conversations</span>
              <span className="text-indigo-400 font-bold">{channels.length}</span>
            </div>

            {loadingChannels ? (
              <div className="text-center py-12 text-xs text-slate-400 animate-pulse">Loading Channels...</div>
            ) : channels.length === 0 ? (
              <div className="text-center py-12 text-xs text-slate-400 space-y-2">
                <p>No conversations started yet.</p>
                <p className="text-[11px] text-indigo-400 font-medium">Click &quot;New Chat&quot; to search users!</p>
              </div>
            ) : (
              channels.map((ch) => {
                const isActive = ch.id === activeChannelId;
                const displayName = getChannelDisplayName(ch);
                const otherMember = ch.members?.find((m) => m.userId !== currentUser?.id);
                const isOnline = otherMember?.presence?.status === 'ONLINE';

                return (
                  <div
                    key={ch.id}
                    onClick={() => setActiveChannelId(ch.id)}
                    className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                      isActive
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 text-slate-900 dark:text-white font-semibold shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center space-x-3 truncate">
                      <div className="relative shrink-0">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white font-bold flex items-center justify-center text-xs shadow-sm">
                          {ch.type === 'GROUP' ? '👥' : (displayName ? displayName[0]?.toUpperCase() : '💬')}
                        </div>
                        {ch.type === 'DIRECT' && (
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 ${
                              isOnline ? 'bg-emerald-500' : 'bg-slate-400'
                            }`}
                          />
                        )}
                      </div>

                      <div className="flex flex-col truncate min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold truncate max-w-[140px] text-slate-900 dark:text-white">
                            {displayName}
                          </span>
                          {ch.type === 'GROUP' && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 font-mono">
                              GROUP
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400 truncate mt-0.5">
                          {ch.latestMessage
                            ? ch.latestMessage.messageType === 'VOICE'
                              ? '🎤 Voice message'
                              : ch.latestMessage.content
                            : 'No messages yet'}
                        </span>
                      </div>
                    </div>

                    {ch.unreadCount > 0 && (
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 ml-2">
                        {ch.unreadCount}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Chat Panel (8 Cols) */}
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col h-full overflow-hidden shadow-sm">
          {activeChannel ? (
            <>
              {/* Active Channel Header with Voice & Video Call Controls */}
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 shrink-0">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-sm shrink-0">
                    {activeChannel.type === 'GROUP' ? '👥' : '💬'}
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      {activeChannelTitle}
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      {activeChannel.type === 'GROUP'
                        ? `${activeChannel.members.length} Members • Group Discussion`
                        : `1-to-1 Direct Discussion`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handleInitiateCall('VOICE')}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition flex items-center space-x-1"
                    title="Initiate Voice Call"
                    data-tour="collab-voice-call-btn"
                  >
                    <span>📞</span>
                    <span>Voice Call</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleInitiateCall('VIDEO')}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition flex items-center space-x-1"
                    title="Initiate Video Call"
                    data-tour="collab-video-call-btn"
                  >
                    <span>📹</span>
                    <span>Video Call</span>
                  </button>

                  {activeChannel.type === 'GROUP' && (
                    <button
                      onClick={() => setShowMembersModal(true)}
                      className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition flex items-center space-x-1"
                      aria-label="View group members"
                      data-tour="collab-group-members-btn"
                    >
                      <span>👥</span>
                      <span>Members ({activeChannel.members.length})</span>
                    </button>
                  )}

                  {activeChannel.type === 'GROUP' && (activeChannel.role === 'OWNER' || activeChannel.role === 'ADMIN') && (
                    <button
                      onClick={() => {
                        setShowAddMembersModal(true);
                        setSelectedMemberIds([]);
                        setAddMembersQuery('');
                        setAddMembersSearchResults([]);
                      }}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition flex items-center space-x-1"
                      aria-label="Add group members"
                      data-tour="collab-add-members-btn"
                    >
                      <span>➕</span>
                      <span>Add Members</span>
                    </button>
                  )}

                  <button
                    onClick={() => setShowShareModal(true)}
                    className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition"
                    data-tour="collab-share-asset-btn"
                  >
                    🔗 Share Asset
                  </button>
                </div>
              </div>

              {/* Floating Active Call Banner */}
              {activeCall && activeCall.channelId === activeChannelId && (
                <div className="p-3 bg-gradient-to-r from-emerald-950 to-slate-900 border border-emerald-500/40 rounded-xl flex items-center justify-between text-xs text-white my-2 shrink-0 shadow-lg">
                  <div className="flex items-center space-x-3 font-mono">
                    <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
                    <span className="font-bold text-emerald-400">
                      {activeCall.type === 'VIDEO' ? '📹 Active Video Call' : '📞 Active Voice Call'}
                    </span>
                    <span className="text-slate-300">
                      [{Math.floor(callTimerSec / 60)}:{Math.floor(callTimerSec % 60).toString().padStart(2, '0')}]
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleCallAction(activeCall.isMuted ? 'unmute' : 'mute')}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                        activeCall.isMuted ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-200'
                      }`}
                    >
                      {activeCall.isMuted ? '🎙 Unmute' : '🎤 Mute'}
                    </button>

                    {activeCall.type === 'VIDEO' && (
                      <button
                        onClick={() => handleCallAction(activeCall.isVideoOff ? 'video_on' : 'video_off')}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                          activeCall.isVideoOff ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-200'
                        }`}
                      >
                        {activeCall.isVideoOff ? '📹 Video On' : '📷 Video Off'}
                      </button>
                    )}

                    <button
                      onClick={() => handleCallAction('end')}
                      className="px-3.5 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-xs shadow transition"
                    >
                      End Call 🔴
                    </button>
                  </div>
                </div>
              )}

              {/* Message History Feed with Date Separators, Relative Timestamps & Auto-Scroll Fix */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-2 my-3 min-h-0" data-tour="collab-message-feed">
                {loadingMessages ? (
                  <div className="text-center py-20 text-xs text-slate-400 animate-pulse">Loading Messages...</div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-20 text-xs text-slate-400 space-y-2">
                    <p className="text-base">🚀</p>
                    <p>Start the conversation! Type a message, schedule a mock test, or call below.</p>
                  </div>
                ) : (
                  groupedMessageClusters.map((cluster) => (
                    <div key={cluster.groupLabel} className="space-y-4">
                      {/* Date Separator Banner */}
                      <div className="flex items-center justify-center my-3" data-tour="collab-date-separator">
                        <div className="border-t border-slate-200 dark:border-slate-800 flex-1" />
                        <span className="px-3 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 tracking-wider mx-3 shadow-xs">
                          ───── {cluster.groupLabel} ─────
                        </span>
                        <div className="border-t border-slate-200 dark:border-slate-800 flex-1" />
                      </div>

                      {cluster.messages.map((m) => {
                        const isSelf = m.senderId === currentUser?.id;
                        const msgKey = m.id || m.clientMessageId || `msg_${Math.random()}`;
                        const ts = formatMessageTimestamp(m.createdAt, now);

                        return (
                          <div
                            key={msgKey}
                            className={`flex items-start space-x-3 group ${isSelf ? 'flex-row-reverse space-x-reverse' : ''}`}
                          >
                            {/* Sender Avatar */}
                            {(() => {
                              const sName = m.sender?.name;
                              const sEmail = m.sender?.email || '';
                              const avatarChar = (sName && sName.charAt(0)) ? sName.charAt(0).toUpperCase() : (sEmail.charAt(0) ? sEmail.charAt(0).toUpperCase() : 'U');
                              return (
                                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-sm">
                                  {m.isAi ? '🤖' : avatarChar}
                                </div>
                              );
                            })()}

                            <div className="flex flex-col space-y-1 max-w-lg">
                              {/* Header & Relative Timestamp with Absolute Title Tooltip */}
                              <div className={`flex items-center space-x-2 text-[11px] text-slate-400 ${isSelf ? 'justify-end' : ''}`}>
                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                  {m.isAi ? 'Gemini AI Assistant' : isSelf ? 'You' : m.sender?.name || m.sender?.email.split('@')[0]}
                                </span>
                                <span>•</span>
                                <span title={ts.absolute} className="cursor-help font-medium">
                                  {ts.relative}
                                </span>
                              </div>

                              {/* Quoted Parent Reply Card */}
                              {m.replyTo && (
                                <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-950 border-l-4 border-indigo-500 text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                                  <span className="font-bold text-indigo-400">{m.replyTo.sender.name || m.replyTo.sender.email}:</span>{' '}
                                  <span className="line-clamp-1">{m.replyTo.content}</span>
                                </div>
                              )}

                              {/* Message Content Bubble (TEXT, VOICE or MOCK TEST CARD) */}
                              <div
                                className={`p-3.5 rounded-2xl max-w-lg text-xs space-y-2 shadow-sm ${
                                  m.isAi
                                    ? 'bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-slate-900 dark:text-slate-100'
                                    : isSelf
                                    ? 'bg-indigo-600 text-white rounded-br-none'
                                    : 'bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-none'
                                }`}
                              >
                                {m.messageType === 'VOICE' ? (
                                  <VoiceMessagePlayer msg={m} />
                                ) : m.messageType === 'CALL_EVENT' || m.callSessionId ? (
                                  <CallEventMessageCard msg={m} />
                                ) : m.sharedMockTestId || m.sharedMockTest ? (
                                  <SharedMockTestCard msg={m} />
                                ) : (
                                  <p className="whitespace-pre-wrap leading-relaxed">{renderMessageContent(m.content)}</p>
                                )}

                                {/* Footer Actions & Receipt Indicators */}
                                <div className="flex items-center justify-between text-[10px] opacity-90 pt-1 border-t border-white/10 dark:border-slate-800/40 mt-1">
                                  <div className="flex items-center space-x-2">
                                    {m.isEdited && <span className="font-mono text-amber-400">(edited)</span>}

                                    {isSelf && !m.isDeleted && !m.isAi && (
                                      <div className="flex items-center space-x-1.5 font-mono">
                                        {m.status === 'SENDING' ? (
                                          <span className="text-amber-300 animate-pulse" aria-label="Sending...">
                                            Sending... ◌
                                          </span>
                                        ) : m.status === 'FAILED' ? (
                                          <div className="flex items-center space-x-1">
                                            <span className="text-rose-400 font-bold" aria-label="Failed">
                                              ⚠ Failed
                                            </span>
                                          </div>
                                        ) : (
                                          (() => {
                                            const receipts = m.receipts || [];
                                            const hasRead = receipts.some((r) => r.status === 'READ');
                                            const hasDelivered = receipts.some((r) => r.status === 'DELIVERED');

                                            if (hasRead) {
                                              return <span className="text-emerald-300 font-bold" aria-label="Seen">✓✓ Seen</span>;
                                            }
                                            if (hasDelivered) {
                                              return <span className="text-slate-300 font-bold" aria-label="Delivered">✓✓ Delivered</span>;
                                            }
                                            return <span className="text-slate-300 font-bold" aria-label="Sent">✓ Sent</span>;
                                          })()
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  {!m.isDeleted && !m.isAi && (
                                    <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition">
                                      <button onClick={() => setReplyToMessage(m)} className="hover:underline text-indigo-300">
                                        Reply
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}

                {/* AI Generating Indicator */}
                {isAiGenerating && (
                  <div className="flex items-center space-x-2 p-3 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-xs text-purple-700 dark:text-purple-300 animate-pulse">
                    <span>🤖</span>
                    <span>Gemini AI is generating a discussion reply...</span>
                  </div>
                )}

                {/* Critical Chat UX Fix: Reference element to scroll feed to bottom */}
                <div ref={messagesEndRef} />
              </div>

              {/* Voice Recording Card / Preview Panel */}
              {isRecording && (
                <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-xl flex items-center justify-between text-xs text-rose-300 mb-2 shrink-0 animate-pulse">
                  <div className="flex items-center space-x-2 font-mono">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                    <span className="font-bold">Recording Voice Note...</span>
                    <span>{Math.floor(recordingDuration / 60)}:{Math.floor(recordingDuration % 60).toString().padStart(2, '0')}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={cancelVoiceRecording}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={stopVoiceRecording}
                      className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-xs"
                    >
                      Stop ⏹
                    </button>
                  </div>
                </div>
              )}

              {recordedAudioUrl && !isRecording && (
                <div className="p-3 bg-indigo-950/80 border border-indigo-800 rounded-xl flex items-center justify-between text-xs text-white mb-2 shrink-0">
                  <div className="flex items-center space-x-3">
                    <span>🎤 Voice Note Ready</span>
                    <audio src={recordedAudioUrl} controls className="h-7 w-48" />
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={cancelVoiceRecording}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={handleSendVoiceMessage}
                      className="px-3.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-xs shadow transition"
                    >
                      Send Voice 🚀
                    </button>
                  </div>
                </div>
              )}

              {/* Mention Autocomplete Overlay Popup */}
              {showMentionPopup && filteredMentionMembers.length > 0 && (
                <div className="relative mb-1 z-30">
                  <div className="absolute bottom-0 left-0 w-64 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden divide-y divide-slate-800 max-h-48 overflow-y-auto">
                    <div className="p-2 text-[10px] font-mono font-bold text-slate-400 uppercase bg-slate-950">
                      Mention Group Member ({filteredMentionMembers.length})
                    </div>
                    {filteredMentionMembers.map((mem, index) => (
                      <div
                        key={mem.userId}
                        onClick={() => handleSelectMention(mem)}
                        className={`p-2.5 flex items-center space-x-2 cursor-pointer transition ${
                          index === mentionSelectedIndex ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-200'
                        }`}
                      >
                        <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 text-white font-bold flex items-center justify-center text-[10px]">
                          {mem.user?.name ? mem.user.name.charAt(0).toUpperCase() : (mem.user?.email ? mem.user.email.charAt(0).toUpperCase() : 'U')}
                        </div>
                        <div className="truncate">
                          <p className="text-xs font-bold truncate">{mem.user?.name || mem.user?.email.split('@')[0]}</p>
                          <p className="text-[10px] opacity-75 truncate">{mem.user?.email}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Multiline Message Composer Form */}
              <form onSubmit={handleSendMessage} className="mt-3 flex items-start space-x-2 shrink-0" data-tour="collab-input-box">
                <textarea
                  ref={textareaRef}
                  rows={2}
                  placeholder="Type a message... Use @ to mention group members, or click 🎤 to record voice note..."
                  value={inputContent}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  className="flex-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 resize-none"
                  aria-label="Message input composer"
                />

                <button
                  type="button"
                  onClick={startVoiceRecording}
                  disabled={isRecording}
                  className="px-3 py-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 font-semibold text-xs transition"
                  title="Record Voice Message"
                  data-tour="collab-voice-btn"
                >
                  🎤
                </button>

                <button
                  type="button"
                  onClick={() => setInputContent((prev) => `${prev} @ai `)}
                  className="px-3 py-3 rounded-xl bg-purple-100 dark:bg-purple-950/60 hover:bg-purple-200 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 font-mono text-xs font-bold transition"
                  title="Mention @ai"
                >
                  @ai
                </button>

                <button
                  type="submit"
                  disabled={!inputContent.trim()}
                  className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-md transition"
                >
                  Send 🚀
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-center p-8 text-slate-400 text-xs">
              Select a conversation from the left sidebar to start chatting
            </div>
          )}
        </div>
      </div>

      {/* Incoming Ringing Call Modal Overlay */}
      {incomingInvite && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-6 text-center text-white space-y-4 shadow-2xl animate-bounce">
            <div className="w-16 h-16 rounded-full bg-indigo-600 text-white text-2xl font-bold flex items-center justify-center mx-auto shadow-lg">
              {incomingInvite.callType === 'VIDEO' ? '📹' : '📞'}
            </div>
            <div>
              <h3 className="text-base font-bold">Incoming {incomingInvite.callType} Call</h3>
              <p className="text-xs text-slate-400 mt-1">{incomingInvite.hostName} is calling you...</p>
            </div>
            <div className="flex justify-center space-x-4 pt-2">
              <button
                onClick={() => handleCallAction('decline')}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow transition"
              >
                Decline 🚫
              </button>
              <button
                onClick={() => handleCallAction('accept')}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow transition"
              >
                Accept 📞
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Search / New DM Modal */}
      {showUserSearchModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Start New Direct Message</h3>
              <button onClick={() => setShowUserSearchModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <input
              type="text"
              placeholder="Search user by name or email..."
              value={userSearchQuery}
              onChange={(e) => handleSearchUsers(e.target.value)}
              className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
            <div className="max-h-60 overflow-y-auto space-y-2">
              {isSearchingUsers ? (
                <p className="text-xs text-slate-400 text-center py-4">Searching...</p>
              ) : userSearchResults.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">No users found</p>
              ) : (
                userSearchResults.map((u) => (
                  <div
                    key={u.id}
                    onClick={() => handleStartDirectChat(u.id)}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 hover:bg-indigo-600 hover:text-white transition cursor-pointer flex items-center justify-between text-xs"
                  >
                    <div>
                      <p className="font-bold">{u.name || u.email.split('@')[0]}</p>
                      <p className="text-[10px] opacity-75">{u.email}</p>
                    </div>
                    <span className="text-[10px] font-mono">Chat →</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Group Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Create New Group Channel</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <input
              type="text"
              placeholder="Group Title..."
              value={newGroupTitle}
              onChange={(e) => setNewGroupTitle(e.target.value)}
              className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
            <textarea
              placeholder="Group Description (Optional)..."
              value={newGroupDescription}
              onChange={(e) => setNewGroupDescription(e.target.value)}
              className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
            <div className="flex justify-end space-x-2">
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 bg-slate-800 text-slate-300 text-xs rounded-xl">Cancel</button>
              <button onClick={handleCreateGroup} className="px-4 py-2 bg-indigo-600 text-white font-bold text-xs rounded-xl">Create Group</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Members Modal */}
      {showAddMembersModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Add Members to Group</h3>
              <button onClick={() => setShowAddMembersModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <input
              type="text"
              placeholder="Search user to add..."
              value={addMembersQuery}
              onChange={(e) => handleSearchAddMembers(e.target.value)}
              className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
            <div className="max-h-48 overflow-y-auto space-y-2">
              {addMembersSearchResults.map((u) => {
                const isSel = selectedMemberIds.includes(u.id);
                return (
                  <div
                    key={u.id}
                    onClick={() => {
                      if (isSel) setSelectedMemberIds((prev) => prev.filter((id) => id !== u.id));
                      else setSelectedMemberIds((prev) => [...prev, u.id]);
                    }}
                    className={`p-2.5 rounded-xl border text-xs cursor-pointer flex items-center justify-between ${
                      isSel ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-950 border-slate-800 text-slate-300'
                    }`}
                  >
                    <div>
                      <p className="font-bold">{u.name || u.email.split('@')[0]}</p>
                      <p className="text-[10px] opacity-75">{u.email}</p>
                    </div>
                    <span>{isSel ? '✓ Selected' : '+ Select'}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end space-x-2">
              <button onClick={() => setShowAddMembersModal(false)} className="px-4 py-2 bg-slate-800 text-slate-300 text-xs rounded-xl">Cancel</button>
              <button onClick={handleAddMembers} disabled={selectedMemberIds.length === 0} className="px-4 py-2 bg-indigo-600 disabled:opacity-50 text-white font-bold text-xs rounded-xl">
                Add Selected ({selectedMemberIds.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group Members List Modal */}
      {showMembersModal && activeChannel && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Group Members ({activeChannel.members.length})</h3>
              <button onClick={() => setShowMembersModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-2">
              {activeChannel.members.map((m) => (
                <div key={m.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-800 dark:text-slate-200">
                  <div>
                    <p className="font-bold">{m.user.name || m.user.email.split('@')[0]}</p>
                    <p className="text-[10px] opacity-75">{m.user.email}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-mono text-[10px]">
                    {m.role}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Share Asset Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Share Asset in Conversation</h3>
              <button onClick={() => setShowShareModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <select
              value={shareType}
              onChange={(e) => setShareType(e.target.value as any)}
              className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
            >
              <option value="roadmap">AI Roadmap</option>
              <option value="entity">Knowledge Graph Entity</option>
              <option value="document">RAG Document</option>
              <option value="question">Study Question</option>
              <option value="mocktest">Scheduled AI Mock Test</option>
            </select>
            <input
              type="text"
              placeholder="Enter Target Asset UUID / ID..."
              value={shareTargetId}
              onChange={(e) => setShareTargetId(e.target.value)}
              className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
            <div className="flex justify-end space-x-2">
              <button onClick={() => setShowShareModal(false)} className="px-4 py-2 bg-slate-800 text-slate-300 text-xs rounded-xl">Cancel</button>
              <button onClick={handleShareAsset} disabled={!shareTargetId.trim()} className="px-4 py-2 bg-indigo-600 disabled:opacity-50 text-white font-bold text-xs rounded-xl">Share Asset</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
