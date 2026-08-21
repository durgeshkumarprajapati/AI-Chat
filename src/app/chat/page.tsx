'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { EvidenceModal } from '@/components/chat/EvidenceModal';
import { ttsService, TTSLanguage } from '@/features/tts/tts.service';
import { speechToTextService, VoiceState, SUPPORTED_VOICE_LANGUAGES, getFriendlyVoiceErrorMessage } from '@/features/voice';

type Citation = {
  id?: string;
  index?: number;
  documentId: string;
  chunkId: string;
  filename: string;
  pageNumber: number;
  similarity: number;
  rerankScore?: number;
  sourceType?: 'vector' | 'keyword' | 'hybrid';
  evidenceSnippet?: string;
  confidence?: number;
  confidenceLabel?: 'Strong' | 'Moderate' | 'Limited';
  answerSegmentIds?: string[];
  knowledgeSourceType?: 'WEB' | 'DOCUMENT';
  webUrl?: string;
  canonicalUrl?: string;
};

type ChatMessage = {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  citations?: Citation[];
  retrievedChunks?: number;
  topSimilarity?: number;
  retrievalQuery?: string;
  contextMessagesCount?: number;
  answerMode?: string;
  availableActions?: string[];
  cacheHit?: boolean;
  isStreaming?: boolean;
  createdAt?: string;
};

type ConversationSummary = {
  id: string;
  title: string;
  summary?: string | null;
  knowledgeBaseId?: string | null;
  createdAt: string;
  updatedAt: string;
};

type KnowledgeBaseOption = {
  id: string;
  name: string;
  documentCount: number;
};

function ChatPageContent() {
  const searchParams = useSearchParams();
  const initialKbId = searchParams.get('knowledgeBaseId');

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseOption[]>([]);
  const [selectedKbId, setSelectedKbId] = useState<string>(initialKbId || '');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState<string>('New Chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [fetchingHistory, setFetchingHistory] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [userFeedbackState, setUserFeedbackState] = useState<Record<string, { rating: 'POSITIVE' | 'NEGATIVE'; reason?: string }>>({});
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);
  const [activeModalCitation, setActiveModalCitation] = useState<Citation | null>(null);
  const [sourceMode, setSourceMode] = useState<'documents_only' | 'web_only' | 'all_sources' | 'web_discovery' | 'web_search' | 'auto'>('documents_only');
  const [targetWebsite, setTargetWebsite] = useState('');
  const [allowedSources, setAllowedSources] = useState<string[]>(['wikipedia', 'medium']);
  const [savingSourceUrl, setSavingSourceUrl] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<{ id: string; filename: string; mimeType: string; fileSize: number; storageKey: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Phase 29 TTS Audio State
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [pausedMsgId, setPausedMsgId] = useState<string | null>(null);
  const [ttsLang, setTtsLang] = useState<TTSLanguage>('en-US');
  const [ttsSpeed, setTtsSpeed] = useState<number>(1.0);

  // Phase 32 Voice STT Input State
  const [voiceState, setVoiceState] = useState<VoiceState>('IDLE');
  const [voiceLanguage, setVoiceLanguage] = useState<string>('en-US');
  const [voiceErrorMsg, setVoiceErrorMsg] = useState<string | null>(null);
  const [interimTranscript, setInterimTranscript] = useState<string>('');

  useEffect(() => {
    const unsubState = speechToTextService.onStateChange((st) => setVoiceState(st));
    const unsubTranscript = speechToTextService.onTranscript((text, isFinal) => {
      if (isFinal) {
        setQuestion((prev) => (prev ? `${prev} ${text}`.trim() : text));
        setInterimTranscript('');
      } else {
        setInterimTranscript(text);
      }
    });
    const unsubError = speechToTextService.onError((err) => {
      setVoiceErrorMsg(getFriendlyVoiceErrorMessage(err));
    });

    return () => {
      unsubState();
      unsubTranscript();
      unsubError();
    };
  }, []);

  const handleToggleVoice = () => {
    setVoiceErrorMsg(null);
    if (voiceState === 'LISTENING' || voiceState === 'STARTING') {
      speechToTextService.stopListening();
    } else {
      speechToTextService.startListening({ locale: voiceLanguage });
    }
  };

  const handleSpeak = (msgId: string, text: string) => {
    if (speakingMsgId === msgId) {
      ttsService.pause();
      setSpeakingMsgId(null);
      setPausedMsgId(msgId);
      return;
    }

    if (pausedMsgId === msgId) {
      ttsService.resume();
      setSpeakingMsgId(msgId);
      setPausedMsgId(null);
      return;
    }

    ttsService.speak(text, {
      language: ttsLang,
      speed: ttsSpeed,
      onStart: () => {
        setSpeakingMsgId(msgId);
        setPausedMsgId(null);
      },
      onEnd: () => {
        setSpeakingMsgId(null);
        setPausedMsgId(null);
      },
      onError: () => {
        setSpeakingMsgId(null);
        setPausedMsgId(null);
      }
    });
  };

  const handleStopSpeak = () => {
    ttsService.stop();
    setSpeakingMsgId(null);
    setPausedMsgId(null);
  };

  const handleSaveDiscoveredSource = async (url: string) => {
    if (!url || savingSourceUrl) return;
    setSavingSourceUrl(url);
    try {
      const res = await fetch('/api/web-sources/save-discovered', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, knowledgeBaseId: selectedKbId || undefined })
      });
      const json = await res.json();
      if (json.success) {
        setSaveSuccessMsg(`Saved ${url} to Knowledge Base!`);
        setTimeout(() => setSaveSuccessMsg(null), 3000);
      }
    } catch (err) {
      console.error('Failed to save discovered source:', err);
    } finally {
      setSavingSourceUrl(null);
    }
  };

  const handleFeedbackSubmit = async (messageId: string, rating: 'POSITIVE' | 'NEGATIVE', reason?: string) => {
    if (!activeConversationId) return;
    try {
      const res = await fetch('/api/rag/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          conversationId: activeConversationId,
          rating,
          reason
        })
      });
      const json = await res.json();
      if (json.success) {
        setUserFeedbackState((prev) => ({
          ...prev,
          [messageId]: { rating, reason }
        }));
        setFeedbackToast('Thanks for your feedback! ✨');
        setTimeout(() => setFeedbackToast(null), 3000);
      }
    } catch (err) {
      console.error('Failed to submit user feedback:', err);
    }
  };

  // Rename & Delete Modals
  const [renameConvId, setRenameConvId] = useState<string | null>(null);
  const [newTitleInput, setNewTitleInput] = useState('');
  const [deleteConvId, setDeleteConvId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const autoSubmittedRef = useRef<string | null>(null);
  const router = useRouter();

  const fetchConversations = useCallback(async (querySearch?: string) => {
    try {
      const q = querySearch !== undefined ? querySearch : searchTerm;
      const url = `/api/conversations?pageSize=50${q ? `&search=${encodeURIComponent(q)}` : ''}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        const items = json.data.items || json.data || [];
        setConversations(items);
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  }, [searchTerm]);

  const fetchKnowledgeBases = async () => {
    try {
      const res = await fetch('/api/knowledge-bases?pageSize=100');
      const json = await res.json();
      if (json.success) {
        const items = json.data.items || [];
        setKnowledgeBases(items.map((k: { id: string; name: string; documentCount: number }) => ({
          id: k.id,
          name: k.name,
          documentCount: k.documentCount
        })));
      }
    } catch (err) {
      console.error('Failed to load knowledge bases for selector:', err);
    }
  };

  const loadConversationHistory = useCallback(async (convId: string) => {
    setFetchingHistory(true);
    try {
      const res = await fetch(`/api/conversations/${convId}`);
      const json = await res.json();
      if (json.success) {
        setMessages(json.data.messages || []);
        setActiveConversationId(convId);
        setActiveTitle(json.data.title || 'Chat');
        if (json.data.knowledgeBaseId) {
          setSelectedKbId(json.data.knowledgeBaseId);
        }
      }
    } catch (err) {
      console.error('Failed to load conversation messages:', err);
    } finally {
      setFetchingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
    fetchKnowledgeBases();
  }, [fetchConversations]);

  useEffect(() => {
    if (initialKbId) {
      setSelectedKbId(initialKbId);
    }
  }, [initialKbId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, streaming]);



  const handleStartNewChat = () => {
    if (streaming && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setActiveConversationId(null);
    setActiveTitle('New Chat');
    setMessages([]);
    setQuestion('');
    setStreaming(false);
    setLoading(false);
  };

  const handleStopGenerating = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setStreaming(false);
      setLoading(false);
      setMessages((prev) =>
        prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m))
      );
    }
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRenameSubmit = async () => {
    if (!renameConvId || !newTitleInput.trim()) return;
    try {
      const res = await fetch(`/api/conversations/${renameConvId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitleInput.trim() })
      });
      const json = await res.json();
      if (json.success) {
        if (activeConversationId === renameConvId) {
          setActiveTitle(newTitleInput.trim());
        }
        setRenameConvId(null);
        setNewTitleInput('');
        fetchConversations();
      }
    } catch (err) {
      console.error('Failed to rename conversation:', err);
    }
  };

  const handleDeleteSubmit = async () => {
    if (!deleteConvId) return;
    try {
      const res = await fetch(`/api/conversations/${deleteConvId}`, {
        method: 'DELETE'
      });
      const json = await res.json();
      if (json.success) {
        if (activeConversationId === deleteConvId) {
          handleStartNewChat();
        }
        setDeleteConvId(null);
        fetchConversations();
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  const handleSendMessage = useCallback(
    async (
      promptOverride?: string,
      options?: {
        allowGeneralKnowledge?: boolean;
        searchAllKbs?: boolean;
        overrideSourceMode?: 'documents_only' | 'web_only' | 'all_sources' | 'web_discovery' | 'web_search' | 'auto';
      }
    ) => {
      const q = (promptOverride || question).trim();
      if (!q || loading || streaming) return;

      const effectiveSourceMode = options?.overrideSourceMode || sourceMode;

      const tempUserMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'USER',
        content: q
      };

      const tempAssistantId = `assistant-${Date.now()}`;
      const tempAssistantMsg: ChatMessage = {
        id: tempAssistantId,
        role: 'ASSISTANT',
        content: '',
        isStreaming: true,
        citations: []
      };

      setMessages((prev) => [...prev, tempUserMsg, tempAssistantMsg]);
      setQuestion('');
      setLoading(true);
      setStreaming(true);

      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: activeConversationId || undefined,
            question: q,
            knowledgeBaseId: options?.searchAllKbs ? undefined : selectedKbId || undefined,
            sourceMode: effectiveSourceMode,
            targetWebsite: targetWebsite || undefined,
            allowedSources,
            allowGeneralKnowledge: options?.allowGeneralKnowledge,
            searchAllKbs: options?.searchAllKbs
          }),
          signal: abortControllerRef.current.signal
        });

      if (!response.ok || !response.body) {
        throw new Error(`Streaming failed with status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const evtBlock of events) {
          if (!evtBlock.trim()) continue;

          const lines = evtBlock.split('\n');
          let eventName = 'message';
          let dataStr = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventName = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              dataStr = line.slice(6).trim();
            }
          }

          if (!dataStr) continue;

          try {
            const data = JSON.parse(dataStr);

            if (eventName === 'start') {
              if (data.conversationId && !activeConversationId) {
                setActiveConversationId(data.conversationId);
                fetchConversations();
              }
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempAssistantId
                    ? {
                        ...m,
                        citations: data.citations || [],
                        retrievedChunks: data.retrievedChunks,
                        topSimilarity: data.topSimilarity,
                        retrievalQuery: data.retrievalQuery,
                        contextMessagesCount: data.contextMessagesCount,
                        answerMode: data.answerMode,
                        availableActions: data.availableActions,
                        cacheHit: data.cacheHit
                      }
                    : m
                )
              );
            } else if (eventName === 'delta') {
              accumulatedText += data.text || '';
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempAssistantId
                    ? { ...m, content: accumulatedText }
                    : m
                )
              );
            } else if (eventName === 'done') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempAssistantId
                    ? {
                        ...m,
                        id: data.messageId || m.id,
                        content: data.answer || accumulatedText,
                        citations: data.citations || m.citations,
                        isStreaming: false
                      }
                    : m
                )
              );
              fetchConversations();
            } else if (eventName === 'error') {
              throw new Error(data.message || 'Stream error');
            }
          } catch (parseErr) {
            console.warn('SSE Parse error:', parseErr);
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        console.log('Stream generation stopped by user.');
      } else {
        const errorText = `⚠️ Error: ${err instanceof Error ? err.message : 'Failed to connect to RAG streaming server.'}`;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempAssistantId
              ? { ...m, content: errorText, isStreaming: false }
              : m
          )
        );
      }
    } finally {
      setLoading(false);
      setStreaming(false);
      abortControllerRef.current = null;
    }
  }, [question, loading, streaming, sourceMode, activeConversationId, selectedKbId, targetWebsite, allowedSources, fetchConversations]);

  // Phase 29 Hotfix: Auto-submit initial query 'q' from URL parameter (e.g. from City Explorer)
  useEffect(() => {
    const qParam = searchParams.get('q');
    const sourceModeParam = searchParams.get('sourceMode');

    if (sourceModeParam) {
      const validModes = ['documents_only', 'web_only', 'all_sources', 'web_discovery', 'web_search', 'auto'];
      if (validModes.includes(sourceModeParam)) {
        setSourceMode(sourceModeParam as any);
      }
    }

    if (!qParam || !qParam.trim()) return;

    const normalizedQuery = qParam.trim();
    if (autoSubmittedRef.current === normalizedQuery) return;

    // Set auto-submit ref guard BEFORE triggering submission to prevent double execution (e.g. React Strict Mode)
    autoSubmittedRef.current = normalizedQuery;

    const effectiveMode = (sourceModeParam && ['documents_only', 'web_only', 'all_sources', 'web_discovery', 'web_search', 'auto'].includes(sourceModeParam))
      ? (sourceModeParam as any)
      : sourceMode;

    // Auto-execute submission using the exact same handleSendMessage function
    handleSendMessage(normalizedQuery, { overrideSourceMode: effectiveMode });

    // URL Query Cleanup: Remove 'q' parameter from URL using router.replace without re-triggering submission
    const params = new URLSearchParams(searchParams.toString());
    params.delete('q');
    const cleanUrl = `/chat${params.toString() ? `?${params.toString()}` : ''}`;
    router.replace(cleanUrl);
  }, [searchParams, handleSendMessage, sourceMode, router]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const selectedKbName = selectedKbId
    ? knowledgeBases.find((k) => k.id === selectedKbId)?.name || 'Selected Collection'
    : 'All Documents (Global RAG)';

  const lastMsg = messages[messages.length - 1];
  const activeSourcesCount = lastMsg?.citations?.length || 0;

  const suggestedPrompts = [
    'What are the main requirements outlined?',
    'Explain the key architecture decisions in detail.',
    'Summarize the primary policies and guidelines.',
    'Are there any risk factors or constraints mentioned?'
  ];

  return (
    <div className="w-full max-w-[1600px] mx-auto h-[calc(100vh-7rem)] flex flex-col md:flex-row gap-6">
      {/* Rename Modal */}
      {renameConvId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white">Rename Conversation</h3>
            <input
              type="text"
              value={newTitleInput}
              onChange={(e) => setNewTitleInput(e.target.value)}
              placeholder="Enter new conversation title..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
            <div className="flex justify-end space-x-3 pt-2">
              <button
                onClick={() => setRenameConvId(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameSubmit}
                disabled={!newTitleInput.trim()}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-semibold text-white shadow-lg shadow-indigo-600/20"
              >
                Save Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteConvId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 text-rose-400">
              <span className="text-xl">⚠️</span>
              <h3 className="text-base font-bold text-white">Delete Conversation?</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Are you sure you want to delete this chat history? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3 pt-2">
              <button
                onClick={() => setDeleteConvId(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSubmit}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white shadow-lg shadow-rose-600/20"
              >
                Delete Chat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Toast Notification */}
      {feedbackToast && (
        <div className="fixed top-5 right-5 z-50 bg-emerald-950 border border-emerald-700 text-emerald-300 font-mono text-xs px-4 py-2.5 rounded-xl shadow-2xl animate-fade-in flex items-center space-x-2">
          <span>{feedbackToast}</span>
        </div>
      )}

      {/* Sidebar - Conversations & Knowledge Base Scope */}
      <aside className="w-full md:w-72 bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-xl flex-shrink-0">
        <div className="space-y-4 min-h-0 flex flex-col flex-1">
          {/* Header Badge */}
          <div className="flex items-center justify-between px-2">
            <span className="text-xs font-bold text-white flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Document AI</span>
            </span>
            <span className="text-[10px] font-mono text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded-md border border-indigo-800/60">
              Memory
            </span>
          </div>

          {/* RAG Retrieval Scope Selector */}
          <div className="space-y-1.5 border-b border-slate-800 pb-3">
            <label className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider block px-1">
              RAG Retrieval Scope:
            </label>
            <select
              value={selectedKbId}
              onChange={(e) => setSelectedKbId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="">🌐 All Documents (Global)</option>
              {knowledgeBases.map((kb) => (
                <option key={kb.id} value={kb.id}>
                  📚 {kb.name} ({kb.documentCount} docs)
                </option>
              ))}
            </select>
          </div>

          {/* New Chat Button */}
          <button
            onClick={handleStartNewChat}
            className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center justify-center space-x-2 shadow-lg shadow-indigo-600/20 transition-all flex-shrink-0"
          >
            <span>+</span>
            <span>New Chat</span>
          </button>

          {/* Conversation Search Bar */}
          <div className="px-1 flex-shrink-0">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                fetchConversations(e.target.value);
              }}
              placeholder="Search chat history..."
              className="w-full bg-slate-950 border border-slate-800/90 rounded-xl px-3 py-1.5 text-[11px] text-slate-300 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Conversations List */}
          <div className="space-y-1 flex-1 min-h-0 flex flex-col">
            <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2 pb-1 flex-shrink-0">
              Conversations History
            </h3>
            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {conversations.length === 0 ? (
                <p className="text-xs text-slate-500 px-2 py-3">No conversations found.</p>
              ) : (
                conversations.map((conv) => {
                  const isActive = activeConversationId === conv.id;
                  const kbBadge = conv.knowledgeBaseId
                    ? knowledgeBases.find((k) => k.id === conv.knowledgeBaseId)?.name
                    : null;

                  return (
                    <div
                      key={conv.id}
                      className={`group relative rounded-xl transition-all ${
                        isActive
                          ? 'bg-indigo-950/80 border border-indigo-800 text-indigo-300'
                          : 'hover:bg-slate-800/60 text-slate-300 border border-transparent'
                      }`}
                    >
                      <button
                        onClick={() => loadConversationHistory(conv.id)}
                        className="w-full text-left px-3 py-2.5 text-xs font-medium space-y-1 block"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold truncate max-w-[140px]">💬 {conv.title}</span>
                          {kbBadge && (
                            <span className="text-[9px] font-mono text-indigo-400 bg-indigo-950 px-1.5 py-0.5 rounded border border-indigo-800/50 truncate max-w-[70px]">
                              {kbBadge}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500 block font-mono">
                          {new Date(conv.updatedAt).toLocaleDateString()}
                        </span>
                      </button>

                      {/* Hover Quick Actions */}
                      <div className="absolute right-2 top-2.5 hidden group-hover:flex items-center space-x-1 bg-slate-900/90 px-1 py-0.5 rounded-lg border border-slate-800 shadow-md">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenameConvId(conv.id);
                            setNewTitleInput(conv.title);
                          }}
                          className="text-[10px] text-slate-400 hover:text-indigo-400 px-1"
                          title="Rename"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConvId(conv.id);
                          }}
                          className="text-[10px] text-slate-400 hover:text-rose-400 px-1"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Diagnostics Checkbox */}
        <div className="border-t border-slate-800 pt-3 flex-shrink-0">
          <label className="flex items-center space-x-2 text-xs text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={showDebug}
              onChange={(e) => setShowDebug(e.target.checked)}
              className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-0"
            />
            <span>Show Retrieval Memory Diagnostics</span>
          </label>
        </div>
      </aside>

      {/* Main Chat Interface */}
      <main className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col justify-between shadow-xl overflow-hidden min-w-0">
        {/* Header Bar */}
        <div className="px-6 py-3.5 border-b border-slate-800/80 bg-slate-950/60 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-3 text-xs font-medium text-slate-300 min-w-0">
            <span className="font-bold text-white truncate max-w-[200px]">{activeTitle}</span>
            <span className="text-slate-600">•</span>
            <span className="text-indigo-400 font-mono truncate">{selectedKbName}</span>

            {/* Knowledge Source Selector */}
            <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1">
              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Source:</span>
              <select
                value={sourceMode}
                onChange={(e) => setSourceMode(e.target.value as any)}
                className="bg-transparent text-xs text-indigo-300 font-semibold focus:outline-none cursor-pointer"
              >
                <option value="auto" className="bg-slate-900 text-slate-200">✨ Auto (Smart Fusion)</option>
                <option value="documents_only" className="bg-slate-900 text-slate-200">📄 Uploaded Documents</option>
                <option value="web_only" className="bg-slate-900 text-slate-200">🌐 Web Sources</option>
                <option value="all_sources" className="bg-slate-900 text-slate-200">🔎 Documents + Web</option>
                <option value="web_search" className="bg-slate-900 text-slate-200">🌐 Web Search</option>
                <option value="web_discovery" className="bg-slate-900 text-slate-200">🌍 Web Discovery</option>
              </select>
            </div>

            {/* Context Indicator Pill */}
            {messages.length > 0 && (
              <span className="hidden lg:inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-indigo-950 border border-indigo-800 text-[10px] text-indigo-300 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Memory Active ({activeSourcesCount} sources)</span>
              </span>
            )}
          </div>

          {streaming && (
            <button
              onClick={handleStopGenerating}
              className="px-3 py-1 rounded-lg bg-rose-950/80 border border-rose-800 text-[11px] font-semibold text-rose-300 hover:bg-rose-900 transition-colors flex items-center space-x-1.5"
            >
              <span>⏹ Stop Stream</span>
            </button>
          )}
        </div>

        {/* Phase 24 Web Discovery Config Toolbar */}
        {sourceMode === 'web_discovery' && (
          <div className="px-6 py-2.5 bg-slate-950/90 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs flex-shrink-0">
            <div className="flex items-center space-x-2 min-w-[280px]">
              <span className="text-slate-400 text-[11px] font-medium">Target Website:</span>
              <input
                type="url"
                value={targetWebsite}
                onChange={(e) => setTargetWebsite(e.target.value)}
                placeholder="https://docs.python.org"
                className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-indigo-500 w-64"
              />
            </div>
            <div className="flex items-center space-x-4 text-[11px] text-slate-300">
              <span className="text-slate-400 font-medium">Trusted Sources:</span>
              <label className="inline-flex items-center space-x-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowedSources.includes('wikipedia')}
                  onChange={(e) => {
                    if (e.target.checked) setAllowedSources((prev) => [...prev, 'wikipedia']);
                    else setAllowedSources((prev) => prev.filter((s) => s !== 'wikipedia'));
                  }}
                  className="rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-0"
                />
                <span>Wikipedia</span>
              </label>
              <label className="inline-flex items-center space-x-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowedSources.includes('medium')}
                  onChange={(e) => {
                    if (e.target.checked) setAllowedSources((prev) => [...prev, 'medium']);
                    else setAllowedSources((prev) => prev.filter((s) => s !== 'medium'));
                  }}
                  className="rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-0"
                />
                <span>Medium</span>
              </label>
            </div>
          </div>
        )}

        {saveSuccessMsg && (
          <div className="mx-6 mt-2 p-2.5 bg-emerald-950 border border-emerald-800 rounded-xl text-emerald-300 text-xs font-mono flex items-center justify-between">
            <span>✅ {saveSuccessMsg}</span>
            <button onClick={() => setSaveSuccessMsg(null)}>✕</button>
          </div>
        )}

        {/* Messages Area */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6">
          {fetchingHistory ? (
            <div className="text-center py-12 text-slate-500 font-mono text-xs">Loading conversation history...</div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12 space-y-6 max-w-lg mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-indigo-950/80 border border-indigo-800 text-indigo-400 text-2xl flex items-center justify-center mx-auto shadow-inner">
                ✨
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-white">Ask questions about your knowledge</h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Answers are grounded in retrieved chunks from{' '}
                  <strong className="text-indigo-400 font-mono">{selectedKbName}</strong> with multi-turn conversation memory.
                </p>
              </div>

              {/* Suggested Prompts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-2">
                {suggestedPrompts.map((promptText, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(promptText)}
                    className="p-3 rounded-xl bg-slate-950 border border-slate-800/90 hover:border-indigo-500/80 text-left text-xs font-medium text-slate-300 hover:text-white transition-all shadow-sm group"
                  >
                    <span className="text-indigo-400 group-hover:text-indigo-300 block mb-1">💡 Suggested</span>
                    <span>{promptText}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, msgIdx) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'USER' ? 'items-end' : 'items-start'} space-y-2`}
              >
                <div
                  className={`max-w-3xl rounded-2xl p-4 text-xs leading-relaxed shadow-lg relative group ${
                    msg.role === 'USER'
                      ? 'bg-indigo-600 text-white rounded-br-none'
                      : 'bg-slate-950 text-slate-200 border border-slate-800 rounded-bl-none'
                  }`}
                >
                  {/* Follow-up Context Pill */}
                  {msg.role === 'ASSISTANT' && msgIdx > 1 && msg.contextMessagesCount && msg.contextMessagesCount > 0 ? (
                    <div className="mb-2 inline-flex items-center space-x-1.5 px-2 py-0.5 rounded bg-indigo-950/80 border border-indigo-800/60 text-[10px] text-indigo-300 font-mono">
                      <span>🧠 Using previous conversation context</span>
                    </div>
                  ) : null}

                  {/* Phase 21 Mode Badges */}
                  {msg.role === 'ASSISTANT' && msg.answerMode === 'GENERAL_KNOWLEDGE' && (
                    <div className="mb-2 inline-flex items-center space-x-1.5 px-2 py-0.5 rounded bg-amber-950/80 border border-amber-800/60 text-[10px] text-amber-300 font-mono">
                      <span>🌐 General Knowledge Mode — Not based on uploaded documents</span>
                    </div>
                  )}

                  {msg.role === 'ASSISTANT' && msg.cacheHit && (
                    <div className="mb-2 ml-2 inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-sky-950/80 border border-sky-800/60 text-[10px] text-sky-300 font-mono">
                      <span>⚡ Cached Response</span>
                    </div>
                  )}

                  <div className="whitespace-pre-wrap">
                    {msg.content}
                    {msg.isStreaming && (
                      <span className="inline-block w-2 h-3 ml-1 bg-indigo-400 animate-pulse rounded-sm align-middle" />
                    )}
                  </div>

                  {/* Structured Actions for NO_DOCUMENT_EVIDENCE */}
                  {msg.role === 'ASSISTANT' && msg.answerMode === 'NO_DOCUMENT_EVIDENCE' && !msg.isStreaming && (
                    <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Suggested Next Actions:</span>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => {
                            const lastUserMsg = [...messages].reverse().find((m) => m.role === 'USER');
                            if (lastUserMsg) handleSendMessage(lastUserMsg.content, { allowGeneralKnowledge: true });
                          }}
                          className="px-3 py-1.5 rounded-lg bg-amber-950/60 border border-amber-800/80 hover:bg-amber-900/60 text-amber-300 text-[11px] font-mono transition-all"
                        >
                          🌐 Answer using General Knowledge
                        </button>
                        <button
                          onClick={() => {
                            const lastUserMsg = [...messages].reverse().find((m) => m.role === 'USER');
                            if (lastUserMsg) handleSendMessage(lastUserMsg.content, { searchAllKbs: true });
                          }}
                          className="px-3 py-1.5 rounded-lg bg-indigo-950/60 border border-indigo-800/80 hover:bg-indigo-900/60 text-indigo-300 text-[11px] font-mono transition-all"
                        >
                          📚 Search All Knowledge Bases
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Copy Button */}
                  {msg.role === 'ASSISTANT' && msg.content && !msg.isStreaming && (
                    <button
                      onClick={() => handleCopyText(msg.id, msg.content)}
                      className="absolute top-2 right-2 px-2 py-1 rounded bg-slate-900 border border-slate-800 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-slate-400 hover:text-white"
                      title="Copy response"
                    >
                      {copiedId === msg.id ? '✓ Copied' : '📋 Copy'}
                    </button>
                  )}

                  {/* Citations List & Evidence Explorer */}
                  {msg.role === 'ASSISTANT' && msg.citations && msg.citations.length > 0 && !msg.isStreaming && (
                    <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">
                          Verified Document Sources:
                        </span>
                        {msg.citations[0]?.confidenceLabel && (
                          <span
                            className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${
                              msg.citations[0].confidenceLabel === 'Strong'
                                ? 'bg-emerald-950 text-emerald-400 border-emerald-800/60'
                                : msg.citations[0].confidenceLabel === 'Moderate'
                                ? 'bg-amber-950 text-amber-400 border-amber-800/60'
                                : 'bg-slate-900 text-slate-400 border-slate-800'
                            }`}
                          >
                            Evidence: ● {msg.citations[0].confidenceLabel}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {msg.citations.map((c, idx) => {
                          const isWeb = c.knowledgeSourceType === 'WEB' || Boolean(c.webUrl);
                          return (
                            <div key={idx} className="inline-flex items-center space-x-1">
                              <button
                                onClick={() => setActiveModalCitation(c)}
                                className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-indigo-500 text-[11px] font-mono text-slate-300 transition-all hover:bg-slate-850 shadow-sm group/cit"
                              >
                                <span className="font-bold text-indigo-400 group-hover/cit:text-indigo-300">[{c.index || idx + 1}]</span>
                                <span>{isWeb ? '🌐' : '📄'}</span>
                                <span className="truncate max-w-[140px]">{c.filename}</span>
                                {!isWeb && <span className="text-slate-500">&bull; Page {c.pageNumber}</span>}
                                <span className="text-[10px] text-indigo-400/80 underline ml-1">View Evidence</span>
                              </button>

                              {isWeb && (c.webUrl || c.canonicalUrl) && (
                                <>
                                  <a
                                    href={c.webUrl || c.canonicalUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1 rounded bg-slate-900 border border-slate-800 hover:border-cyan-500 text-cyan-400 text-[10px] transition-colors"
                                    title="Open external web page"
                                  >
                                    ↗
                                  </a>
                                  <button
                                    onClick={() => handleSaveDiscoveredSource(c.webUrl || c.canonicalUrl!)}
                                    disabled={savingSourceUrl === (c.webUrl || c.canonicalUrl!)}
                                    className="px-2 py-1 rounded bg-indigo-950 border border-indigo-800 hover:bg-indigo-900 text-indigo-300 text-[10px] font-mono transition-colors disabled:opacity-50"
                                    title="Save web source to Knowledge Base"
                                  >
                                    💾 Save to KB
                                  </button>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Phase 19 User Feedback & Phase 29 TTS Audio Controls */}
                  {msg.role === 'ASSISTANT' && msg.content && !msg.isStreaming && (
                    <div className="mt-3 pt-2 border-t border-slate-800/60 flex flex-col space-y-2 text-[11px]">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        {/* TTS Audio Controls */}
                        <div className="flex items-center space-x-2">
                          {speakingMsgId === msg.id ? (
                            <>
                              <button
                                onClick={() => handleSpeak(msg.id, msg.content)}
                                aria-label="Pause speech"
                                className="px-2.5 py-1 rounded bg-amber-950 border border-amber-800 text-amber-300 font-mono text-[10px] font-bold flex items-center space-x-1"
                              >
                                <span>⏸</span>
                                <span>Pause</span>
                              </button>
                              <button
                                onClick={handleStopSpeak}
                                aria-label="Stop speech"
                                className="px-2 py-1 rounded bg-rose-950 border border-rose-800 text-rose-300 font-mono text-[10px] font-bold flex items-center space-x-1"
                              >
                                <span>⏹</span>
                                <span>Stop</span>
                              </button>
                            </>
                          ) : pausedMsgId === msg.id ? (
                            <>
                              <button
                                onClick={() => handleSpeak(msg.id, msg.content)}
                                aria-label="Resume speech"
                                className="px-2.5 py-1 rounded bg-indigo-950 border border-indigo-800 text-indigo-300 font-mono text-[10px] font-bold flex items-center space-x-1"
                              >
                                <span>▶</span>
                                <span>Resume</span>
                              </button>
                              <button
                                onClick={handleStopSpeak}
                                aria-label="Stop speech"
                                className="px-2 py-1 rounded bg-rose-950 border border-rose-800 text-rose-300 font-mono text-[10px] font-bold flex items-center space-x-1"
                              >
                                <span>⏹</span>
                                <span>Stop</span>
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => handleSpeak(msg.id, msg.content)}
                              aria-label="Listen to response"
                              className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 hover:border-slate-700 text-indigo-300 hover:text-white font-mono text-[10px] font-bold flex items-center space-x-1.5 transition"
                            >
                              <span>🔊</span>
                              <span>Listen</span>
                            </button>
                          )}

                          {/* Speed Selector */}
                          <select
                            value={ttsSpeed}
                            onChange={(e) => setTtsSpeed(Number(e.target.value))}
                            className="bg-slate-950 border border-slate-800 text-[10px] text-slate-300 rounded px-1.5 py-0.5 focus:outline-none"
                          >
                            <option value="0.75">0.75x</option>
                            <option value="1">1x</option>
                            <option value="1.25">1.25x</option>
                            <option value="1.5">1.5x</option>
                            <option value="2">2x</option>
                          </select>

                          {/* Language Selector */}
                          <select
                            value={ttsLang}
                            onChange={(e) => setTtsLang(e.target.value as TTSLanguage)}
                            className="bg-slate-950 border border-slate-800 text-[10px] text-slate-300 rounded px-1.5 py-0.5 focus:outline-none"
                          >
                            <option value="en-US">English</option>
                            <option value="hi-IN">हिन्दी</option>
                            <option value="gu-IN">ગુજરાતી</option>
                          </select>
                        </div>

                        {/* Copy & Feedback */}
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(msg.content);
                            }}
                            aria-label="Copy text"
                            className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-white text-[10px] font-mono"
                          >
                            📋 Copy
                          </button>

                          <button
                            onClick={() => handleFeedbackSubmit(msg.id, 'POSITIVE')}
                            className={`px-2 py-0.5 rounded border transition-colors text-[10px] font-mono ${
                              userFeedbackState[msg.id]?.rating === 'POSITIVE'
                                ? 'bg-emerald-950 border-emerald-700 text-emerald-300 font-bold'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            👍
                          </button>
                          <button
                            onClick={() => handleFeedbackSubmit(msg.id, 'NEGATIVE', 'INCORRECT_ANSWER')}
                            className={`px-2 py-0.5 rounded border transition-colors text-[10px] font-mono ${
                              userFeedbackState[msg.id]?.rating === 'NEGATIVE'
                                ? 'bg-rose-950 border-rose-700 text-rose-300 font-bold'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            👎
                          </button>
                        </div>
                      </div>
                      {userFeedbackState[msg.id] && (
                        <span className="text-[10px] text-emerald-400 font-mono">✓ Feedback saved</span>
                      )}
                    </div>
                  )}

                  {/* Diagnostics Info */}
                  {showDebug && msg.role === 'ASSISTANT' && (
                    <div className="mt-3 pt-2 border-t border-slate-900 text-[10px] font-mono text-slate-400 space-y-1">
                      <div className="flex space-x-3">
                        <span>Chunks: {msg.retrievedChunks ?? 0}</span>
                        <span>Top Sim: {msg.topSimilarity ? (msg.topSimilarity * 100).toFixed(1) : '0'}%</span>
                        {msg.contextMessagesCount !== undefined && (
                          <span>Memory Turns: {msg.contextMessagesCount}</span>
                        )}
                      </div>
                      {msg.retrievalQuery && (
                        <div className="text-indigo-400 truncate">
                          Query Rewrite: &quot;{msg.retrievalQuery}&quot;
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex flex-col space-y-2 flex-shrink-0">
          {/* Attachment Preview Badge */}
          {attachment && (
            <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-indigo-950/80 border border-indigo-800 text-xs text-indigo-300">
              <div className="flex items-center space-x-2 truncate">
                <span>📎</span>
                <span className="font-medium truncate">{attachment.filename}</span>
                <span className="text-[10px] text-indigo-400">({Math.round(attachment.fileSize / 1024)} KB)</span>
              </div>
              <button
                onClick={() => setAttachment(null)}
                className="text-indigo-400 hover:text-white text-xs px-1"
              >
                ✕
              </button>
            </div>
          )}

          <div className="flex items-center space-x-3">
            <label className="cursor-pointer px-3 py-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs font-medium transition flex items-center space-x-1.5 flex-shrink-0">
              <span>📎</span>
              <span className="hidden sm:inline">Attach</span>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md"
                className="hidden"
                disabled={loading || streaming || uploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  try {
                    const fd = new FormData();
                    fd.append('file', file);
                    if (activeConversationId) fd.append('conversationId', activeConversationId);

                    const res = await fetch('/api/chat/upload', {
                      method: 'POST',
                      body: fd
                    });
                    const data = await res.json();
                    if (!res.ok || !data.success) {
                      throw new Error(data.error?.message || 'Upload failed');
                    }
                    setAttachment(data.data.attachment);
                  } catch (err) {
                    alert(err instanceof Error ? err.message : 'Upload failed');
                  } finally {
                    setUploading(false);
                  }
                }}
              />
            </label>

            {/* Phase 32 Voice Input Microphone Button */}
            <div className="flex items-center space-x-1 flex-shrink-0">
              <button
                type="button"
                onClick={handleToggleVoice}
                disabled={loading || streaming || uploading}
                aria-label={voiceState === 'LISTENING' ? 'Stop voice input' : 'Start voice input'}
                aria-pressed={voiceState === 'LISTENING'}
                className={`p-3 rounded-xl border text-xs font-semibold flex items-center space-x-1.5 transition flex-shrink-0 ${
                  voiceState === 'LISTENING'
                    ? 'bg-rose-950/90 border-rose-700 text-rose-300 animate-pulse shadow-lg shadow-rose-900/30'
                    : voiceState === 'STARTING'
                    ? 'bg-amber-950/90 border-amber-700 text-amber-300 animate-pulse'
                    : voiceState === 'ERROR'
                    ? 'bg-rose-950/40 border-rose-800 text-rose-400'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-indigo-500/50 hover:text-white'
                }`}
                title={voiceState === 'LISTENING' ? 'Stop Listening' : 'Start Voice Input'}
              >
                <span className="text-sm">
                  {voiceState === 'LISTENING' ? '🔴' : voiceState === 'STARTING' ? '⏳' : '🎤'}
                </span>
                <span className="hidden sm:inline">
                  {voiceState === 'LISTENING'
                    ? 'Listening...'
                    : voiceState === 'STARTING'
                    ? 'Starting...'
                    : 'Voice'}
                </span>
              </button>

              <select
                value={voiceLanguage}
                onChange={(e) => {
                  setVoiceLanguage(e.target.value);
                  speechToTextService.setLanguage(e.target.value);
                }}
                aria-label="Select voice input language"
                disabled={loading || streaming || voiceState === 'LISTENING'}
                className="hidden lg:block bg-slate-900 border border-slate-800 rounded-xl px-2 py-2.5 text-[11px] text-slate-300 focus:outline-none focus:border-indigo-500"
              >
                {SUPPORTED_VOICE_LANGUAGES.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 flex flex-col min-w-0">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  voiceState === 'LISTENING'
                    ? 'Speak now... (listening)'
                    : streaming
                    ? 'Generating response...'
                    : uploading
                    ? 'Uploading attachment...'
                    : `Ask a question in scope of ${selectedKbName}...`
                }
                disabled={loading || streaming || uploading}
                rows={1}
                className="w-full rounded-xl bg-slate-900 border border-slate-800 px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none disabled:opacity-50"
              />
              {interimTranscript && (
                <div className="px-2 pt-1 text-[11px] font-mono text-indigo-400 animate-pulse italic">
                  Hearing: &quot;{interimTranscript}&quot;
                </div>
              )}
              {voiceErrorMsg && (
                <div className="px-2 pt-1 text-[11px] font-mono text-rose-400">
                  ⚠️ {voiceErrorMsg}
                </div>
              )}
            </div>

            {/* Accessibility Live Region */}
            <div aria-live="polite" className="sr-only">
              {voiceState === 'LISTENING' && `Listening in ${voiceLanguage}...`}
              {interimTranscript && `Interim transcript: ${interimTranscript}`}
              {voiceErrorMsg && `Voice error: ${voiceErrorMsg}`}
            </div>

            {streaming ? (
              <button
                onClick={handleStopGenerating}
                className="px-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs shadow-lg shadow-rose-600/20 transition-all flex-shrink-0"
              >
                Stop ⏹
              </button>
            ) : (
              <button
                onClick={() => handleSendMessage()}
                disabled={loading || uploading || (!question.trim() && !attachment)}
                className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs shadow-lg shadow-indigo-600/20 transition-all flex-shrink-0"
              >
                {loading ? 'Sending...' : 'Send ✨'}
              </button>
            )}
          </div>
        </div>
      </main>

      {/* Phase 22 Evidence Explorer Popover Modal */}
      <EvidenceModal
        citation={activeModalCitation}
        isOpen={!!activeModalCitation}
        onClose={() => setActiveModalCitation(null)}
      />
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 text-indigo-400 font-mono text-xs flex items-center justify-center">Loading Chat Workspace...</div>}>
      <ChatPageContent />
    </Suspense>
  );
}
