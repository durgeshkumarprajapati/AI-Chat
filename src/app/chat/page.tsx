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
  const [fetchingHistory, setFetchingHistory] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
  }, [messages, loading]);

  const handleStartNewChat = () => {
    setActiveConversationId(null);
    setMessages([]);
    setQuestion('');
  };

  const handleSendMessage = async () => {
    const q = question.trim();
    if (!q || loading) return;

    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'USER',
      content: q
    };

    setMessages((prev) => [...prev, tempUserMsg]);
    setQuestion('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: activeConversationId || undefined,
          question: q
        })
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to generate answer.');
      }

      const data = json.data;
      if (!activeConversationId) {
        setActiveConversationId(data.conversationId);
        fetchConversations();
      }

      const assistantMsg: ChatMessage = {
        id: data.messageId,
        role: 'ASSISTANT',
        content: data.answer,
        citations: data.citations,
        retrievedChunks: data.retrievedChunks,
        topSimilarity: data.topSimilarity
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'ASSISTANT',
        content: `⚠️ Error: ${err instanceof Error ? err.message : 'Failed to connect to RAG server.'}`
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="max-w-7xl mx-auto h-[calc(100vh-7rem)] flex flex-col md:flex-row gap-6">
      {/* Sidebar - Conversations History */}
      <aside className="w-full md:w-64 bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-xl flex-shrink-0">
        <div className="space-y-4">
          <button
            onClick={handleStartNewChat}
            className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center justify-center space-x-2 shadow-lg shadow-indigo-600/20 transition-all"
          >
            <span>+</span>
            <span>New Conversation</span>
          </button>

          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 pb-1">
              Chat History
            </h3>
            <div className="max-h-[50vh] md:max-h-[60vh] overflow-y-auto space-y-1 pr-1">
              {conversations.length === 0 ? (
                <p className="text-xs text-slate-500 px-2 py-3">No conversations yet.</p>
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
        {/* Chat Messages Area */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6">
          {fetchingHistory ? (
            <div className="text-center py-12 text-slate-500 font-mono text-xs">Loading conversation history...</div>
          ) : messages.length === 0 ? (
            <div className="text-center py-16 space-y-4 max-w-md mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-indigo-950/80 border border-indigo-800 text-indigo-400 text-2xl flex items-center justify-center mx-auto shadow-inner">
                💬
              </div>
              <h2 className="text-xl font-bold text-white">Grounded Document AI Assistant</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Ask questions about your uploaded PDFs. Answers are grounded ONLY in retrieved document chunks with page citations.
              </p>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-400 text-left space-y-1">
                <span className="text-indigo-400 font-semibold">Try asking:</span>
                <p>&bull; &quot;What are the main requirements mentioned in the document?&quot;</p>
                <p>&bull; &quot;What is the process outline described on page 1?&quot;</p>
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'USER' ? 'items-end' : 'items-start'} space-y-2`}
              >
                <div
                  className={`max-w-3xl rounded-2xl p-4 text-xs leading-relaxed shadow-lg ${
                    msg.role === 'USER'
                      ? 'bg-indigo-600 text-white rounded-br-none'
                      : 'bg-slate-950 text-slate-200 border border-slate-800 rounded-bl-none'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>

                  {/* Citations List */}
                  {msg.role === 'ASSISTANT' && msg.citations && msg.citations.length > 0 && (
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

          {loading && (
            <div className="flex items-center space-x-3 text-xs text-indigo-400 font-mono p-4 rounded-2xl bg-slate-950 border border-slate-800 max-w-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-ping" />
              <span>Retrieving pgvector context & generating answer...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Question Input Area */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center space-x-3">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your uploaded documents (Press Enter to send, Shift+Enter for newline)..."
            disabled={loading}
            rows={1}
            className="flex-1 rounded-xl bg-slate-900 border border-slate-800 px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none disabled:opacity-50"
          />
          <button
            onClick={handleSendMessage}
            disabled={loading || !question.trim()}
            className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold text-xs shadow-lg shadow-indigo-600/20 transition-all flex-shrink-0"
          >
            Send Question →
          </button>
        </div>
      </main>
    </div>
  );
}
