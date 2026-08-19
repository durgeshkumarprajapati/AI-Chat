'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useWorkspace } from '@/context/WorkspaceContext';

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

interface MessageItem {
  id: string;
  channelId: string;
  senderId: string;
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
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  sender: UserSummary;
  replyTo?: { id: string; content: string; sender: { name: string | null; email: string } } | null;
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

export default function CollabChatPage() {
  const { currentUser } = useWorkspace();
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputContent, setInputContent] = useState('');
  const [replyToMessage, setReplyToMessage] = useState<MessageItem | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MessageItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');

  const [showShareModal, setShowShareModal] = useState(false);
  const [shareType, setShareType] = useState<'roadmap' | 'entity' | 'document' | 'question'>('roadmap');
  const [shareTargetId, setShareTargetId] = useState('');

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Fetch channels list
  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch('/api/collaboration/channels');
      const data = await res.json();
      if (data.success && data.data) {
        setChannels(data.data);
        if (!activeChannelId && data.data.length > 0) {
          setActiveChannelId(data.data[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch channels:', err);
    } finally {
      setLoadingChannels(false);
    }
  }, [activeChannelId]);

  // Fetch active channel messages
  const fetchMessages = useCallback(async (chId: string) => {
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/collaboration/channels/${chId}/messages?limit=100`);
      const data = await res.json();
      if (data.success && data.data) {
        setMessages(data.data);
        // Mark channel read
        await fetch(`/api/collaboration/channels/${chId}/messages`, { method: 'PATCH' });
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  useEffect(() => {
    if (activeChannelId) {
      fetchMessages(activeChannelId);
    }
  }, [activeChannelId, fetchMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Real-time SSE event listener
  useEffect(() => {
    const eventSource = new EventSource('/api/collaboration/events');

    eventSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);

        if (event.type === 'message:new') {
          const newMsg = event.data as MessageItem;
          if (newMsg.channelId === activeChannelId) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
          }
          fetchChannels();
        } else if (event.type === 'message:edit') {
          const updated = event.data as MessageItem;
          if (updated.channelId === activeChannelId) {
            setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
          }
        } else if (event.type === 'message:delete') {
          const { messageId } = event.data;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId ? { ...m, isDeleted: true, content: 'This message was deleted.' } : m
            )
          );
        } else if (event.type === 'ai:generating') {
          if (event.channelId === activeChannelId) {
            setIsAiGenerating(event.data.isGenerating);
          }
        }
      } catch {}
    };

    return () => {
      eventSource.close();
    };
  }, [activeChannelId, fetchChannels]);

  // Send message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputContent.trim() || !activeChannelId) return;

    const contentToSend = inputContent.trim();
    setInputContent('');
    const replyId = replyToMessage?.id;
    setReplyToMessage(null);

    try {
      const res = await fetch(`/api/collaboration/channels/${activeChannelId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: contentToSend,
          replyToId: replyId
        })
      });
      const data = await res.json();
      if (data.success && data.data) {
        setMessages((prev) => [...prev, data.data]);
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  // Create Group Channel
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupTitle.trim()) return;

    try {
      const res = await fetch('/api/collaboration/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'GROUP',
          name: newGroupTitle.trim(),
          description: newGroupDescription.trim()
        })
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
      console.error('Failed to create channel:', err);
    }
  };

  // Edit Message
  const handleSaveEdit = async (messageId: string) => {
    if (!editContent.trim()) return;
    try {
      const res = await fetch(`/api/collaboration/messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent.trim() })
      });
      const data = await res.json();
      if (data.success && data.data) {
        setMessages((prev) => prev.map((m) => (m.id === messageId ? data.data : m)));
        setEditingMessageId(null);
        setEditContent('');
      }
    } catch (err) {
      console.error('Failed to edit message:', err);
    }
  };

  // Delete Message
  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm('Are you sure you want to delete this message?')) return;
    try {
      const res = await fetch(`/api/collaboration/messages/${messageId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, isDeleted: true, content: 'This message was deleted.' } : m
          )
        );
      }
    } catch (err) {
      console.error('Failed to delete message:', err);
    }
  };

  // Search messages
  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setIsSearching(false);
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch(`/api/collaboration/messages/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.success && data.data) {
        setSearchResults(data.data);
      }
    } catch {}
  };

  // Share Asset
  const handleShareAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareTargetId.trim() || !activeChannelId) return;

    const payload: Record<string, string> = {
      content: `Shared ${shareType.toUpperCase()}: ${shareTargetId}`
    };

    if (shareType === 'roadmap') payload.sharedRoadmapId = shareTargetId;
    if (shareType === 'entity') payload.sharedEntityId = shareTargetId;
    if (shareType === 'document') payload.sharedDocumentId = shareTargetId;
    if (shareType === 'question') payload.sharedStudyQuestionId = shareTargetId;

    try {
      const res = await fetch(`/api/collaboration/channels/${activeChannelId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success && data.data) {
        setMessages((prev) => [...prev, data.data]);
        setShowShareModal(false);
        setShareTargetId('');
      }
    } catch (err) {
      console.error('Failed to share asset:', err);
    }
  };

  const activeChannel = channels.find((c) => c.id === activeChannelId);

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-6 pb-12 p-4 sm:p-6 lg:p-8" data-tour="collab-chat-container">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5" data-tour="collab-header">
        <div>
          <div className="flex items-center space-x-3">
            <span className="text-3xl">💬</span>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 via-indigo-800 to-indigo-600 dark:from-white dark:via-indigo-200 dark:to-indigo-400 bg-clip-text text-transparent">
              Real-Time Collaboration & AI Discussion
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-mono font-semibold border border-indigo-200 dark:border-indigo-800">
              Phase 46
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Instant 1-to-1 DMs, group discussions, entity & roadmap sharing, live typing indicators, and @ai assistant.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-md transition flex items-center space-x-2 whitespace-nowrap self-start sm:self-auto"
          data-tour="collab-new-group-btn"
        >
          <span>➕</span>
          <span>New Group Discussion</span>
        </button>
      </div>

      {/* Main App Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-14rem)] min-h-[600px]">
        {/* Left Sidebar: Channels & Search (4 Cols) */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col space-y-4 shadow-sm" data-tour="collab-channels-list">
          {/* Search Box */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search conversations or messages..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
            />
            {searchQuery && (
              <button
                onClick={() => handleSearch('')}
                className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            )}
          </div>

          {/* Search Results / Channels List */}
          {isSearching ? (
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              <div className="text-[11px] font-mono font-bold uppercase text-slate-400 px-2">
                Search Results ({searchResults.length})
              </div>
              {searchResults.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">No matching messages found</div>
              ) : (
                searchResults.map((m) => (
                  <div
                    key={m.id}
                    onClick={() => {
                      setActiveChannelId(m.channelId);
                      setIsSearching(false);
                    }}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-950 hover:border-indigo-500 transition cursor-pointer space-y-1"
                  >
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="font-semibold text-indigo-400">{m.sender.name || m.sender.email}</span>
                      <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2">{m.content}</p>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              <div className="text-[11px] font-mono font-bold uppercase text-slate-400 px-2 flex justify-between items-center">
                <span>Active Channels</span>
                <span className="text-indigo-400 font-bold">{channels.length}</span>
              </div>

              {loadingChannels ? (
                <div className="text-center py-12 text-xs text-slate-400 animate-pulse">Loading Channels...</div>
              ) : channels.length === 0 ? (
                <div className="text-center py-12 text-xs text-slate-400 space-y-2">
                  <p>No conversations started yet.</p>
                  <p className="text-[11px] text-indigo-400">Create a group or start chatting!</p>
                </div>
              ) : (
                channels.map((ch) => {
                  const isActive = ch.id === activeChannelId;
                  const displayName =
                    ch.type === 'GROUP'
                      ? ch.name
                      : ch.members.find((m) => m.userId !== currentUser?.id)?.user.name ||
                        ch.members.find((m) => m.userId !== currentUser?.id)?.user.email ||
                        'Direct Chat';

                  const otherMember = ch.members.find((m) => m.userId !== currentUser?.id);
                  const isOnline = otherMember?.presence?.status === 'ONLINE';

                  return (
                    <div
                      key={ch.id}
                      onClick={() => setActiveChannelId(ch.id)}
                      className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                        isActive
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 text-slate-900 dark:text-white font-semibold'
                          : 'bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center space-x-3 truncate">
                        <div className="relative">
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

                        <div className="flex flex-col truncate">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold truncate max-w-[130px]">{displayName}</span>
                            {ch.type === 'GROUP' && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 font-mono">
                                GROUP
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 truncate">
                            {ch.latestMessage ? ch.latestMessage.content : 'No messages yet'}
                          </span>
                        </div>
                      </div>

                      {ch.unreadCount > 0 && (
                        <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">
                          {ch.unreadCount}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Center / Main Feed Panel (8 Cols) */}
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col shadow-sm">
          {activeChannel ? (
            <>
              {/* Active Channel Header */}
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-sm">
                    {activeChannel.type === 'GROUP' ? '👥' : '💬'}
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      {activeChannel.type === 'GROUP'
                        ? activeChannel.name
                        : activeChannel.members.find((m) => m.userId !== currentUser?.id)?.user.name || 'Direct Chat'}
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      {activeChannel.type === 'GROUP'
                        ? `${activeChannel.members.length} Members • Group Discussion`
                        : `1-to-1 Discussion`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setShowShareModal(true)}
                    className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition"
                    data-tour="collab-share-asset-btn"
                  >
                    🔗 Share Asset
                  </button>
                </div>
              </div>

              {/* Message History Feed */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-2" data-tour="collab-message-feed">
                {loadingMessages ? (
                  <div className="text-center py-20 text-xs text-slate-400 animate-pulse">Loading Messages...</div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-20 text-xs text-slate-400 space-y-2">
                    <p className="text-base">🚀</p>
                    <p>Start the conversation! Type a message below.</p>
                    <p className="text-[11px] text-indigo-400">Tip: Type @ai to invoke Gemini Assistant!</p>
                  </div>
                ) : (
                  messages.map((m) => {
                    const isSelf = m.senderId === currentUser?.id;

                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col space-y-1 ${isSelf ? 'items-end' : 'items-start'}`}
                      >
                        {/* Sender info header */}
                        <div className="flex items-center space-x-2 text-[10px] text-slate-400">
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                            {m.isAi ? '🤖 Gemini AI' : m.sender.name || m.sender.email}
                          </span>
                          {m.isAi && (
                            <span className="px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-mono">
                              AI BOT
                            </span>
                          )}
                          <span>•</span>
                          <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>

                        {/* Quoted Thread Reply */}
                        {m.replyTo && (
                          <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-950 border-l-2 border-indigo-500 text-[11px] text-slate-600 dark:text-slate-400 max-w-md">
                            <span className="font-semibold text-indigo-400">
                              Replying to {m.replyTo.sender.name || m.replyTo.sender.email}:
                            </span>{' '}
                            <span className="truncate">{m.replyTo.content}</span>
                          </div>
                        )}

                        {/* Message Content Bubble */}
                        <div
                          className={`p-3.5 rounded-2xl max-w-lg text-xs space-y-2 shadow-sm ${
                            m.isAi
                              ? 'bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-slate-900 dark:text-slate-100'
                              : isSelf
                              ? 'bg-indigo-600 text-white rounded-br-none'
                              : 'bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-none'
                          }`}
                        >
                          {editingMessageId === m.id ? (
                            <div className="space-y-2">
                              <input
                                type="text"
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white"
                              />
                              <div className="flex space-x-2 justify-end">
                                <button
                                  onClick={() => setEditingMessageId(null)}
                                  className="px-2 py-1 text-[10px] text-slate-400 hover:text-white"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => handleSaveEdit(m.id)}
                                  className="px-3 py-1 text-[10px] bg-indigo-600 text-white rounded-lg font-semibold"
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                          )}

                          {/* Shared Roadmap Card */}
                          {m.sharedRoadmapId && (
                            <div className="p-3 rounded-xl bg-indigo-950/80 border border-indigo-800/80 text-white space-y-1">
                              <div className="flex items-center space-x-1.5 text-xs font-bold">
                                <span>🚀</span>
                                <span>Shared AI Roadmap</span>
                              </div>
                              <p className="text-[11px] text-indigo-300">ID: {m.sharedRoadmapId}</p>
                              <Link
                                href={`/roadmaps/${m.sharedRoadmapId}`}
                                className="inline-block px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-semibold rounded-lg transition"
                              >
                                View Roadmap →
                              </Link>
                            </div>
                          )}

                          {/* Shared Entity Card */}
                          {m.sharedEntityId && (
                            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-white space-y-1">
                              <div className="flex items-center space-x-1.5 text-xs font-bold text-emerald-400">
                                <span>🕸️</span>
                                <span>Shared Knowledge Entity</span>
                              </div>
                              <p className="text-[11px] text-slate-400">Entity: {m.sharedEntityId}</p>
                              <Link
                                href={`/knowledge-graph?entity=${m.sharedEntityId}`}
                                className="inline-block px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold rounded-lg transition"
                              >
                                Inspect Entity in Graph →
                              </Link>
                            </div>
                          )}

                          {/* Footer Actions & Metadata */}
                          <div className="flex items-center justify-between text-[10px] opacity-75 pt-1">
                            <div className="flex items-center space-x-2">
                              {m.isEdited && <span className="font-mono text-amber-400">(edited)</span>}
                            </div>

                            {!m.isDeleted && !m.isAi && (
                              <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition">
                                <button
                                  onClick={() => setReplyToMessage(m)}
                                  className="hover:underline text-indigo-300"
                                >
                                  Reply
                                </button>
                                {isSelf && (
                                  <>
                                    <button
                                      onClick={() => {
                                        setEditingMessageId(m.id);
                                        setEditContent(m.content);
                                      }}
                                      className="hover:underline text-slate-300"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => handleDeleteMessage(m.id)}
                                      className="hover:underline text-rose-400"
                                    >
                                      Delete
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}

                {/* AI Generating Indicator */}
                {isAiGenerating && (
                  <div className="flex items-center space-x-2 p-3 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-xs text-purple-700 dark:text-purple-300 animate-pulse">
                    <span>🤖</span>
                    <span>Gemini AI is generating a discussion reply...</span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Quoted Reply Banner */}
              {replyToMessage && (
                <div className="p-2.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 mb-2">
                  <div className="flex items-center space-x-2 truncate">
                    <span className="font-bold text-indigo-400">Replying to {replyToMessage.sender.name || replyToMessage.sender.email}:</span>
                    <span className="truncate">{replyToMessage.content}</span>
                  </div>
                  <button onClick={() => setReplyToMessage(null)} className="text-slate-400 hover:text-white">
                    ✕
                  </button>
                </div>
              )}

              {/* Message Input Box */}
              <form onSubmit={handleSendMessage} className="mt-3 flex items-center space-x-2" data-tour="collab-input-box">
                <input
                  type="text"
                  placeholder="Type a message... (Use @ai to ask Gemini Assistant)"
                  value={inputContent}
                  onChange={(e) => setInputContent(e.target.value)}
                  className="flex-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                />

                <button
                  type="button"
                  onClick={() => setInputContent((prev) => `${prev} @ai `)}
                  className="px-3 py-2.5 rounded-xl bg-purple-100 dark:bg-purple-950/60 hover:bg-purple-200 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 font-mono text-xs font-bold transition"
                  title="Mention @ai"
                >
                  @ai
                </button>

                <button
                  type="submit"
                  disabled={!inputContent.trim()}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-md transition"
                >
                  Send 🚀
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-center p-8 text-slate-400 text-xs">
              Select a channel from the left sidebar to start chatting
            </div>
          )}
        </div>
      </div>

      {/* New Group Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Create Group Discussion</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white text-xs">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Group Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. AI Roadmap Research Team"
                  value={newGroupTitle}
                  onChange={(e) => setNewGroupTitle(e.target.value)}
                  className="w-full p-2.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Description (Optional)</label>
                <textarea
                  rows={3}
                  placeholder="Topic or objective of this group..."
                  value={newGroupDescription}
                  onChange={(e) => setNewGroupDescription(e.target.value)}
                  className="w-full p-2.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex space-x-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-md transition"
                >
                  Create Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Share Asset Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Share Workspace Asset</h3>
              <button onClick={() => setShowShareModal(false)} className="text-slate-400 hover:text-white text-xs">
                ✕
              </button>
            </div>

            <form onSubmit={handleShareAsset} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Asset Type</label>
                <select
                  value={shareType}
                  onChange={(e) => setShareType(e.target.value as any)}
                  className="w-full p-2.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white"
                >
                  <option value="roadmap">🚀 AI Roadmap</option>
                  <option value="entity">🕸️ Knowledge Graph Entity</option>
                  <option value="document">📄 Uploaded Document</option>
                  <option value="question">🎓 Study Mode Question</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Asset ID / Reference</label>
                <input
                  type="text"
                  required
                  placeholder="Enter ID or title reference..."
                  value={shareTargetId}
                  onChange={(e) => setShareTargetId(e.target.value)}
                  className="w-full p-2.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex space-x-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowShareModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-md transition"
                >
                  Share Asset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
