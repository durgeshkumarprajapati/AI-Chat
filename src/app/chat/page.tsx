'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';

type Citation = {
  documentId: string;
  chunkId: string;
  filename: string;
  pageNumber: number;
  similarity: number;
};

type ChatMessage = {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  citations?: Citation[];
  retrievedChunks?: number;
  topSimilarity?: number;
  isStreaming?: boolean;
  createdAt?: string;
};

type ConversationSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export default function ChatPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [fetchingHistory, setFetchingHistory] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchConversations = async () => {
    try {
      const res = await fetch('/api/conversations');
      const json = await res.json();
      if (json.success) {
        setConversations(json.data);
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  };

  const loadConversationHistory = useCallback(async (convId: string) => {
    setFetchingHistory(true);
    try {
      const res = await fetch(`/api/conversations/${convId}`);
      const json = await res.json();
      if (json.success) {
        setMessages(json.data.messages);
        setActiveConversationId(convId);
      }
    } catch (err) {
      console.error('Failed to load conversation messages:', err);
    } finally {
      setFetchingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, streaming]);

  const handleStartNewChat = () => {
    if (streaming && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setActiveConversationId(null);
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

  const handleSendMessage = async (promptOverride?: string) => {
    const q = (promptOverride || question).trim();
    if (!q || loading || streaming) return;

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
          question: q
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
                        topSimilarity: data.topSimilarity
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
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const suggestedPrompts = [
    'What is this document about?',
    'Summarize the key requirements.',
    'List the major technical components mentioned.',
    'What are the deployment steps described?'
  ];

  return (
    <div className="max-w-7xl mx-auto h-[calc(100vh-7rem)] flex flex-col md:flex-row gap-6">
      {/* Sidebar - Conversations History */}
      <aside className="w-full md:w-64 bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-xl flex-shrink-0">
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <span className="text-xs font-bold text-white flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Document AI</span>
            </span>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-800/60">
              RAG Ready
            </span>
          </div>

          <button
            onClick={handleStartNewChat}
            className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center justify-center space-x-2 shadow-lg shadow-indigo-600/20 transition-all"
          >
            <span>+</span>
            <span>New Chat</span>
          </button>

          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 pb-1">
              Conversations
            </h3>
            <div className="max-h-[45vh] md:max-h-[55vh] overflow-y-auto space-y-1 pr-1">
              {conversations.length === 0 ? (
                <p className="text-xs text-slate-500 px-2 py-3">No chat history.</p>
              ) : (
                conversations.map((conv) => {
                  const isActive = activeConversationId === conv.id;
                  return (
                    <button
                      key={conv.id}
                      onClick={() => loadConversationHistory(conv.id)}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium truncate transition-colors ${
                        isActive
                          ? 'bg-indigo-950 text-indigo-300 border border-indigo-800/80 font-semibold'
                          : 'text-slate-300 hover:bg-slate-800/60'
                      }`}
                    >
                      💬 {conv.title}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Debug Toggle */}
        <div className="border-t border-slate-800 pt-3">
          <label className="flex items-center space-x-2 text-xs text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={showDebug}
              onChange={(e) => setShowDebug(e.target.checked)}
              className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-0"
            />
            <span>Show Retrieval Debug Info</span>
          </label>
        </div>
      </aside>

      {/* Main Chat Interface */}
      <main className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col justify-between shadow-xl overflow-hidden min-w-0">
        {/* Header Bar */}
        <div className="px-6 py-3 border-b border-slate-800/80 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs font-medium text-slate-300">
            <span>💬 Grounded Document Assistant</span>
          </div>
          {streaming && (
            <button
              onClick={handleStopGenerating}
              className="px-3 py-1 rounded-lg bg-rose-950 border border-rose-800/80 text-rose-300 hover:bg-rose-900 text-xs font-medium flex items-center space-x-1.5 transition-colors"
            >
              <span className="w-2 h-2 rounded-sm bg-rose-400 animate-pulse" />
              <span>Stop Generating</span>
            </button>
          )}
        </div>

        {/* Chat Messages Area */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6">
          {fetchingHistory ? (
            <div className="text-center py-12 text-slate-500 font-mono text-xs">Loading conversation history...</div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12 space-y-6 max-w-lg mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-indigo-950/80 border border-indigo-800 text-indigo-400 text-2xl flex items-center justify-center mx-auto shadow-inner">
                ✨
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-white">Ask anything about your documents</h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Answers are dynamically generated using pgvector retrieval and grounded strictly in your uploaded PDF content.
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
            messages.map((msg) => (
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
                  <div className="whitespace-pre-wrap">
                    {msg.content}
                    {msg.isStreaming && (
                      <span className="inline-block w-2 h-3 ml-1 bg-indigo-400 animate-pulse rounded-sm align-middle" />
                    )}
                  </div>

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

                  {/* Citations List */}
                  {msg.role === 'ASSISTANT' && msg.citations && msg.citations.length > 0 && !msg.isStreaming && (
                    <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-2">
                      <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">
                        Sources & Citations:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {msg.citations.map((c, idx) => (
                          <Link
                            key={idx}
                            href={`/documents/${c.documentId}`}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-indigo-500 text-[11px] font-mono text-slate-300 transition-colors"
                          >
                            <span>📄 {c.filename}</span>
                            <span className="text-slate-500">• Page {c.pageNumber}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Debug Panel (Dev mode) */}
                  {showDebug && msg.role === 'ASSISTANT' && (msg.retrievedChunks !== undefined || msg.topSimilarity !== undefined) && (
                    <div className="mt-3 pt-2 border-t border-slate-900 text-[10px] font-mono text-slate-400 flex space-x-3">
                      <span>Chunks: {msg.retrievedChunks ?? 0}</span>
                      <span>Top Similarity: {msg.topSimilarity ? (msg.topSimilarity * 100).toFixed(1) : '0'}%</span>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Question Input Area */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center space-x-3">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={streaming ? "Generating response..." : "Ask a question about your uploaded documents (Enter to send, Shift+Enter for newline)..."}
            disabled={loading || streaming}
            rows={1}
            className="flex-1 rounded-xl bg-slate-900 border border-slate-800 px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none disabled:opacity-50"
          />
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
              disabled={loading || !question.trim()}
              className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold text-xs shadow-lg shadow-indigo-600/20 transition-all flex-shrink-0"
            >
              Send →
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
