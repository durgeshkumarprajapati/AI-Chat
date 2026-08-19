'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useWorkspace } from '@/context/WorkspaceContext';
import { mergeMessages, CollabMessageItem } from '@/features/collaboration/message-deduplication';

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
  clientMessageId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  sender: UserSummary;
  replyTo?: { id: string; content: string; sender: { name: string | null; email: string } } | null;
  receipts?: Array<{ id: string; userId: string; status: string; deliveredAt?: string | Date | null; readAt?: string | Date | null }>;
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

  // User Search & DM Modal
  const [showUserSearchModal, setShowUserSearchModal] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<UserSummary[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);

  // Group Creation Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');

  // Add Group Members Modal
  const [showAddMembersModal, setShowAddMembersModal] = useState(false);
  const [addMembersQuery, setAddMembersQuery] = useState('');
  const [addMembersSearchResults, setAddMembersSearchResults] = useState<UserSummary[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [isAddingMembers, setIsAddingMembers] = useState(false);

  // Group Members & Management Modal
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [removedBanner, setRemovedBanner] = useState<string | null>(null);

  // Group Receipts Popover
  const [receiptSummaryMessageId, setReceiptSummaryMessageId] = useState<string | null>(null);
  const [receiptSummaryData, setReceiptSummaryData] = useState<any>(null);

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
        // Mark channel read & send read ACK
        await fetch(`/api/collaboration/channels/${chId}/read`, { method: 'POST' });
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

  // Debounced User Search for DM Modal
  useEffect(() => {
    if (!showUserSearchModal || userSearchQuery.trim().length < 2) {
      setUserSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingUsers(true);
      try {
        const res = await fetch(`/api/collaboration/users/search?q=${encodeURIComponent(userSearchQuery)}`);
        const data = await res.json();
        if (data.success && data.data) {
          setUserSearchResults(data.data);
        }
      } catch (err) {
        console.error('User search failed:', err);
      } finally {
        setIsSearchingUsers(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [userSearchQuery, showUserSearchModal]);

  // Debounced User Search for Add Members Modal
  useEffect(() => {
    if (!showAddMembersModal || addMembersQuery.trim().length < 2) {
      setAddMembersSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/collaboration/users/search?q=${encodeURIComponent(addMembersQuery)}`);
        const data = await res.json();
        if (data.success && data.data) {
          setAddMembersSearchResults(data.data);
        }
      } catch (err) {
        console.error('Add members search failed:', err);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [addMembersQuery, showAddMembersModal]);

  // Real-time SSE event listener with deduplication & delivery receipts
  useEffect(() => {
    const eventSource = new EventSource('/api/collaboration/events');

    eventSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);

        if (event.type === 'message:new') {
          const newMsg = event.data as MessageItem;
          if (newMsg.channelId === activeChannelId) {
            setMessages((prev) => mergeMessages(prev, newMsg));
            // Automatically send delivery ACK for message sent by another user
            if (newMsg.senderId !== currentUser?.id) {
              fetch(`/api/collaboration/channels/${activeChannelId}/messages/delivery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messageIds: [newMsg.id] })
              }).catch(() => {});
            }
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
        } else if (event.type === 'member:removed') {
          if (event.data?.userId === currentUser?.id) {
            setRemovedBanner('You were removed from this group.');
            if (event.channelId === activeChannelId) {
              setActiveChannelId(null);
              setMessages([]);
            }
          }
          fetchChannels();
        } else if (event.type === 'member:left' || event.type === 'member:owner_changed') {
          fetchChannels();
          if (activeChannelId && event.channelId === activeChannelId) {
            fetchMessages(activeChannelId);
          }
        } else if (event.type === 'message:delivered' || event.type === 'message:read') {
          if (activeChannelId && event.channelId === activeChannelId) {
            fetchMessages(activeChannelId);
          }
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
  }, [activeChannelId, currentUser?.id, fetchChannels, fetchMessages]);

  // Select User from Search & Start/Reuse DM
  const handleStartDM = async (targetUser: UserSummary) => {
    try {
      const res = await fetch('/api/collaboration/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'DIRECT',
          targetUserId: targetUser.id
        })
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
      console.error('Failed to start DM:', err);
    }
  };

  // Add Selected Members to Active Group
  const handleAddMembersSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChannelId || selectedMemberIds.length === 0) return;

    setIsAddingMembers(true);
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
        setAddMembersQuery('');
        setAddMembersSearchResults([]);
        await fetchChannels();
        await fetchMessages(activeChannelId);
      }
    } catch (err) {
      console.error('Failed to add group members:', err);
    } finally {
      setIsAddingMembers(false);
    }
  };

  // Remove Group Member
  const handleRemoveMember = async (targetUserId: string) => {
    if (!activeChannelId) return;
    if (!confirm('Are you sure you want to remove this member from the group?')) return;

    try {
      const res = await fetch(`/api/collaboration/channels/${activeChannelId}/members/${targetUserId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        await fetchChannels();
        await fetchMessages(activeChannelId);
      } else {
        alert(data.error || 'Failed to remove member');
      }
    } catch (err) {
      console.error('Failed to remove member:', err);
    }
  };

  // Leave Group
  const handleLeaveGroup = async () => {
    if (!activeChannelId) return;
    if (!confirm('Are you sure you want to leave this group?')) return;

    try {
      const res = await fetch(`/api/collaboration/channels/${activeChannelId}/leave`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        setShowMembersModal(false);
        setActiveChannelId(null);
        setMessages([]);
        await fetchChannels();
      } else {
        alert(data.error || 'Failed to leave group');
      }
    } catch (err) {
      console.error('Failed to leave group:', err);
    }
  };

  // Transfer Ownership
  const handleTransferOwner = async (newOwnerId: string) => {
    if (!activeChannelId) return;
    if (!confirm('Are you sure you want to transfer group ownership?')) return;

    try {
      const res = await fetch(`/api/collaboration/channels/${activeChannelId}/transfer-owner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: newOwnerId })
      });
      const data = await res.json();
      if (data.success) {
        await fetchChannels();
        await fetchMessages(activeChannelId);
      } else {
        alert(data.error || 'Failed to transfer ownership');
      }
    } catch (err) {
      console.error('Failed to transfer ownership:', err);
    }
  };

  // Fetch Message Receipt Summary
  const handleFetchReceiptSummary = async (messageId: string) => {
    if (!activeChannelId) return;
    setReceiptSummaryMessageId(messageId);
    setReceiptSummaryData(null);
    try {
      const res = await fetch(`/api/collaboration/channels/${activeChannelId}/receipts/${messageId}`);
      const data = await res.json();
      if (data.success && data.data) {
        setReceiptSummaryData(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch receipt summary:', err);
    }
  };

  // Retry Failed Message (Reuses SAME clientMessageId)
  const handleRetryMessage = async (msg: MessageItem) => {
    if (!activeChannelId || !msg.clientMessageId) return;

    setMessages((prev) =>
      prev.map((m) => (m.clientMessageId === msg.clientMessageId ? { ...m, status: 'SENDING' } : m))
    );

    try {
      const res = await fetch(`/api/collaboration/channels/${activeChannelId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: msg.content,
          replyToId: msg.replyToId,
          clientMessageId: msg.clientMessageId
        })
      });
      const data = await res.json();
      if (data.success && data.data) {
        setMessages((prev) => mergeMessages(prev, data.data));
      } else {
        setMessages((prev) =>
          prev.map((m) => (m.clientMessageId === msg.clientMessageId ? { ...m, status: 'FAILED' } : m))
        );
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) => (m.clientMessageId === msg.clientMessageId ? { ...m, status: 'FAILED' } : m))
      );
    }
  };

  // Send message with clientMessageId & deduplication
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputContent.trim() || !activeChannelId || !currentUser) return;

    const contentToSend = inputContent.trim();
    setInputContent('');
    const replyId = replyToMessage?.id;
    setReplyToMessage(null);

    const clientMessageId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Optimistic UI insertion
    const optimisticMsg: MessageItem = {
      id: clientMessageId,
      clientMessageId,
      channelId: activeChannelId,
      senderId: currentUser.id,
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
          clientMessageId
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
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) => (m.clientMessageId === clientMessageId ? { ...m, status: 'FAILED' } : m))
      );
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

        <div className="flex items-center space-x-2 self-start sm:self-auto">
          <button
            onClick={() => {
              setShowUserSearchModal(true);
              setUserSearchQuery('');
              setUserSearchResults([]);
            }}
            className="px-4 py-2 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-semibold text-xs rounded-xl shadow-md transition flex items-center space-x-2 whitespace-nowrap"
            aria-label="New Chat"
            data-tour="collab-new-chat-btn"
          >
            <span>💬</span>
            <span>New Chat</span>
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-md transition flex items-center space-x-2 whitespace-nowrap"
            aria-label="New Group Discussion"
            data-tour="collab-new-group-btn"
          >
            <span>👥</span>
            <span>New Group</span>
          </button>
        </div>
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
                  <p className="text-[11px] text-indigo-400">Click &quot;New Chat&quot; to search users!</p>
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

              {/* Removed from Group Banner Alert */}
              {removedBanner && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center justify-between text-xs text-rose-700 dark:text-rose-300 mb-3">
                  <div className="flex items-center space-x-2">
                    <span>🚫</span>
                    <span className="font-semibold">{removedBanner}</span>
                  </div>
                  <button onClick={() => setRemovedBanner(null)} className="text-rose-400 hover:text-rose-200 text-xs">
                    ✕
                  </button>
                </div>
              )}

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

                          {/* Footer Actions, Receipt Icons & Metadata */}
                          <div className="flex items-center justify-between text-[10px] opacity-90 pt-1 border-t border-white/10 dark:border-slate-800/40 mt-1">
                            <div className="flex items-center space-x-2">
                              {m.isEdited && <span className="font-mono text-amber-400">(edited)</span>}
                              
                              {/* Status Indicators & Receipts */}
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
                                      <button
                                        type="button"
                                        onClick={() => handleRetryMessage(m)}
                                        className="underline text-amber-300 hover:text-white font-bold"
                                        aria-label="Retry sending message"
                                      >
                                        Retry
                                      </button>
                                    </div>
                                  ) : (
                                    (() => {
                                      const receipts = m.receipts || [];
                                      const hasRead = receipts.some((r) => r.status === 'READ');
                                      const hasDelivered = receipts.some((r) => r.status === 'DELIVERED');

                                      if (hasRead) {
                                        return (
                                          <span className="text-emerald-300 font-bold" aria-label="Seen" title="Seen">
                                            ✓✓ Seen
                                          </span>
                                        );
                                      }
                                      if (hasDelivered) {
                                        return (
                                          <span className="text-slate-300 font-bold" aria-label="Delivered" title="Delivered">
                                            ✓✓ Delivered
                                          </span>
                                        );
                                      }
                                      return (
                                        <span className="text-slate-300 font-bold" aria-label="Sent" title="Sent">
                                          ✓ Sent
                                        </span>
                                      );
                                    })()
                                  )}
                                </div>
                              )}

                              {/* Group Receipts Popover Trigger */}
                              {activeChannel?.type === 'GROUP' && !m.isDeleted && !m.isAi && (
                                <button
                                  type="button"
                                  onClick={() => handleFetchReceiptSummary(m.id)}
                                  className="text-[10px] text-indigo-200 hover:text-white underline font-medium"
                                  title="View message receipts"
                                >
                                  Seen info
                                </button>
                              )}
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

              {/* Multiline Message Input Composer */}
              <form onSubmit={handleSendMessage} className="mt-3 flex items-start space-x-2" data-tour="collab-input-box">
                <textarea
                  rows={2}
                  placeholder="Type a message... (Press Enter to send, Shift+Enter for newline, use @ai for Gemini)"
                  value={inputContent}
                  onChange={(e) => setInputContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  className="flex-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 resize-none"
                  aria-label="Message input composer"
                />

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

      {/* User Search / New Chat DM Modal */}
      {showUserSearchModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Start New Conversation</h3>
              <button onClick={() => setShowUserSearchModal(false)} className="text-slate-400 hover:text-white text-xs">
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                autoFocus
                placeholder="Search users by name or email..."
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                className="w-full p-2.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                aria-label="Search users"
              />

              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                {isSearchingUsers ? (
                  <div className="text-center py-6 text-xs text-slate-400 animate-pulse">Searching users...</div>
                ) : userSearchQuery.trim().length < 2 ? (
                  <div className="text-center py-6 text-xs text-slate-400">Type at least 2 characters to search...</div>
                ) : userSearchResults.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-400">No users found matching &quot;{userSearchQuery}&quot;</div>
                ) : (
                  userSearchResults.map((u) => (
                    <div
                      key={u.id}
                      onClick={() => handleStartDM(u)}
                      className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-indigo-500 transition cursor-pointer flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">
                          {u.name ? u.name[0]?.toUpperCase() : u.email[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900 dark:text-white">{u.name || u.email.split('@')[0]}</p>
                          <p className="text-[11px] text-slate-400">{u.email}</p>
                        </div>
                      </div>
                      <span className="text-xs text-indigo-500 font-semibold">Start DM →</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Members to Group Modal */}
      {showAddMembersModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Add Members to Group</h3>
                <p className="text-[11px] text-slate-400">Selected: {selectedMemberIds.length}</p>
              </div>
              <button onClick={() => setShowAddMembersModal(false)} className="text-slate-400 hover:text-white text-xs">
                ✕
              </button>
            </div>

            <form onSubmit={handleAddMembersSubmit} className="space-y-4">
              <input
                type="text"
                autoFocus
                placeholder="Search users to add..."
                value={addMembersQuery}
                onChange={(e) => setAddMembersQuery(e.target.value)}
                className="w-full p-2.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                aria-label="Search users to add to group"
              />

              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                {addMembersQuery.trim().length < 2 ? (
                  <div className="text-center py-6 text-xs text-slate-400">Type at least 2 characters to search users...</div>
                ) : addMembersSearchResults.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-400">No users found</div>
                ) : (
                  addMembersSearchResults.map((u) => {
                    const isSelected = selectedMemberIds.includes(u.id);
                    const isAlreadyInGroup = activeChannel?.members.some((m) => m.userId === u.id);

                    return (
                      <div
                        key={u.id}
                        onClick={() => {
                          if (isAlreadyInGroup) return;
                          setSelectedMemberIds((prev) =>
                            isSelected ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                          );
                        }}
                        className={`p-2.5 rounded-xl border transition flex items-center justify-between ${
                          isAlreadyInGroup
                            ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                            : isSelected
                            ? 'bg-indigo-50 dark:bg-indigo-950 border-indigo-500 cursor-pointer'
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <input
                            type="checkbox"
                            checked={isSelected || isAlreadyInGroup}
                            disabled={isAlreadyInGroup}
                            onChange={() => {}}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <div>
                            <p className="text-xs font-bold text-slate-900 dark:text-white">{u.name || u.email.split('@')[0]}</p>
                            <p className="text-[11px] text-slate-400">{u.email}</p>
                          </div>
                        </div>
                        {isAlreadyInGroup && <span className="text-[10px] text-slate-400 font-mono">Already Member</span>}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="flex space-x-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddMembersModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={selectedMemberIds.length === 0 || isAddingMembers}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-md transition"
                >
                  {isAddingMembers ? 'Adding Members...' : `Add Selected (${selectedMemberIds.length})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Group Members & Roles Management Modal */}
      {showMembersModal && activeChannel && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <span className="text-lg">👥</span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Group Members ({activeChannel.members.length})
                </h3>
              </div>
              <button onClick={() => setShowMembersModal(false)} className="text-slate-400 hover:text-white text-xs">
                ✕
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
              {activeChannel.members.map((m) => {
                const isMemberSelf = m.userId === currentUser?.id;
                const isRequestorOwner = activeChannel.role === 'OWNER';
                const isRequestorAdmin = activeChannel.role === 'ADMIN';
                const canRemove =
                  !isMemberSelf &&
                  m.role !== 'OWNER' &&
                  (isRequestorOwner || (isRequestorAdmin && m.role === 'MEMBER'));

                const uName = m.user?.name;
                const uEmail = m.user?.email || '';
                const initialChar = (uName && uName.charAt(0)) ? uName.charAt(0).toUpperCase() : (uEmail.charAt(0) ? uEmail.charAt(0).toUpperCase() : 'U');

                return (
                  <div key={m.userId} className="py-3 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 text-white font-bold flex items-center justify-center text-xs">
                        {initialChar}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <p className="text-xs font-bold text-slate-900 dark:text-white">
                            {uName || (uEmail ? uEmail.split('@')[0] : 'User')}
                          </p>
                          {m.role === 'OWNER' ? (
                            <span className="px-1.5 py-0.5 text-[9px] bg-amber-500/20 text-amber-500 font-bold rounded">
                              👑 OWNER
                            </span>
                          ) : m.role === 'ADMIN' ? (
                            <span className="px-1.5 py-0.5 text-[9px] bg-indigo-500/20 text-indigo-400 font-bold rounded">
                              ⭐ ADMIN
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 text-[9px] bg-slate-500/20 text-slate-400 font-medium rounded">
                              MEMBER
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400">{m.user.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      {isRequestorOwner && !isMemberSelf && (
                        <button
                          onClick={() => handleTransferOwner(m.userId)}
                          className="px-2 py-1 text-[10px] bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 font-semibold rounded-lg transition"
                          title="Make Owner"
                        >
                          Transfer Owner
                        </button>
                      )}
                      {canRemove && (
                        <button
                          onClick={() => handleRemoveMember(m.userId)}
                          className="px-2 py-1 text-[10px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-semibold rounded-lg transition"
                          title="Remove from group"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between items-center border-t border-slate-200 dark:border-slate-800 pt-3">
              <button
                type="button"
                onClick={handleLeaveGroup}
                className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold text-xs rounded-xl transition"
              >
                Leave Group 🚪
              </button>
              <button
                type="button"
                onClick={() => setShowMembersModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-xl transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group Message Receipts Popover Modal */}
      {receiptSummaryMessageId && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center space-x-1.5">
                <span>✓✓</span>
                <span>Message Receipt Details</span>
              </h3>
              <button
                onClick={() => {
                  setReceiptSummaryMessageId(null);
                  setReceiptSummaryData(null);
                }}
                className="text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            {!receiptSummaryData ? (
              <div className="p-6 text-center text-xs text-slate-400 animate-pulse">Loading receipt info...</div>
            ) : (
              <div className="space-y-3 text-xs">
                <div>
                  <h4 className="font-bold text-indigo-400 mb-1.5">
                    Seen by ({receiptSummaryData.seenCount})
                  </h4>
                  {receiptSummaryData.seenBy.length === 0 ? (
                    <p className="text-slate-500 italic text-[11px]">No members have seen this yet</p>
                  ) : (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {receiptSummaryData.seenBy.map((item: any) => (
                        <div key={item.userId} className="flex justify-between items-center text-[11px] p-1.5 bg-slate-50 dark:bg-slate-950 rounded-lg">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {item.user?.name || item.user?.email}
                          </span>
                          <span className="text-slate-400 text-[10px]">
                            {new Date(item.readAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-200 dark:border-slate-800 pt-2">
                  <h4 className="font-bold text-slate-400 mb-1.5">
                    Delivered to ({receiptSummaryData.deliveredCount})
                  </h4>
                  {receiptSummaryData.deliveredTo.length === 0 ? (
                    <p className="text-slate-500 italic text-[11px]">Pending delivery</p>
                  ) : (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {receiptSummaryData.deliveredTo.map((item: any) => (
                        <div key={item.userId} className="flex justify-between items-center text-[11px] p-1.5 bg-slate-50 dark:bg-slate-950 rounded-lg">
                          <span className="text-slate-700 dark:text-slate-300">
                            {item.user?.name || item.user?.email}
                          </span>
                          <span className="text-slate-400 text-[10px]">
                            {new Date(item.deliveredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

