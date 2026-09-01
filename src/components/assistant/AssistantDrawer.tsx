'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { SURFACE, FOCUS_RING, BUTTON_VARIANTS, BUTTON_SIZES } from '@/lib/design-system/theme.constants';
import { useAssistantContext, toContextHint, type AssistantPageContext } from '@/context/AssistantContext';
import { streamAssistantChat } from './streamAssistantChat';
import { AssistantApprovalCard } from './AssistantApprovalCard';
import {
  ASSISTANT_MAX_MESSAGE_LENGTH,
  type AssistantChatRequest,
  type AssistantConversationSummaryDTO,
  type AssistantEvidenceItem,
  type AssistantMessageDTO,
  type AssistantMessageRole,
  type AssistantScope,
  type AssistantStreamStage
} from './assistant.types';

export interface AssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onStreamingChange?: (_isStreaming: boolean) => void;
}

interface LocalMessage {
  id: string;
  role: AssistantMessageRole;
  content: string;
  createdAt: string;
  pending?: boolean;
  stage?: AssistantStreamStage;
  evidence?: AssistantEvidenceItem[];
  approval?: { agentRunId: string; stepIndex: number; description: string };
  errored?: boolean;
  errorMessage?: string;
  retryRequest?: AssistantChatRequest;
}

const STAGE_LABELS: Record<AssistantStreamStage, string> = {
  understanding: 'Understanding your question...',
  searching: 'Searching relevant information...',
  analyzing: 'Analyzing results...',
  generating: 'Generating response...'
};

const SUGGESTED_PROMPTS = [
  'What should I focus on today?',
  'Summarize my overdue tasks',
  "What's related to payment integration?",
  'What changed in my workspace recently?'
];

const CHIP_DEFS: Array<{ key: keyof AssistantPageContext; labelKey: keyof AssistantPageContext; icon: string; prefix: string }> = [
  { key: 'projectId', labelKey: 'projectLabel', icon: '📁', prefix: 'Project' },
  { key: 'documentId', labelKey: 'documentLabel', icon: '📄', prefix: 'Document' },
  { key: 'knowledgeBaseId', labelKey: 'knowledgeBaseLabel', icon: '📚', prefix: 'Knowledge Base' },
  { key: 'meetingId', labelKey: 'meetingLabel', icon: '🗓️', prefix: 'Meeting' },
  { key: 'knowledgeEntityId', labelKey: 'knowledgeEntityLabel', icon: '🕸️', prefix: 'Entity' },
  { key: 'automationId', labelKey: 'automationLabel', icon: '⚙️', prefix: 'Automation' }
];

let localIdCounter = 0;
function nextLocalId(prefix: string): string {
  localIdCounter += 1;
  return `${prefix}-${Date.now()}-${localIdCounter}`;
}

/**
 * Gap-fill decision: the contract's `scope?: AssistantScope` isn't paired with a specified
 * derivation rule. Since the registered context already tells us the most specific thing the
 * user is looking at, we infer the narrowest matching scope (falling back to GLOBAL) rather than
 * asking the user to pick one every turn — WORKSPACE isn't inferable from any single hint field
 * the spec defines, so it's never auto-selected here.
 */
function deriveScope(context: AssistantPageContext): AssistantScope {
  if (context.projectId) return 'PROJECT';
  if (context.documentId) return 'DOCUMENT';
  if (context.knowledgeBaseId) return 'KNOWLEDGE_BASE';
  return 'GLOBAL';
}

export function AssistantDrawer({ isOpen, onClose, onStreamingChange }: AssistantDrawerProps) {
  const { context, clearContextKey } = useAssistantContext();

  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyList, setHistoryList] = useState<AssistantConversationSummaryDTO[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const historyContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onStreamingChange?.(isStreaming);
  }, [isStreaming, onStreamingChange]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Close on Escape, and stop any in-flight stream if the widget is torn down entirely.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    return () => abortControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!isHistoryOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (historyContainerRef.current && !historyContainerRef.current.contains(e.target as Node)) {
        setIsHistoryOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isHistoryOpen]);

  const runAssistantRequest = useCallback(async (request: AssistantChatRequest, initialMessageId: string) => {
    let assistantMessageId = initialMessageId;
    setIsStreaming(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setMessages((prev) =>
      prev.map((m) => (m.id === assistantMessageId ? { ...m, pending: true, errored: false, errorMessage: undefined, content: '', evidence: undefined, approval: undefined } : m))
    );

    try {
      await streamAssistantChat(
        request,
        (evt) => {
          switch (evt.event) {
            case 'start': {
              const newId = evt.data.messageId;
              setConversationId(evt.data.conversationId);
              setMessages((prev) => prev.map((m) => (m.id === assistantMessageId ? { ...m, id: newId } : m)));
              assistantMessageId = newId;
              break;
            }
            case 'stage': {
              const stage = evt.data.stage;
              setMessages((prev) => prev.map((m) => (m.id === assistantMessageId ? { ...m, stage } : m)));
              break;
            }
            case 'delta': {
              const text = evt.data.text;
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMessageId ? { ...m, content: m.content + text, stage: undefined } : m))
              );
              break;
            }
            case 'evidence': {
              const items = evt.data.items;
              setMessages((prev) => prev.map((m) => (m.id === assistantMessageId ? { ...m, evidence: items } : m)));
              break;
            }
            case 'approval_required': {
              const approval = evt.data;
              setMessages((prev) => prev.map((m) => (m.id === assistantMessageId ? { ...m, approval, pending: false } : m)));
              break;
            }
            case 'done': {
              setMessages((prev) => prev.map((m) => (m.id === assistantMessageId ? { ...m, pending: false } : m)));
              break;
            }
            case 'error': {
              const message = evt.data.message;
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMessageId ? { ...m, pending: false, errored: true, errorMessage: message, retryRequest: request } : m))
              );
              break;
            }
          }
        },
        controller.signal
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setMessages((prev) => prev.map((m) => (m.id === assistantMessageId ? { ...m, pending: false } : m)));
      } else {
        const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMessageId ? { ...m, pending: false, errored: true, errorMessage: message, retryRequest: request } : m))
        );
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, []);

  const handleSend = useCallback(
    (overrideText?: string) => {
      const text = (overrideText ?? inputValue).trim();
      if (!text || isStreaming || text.length > ASSISTANT_MAX_MESSAGE_LENGTH) return;

      const userMessage: LocalMessage = {
        id: nextLocalId('local-user'),
        role: 'USER',
        content: text,
        createdAt: new Date().toISOString()
      };
      const assistantMessageId = nextLocalId('local-assistant');
      const placeholder: LocalMessage = {
        id: assistantMessageId,
        role: 'ASSISTANT',
        content: '',
        createdAt: new Date().toISOString(),
        pending: true
      };

      setMessages((prev) => [...prev, userMessage, placeholder]);
      setInputValue('');

      const request: AssistantChatRequest = {
        conversationId,
        message: text,
        contextHint: toContextHint(context),
        scope: deriveScope(context)
      };

      void runAssistantRequest(request, assistantMessageId);
    },
    [inputValue, isStreaming, conversationId, context, runAssistantRequest]
  );

  const handleRetry = useCallback(
    (message: LocalMessage) => {
      if (!message.retryRequest || isStreaming) return;
      void runAssistantRequest(message.retryRequest, message.id);
    },
    [isStreaming, runAssistantRequest]
  );

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const handleNewConversation = useCallback(() => {
    abortControllerRef.current?.abort();
    setConversationId(undefined);
    setMessages([]);
    setIsHistoryOpen(false);
  }, []);

  const loadConversations = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/assistant/conversations');
      const data = await res.json();
      if (data?.success && Array.isArray(data.data)) {
        setHistoryList(data.data);
      }
    } catch {
      // Non-fatal — the dropdown just shows whatever it last had (or stays empty).
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const handleToggleHistory = useCallback(() => {
    if (!isHistoryOpen) void loadConversations();
    setIsHistoryOpen((prev) => !prev);
  }, [isHistoryOpen, loadConversations]);

  const handleSelectConversation = useCallback(async (id: string) => {
    setIsHistoryOpen(false);
    setIsLoadingMessages(true);
    try {
      const res = await fetch(`/api/assistant/conversations/${id}/messages`);
      const data = await res.json();
      const loadedMessages: AssistantMessageDTO[] | undefined = data?.data?.messages;
      if (data?.success && Array.isArray(loadedMessages)) {
        setMessages(
          loadedMessages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt
          }))
        );
        setConversationId(id);
      }
    } catch {
      // Leave the current transcript in place if this fails.
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  const handleDeleteConversation = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await fetch(`/api/assistant/conversations/${id}`, { method: 'DELETE' });
        setHistoryList((prev) => prev.filter((c) => c.id !== id));
        if (conversationId === id) {
          setConversationId(undefined);
          setMessages([]);
        }
      } catch {
        // Non-fatal — leave the item in the list if deletion failed.
      }
    },
    [conversationId]
  );

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const overLimit = inputValue.length > ASSISTANT_MAX_MESSAGE_LENGTH;
  const showCounter = inputValue.length > ASSISTANT_MAX_MESSAGE_LENGTH - 500;

  return (
    <>
      {isOpen && (
        <div
          className={`fixed inset-0 z-40 ${SURFACE.modalOverlay}`}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <div
        role="dialog"
        aria-modal="true"
        aria-hidden={!isOpen}
        aria-label="AI Assistant"
        className={`fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] lg:w-[480px] bg-card border-l border-card-border shadow-2xl flex flex-col transition-transform duration-200 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
        }`}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-foreground flex items-center gap-2">
              <span aria-hidden="true">✨</span> AI Assistant
            </h2>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleNewConversation}
                className={`${BUTTON_VARIANTS.ghost} ${BUTTON_SIZES.sm}`}
                title="New conversation"
              >
                🆕 New
              </button>

              <div className="relative" ref={historyContainerRef}>
                <button
                  type="button"
                  onClick={handleToggleHistory}
                  className={`${BUTTON_VARIANTS.ghost} ${BUTTON_SIZES.sm}`}
                  aria-label="Conversation history"
                  aria-expanded={isHistoryOpen}
                >
                  🕘
                </button>

                {isHistoryOpen && (
                  <div className="absolute right-0 mt-2 w-72 max-h-80 overflow-y-auto rounded-xl bg-card border border-card-border shadow-2xl z-10">
                    {historyLoading ? (
                      <p className="p-4 text-xs text-muted-foreground text-center">Loading conversations...</p>
                    ) : historyList.length === 0 ? (
                      <p className="p-4 text-xs text-muted-foreground text-center">No previous conversations yet</p>
                    ) : (
                      historyList.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleSelectConversation(c.id)}
                          className="w-full text-left px-3 py-2.5 hover:bg-accent border-b border-border last:border-b-0 flex items-center justify-between gap-2 group"
                        >
                          <span className="min-w-0">
                            <span className="block text-xs font-semibold text-foreground truncate">{c.title || 'Untitled conversation'}</span>
                            <span className="block text-[10px] text-muted-foreground">
                              {c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleString() : new Date(c.createdAt).toLocaleString()}
                            </span>
                          </span>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => handleDeleteConversation(c.id, e)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') handleDeleteConversation(c.id, e as unknown as React.MouseEvent);
                            }}
                            aria-label={`Delete conversation ${c.title}`}
                            className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive text-[11px] px-1"
                          >
                            ✕
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close AI Assistant"
                className={`${BUTTON_VARIANTS.ghost} ${BUTTON_SIZES.sm}`}
              >
                ✕
              </button>
            </div>
          </div>

          {CHIP_DEFS.some(({ key }) => Boolean(context[key])) && (
            <div className="flex flex-wrap gap-1.5">
              {CHIP_DEFS.map(({ key, labelKey, icon, prefix }) => {
                const idValue = context[key];
                if (!idValue) return null;
                const label = (context[labelKey] as string | undefined) || String(idValue);
                return (
                  <span
                    key={key}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted border border-border text-[11px] font-semibold text-foreground max-w-full"
                  >
                    <span aria-hidden="true">{icon}</span>
                    <span className="truncate max-w-[160px]">
                      {prefix}: {label}
                    </span>
                    <button
                      type="button"
                      onClick={() => clearContextKey(key)}
                      aria-label={`Clear ${prefix} context`}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      ✕
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Chat area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoadingMessages ? (
            <p className="text-xs text-muted-foreground text-center py-8">Loading conversation...</p>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4 px-4">
              <p className="text-sm font-semibold text-foreground">Ask me anything about your workspace</p>
              <div className="flex flex-col gap-2 w-full max-w-xs">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => handleSend(prompt)}
                    className={`${BUTTON_VARIANTS.outline} ${BUTTON_SIZES.sm} justify-start text-left`}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => {
              const isUser = message.role === 'USER';
              return (
                <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                      isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                    }`}
                  >
                    {message.pending && !message.content && message.stage && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" aria-hidden="true" />
                        {STAGE_LABELS[message.stage]}
                      </div>
                    )}

                    {message.pending && !message.content && !message.stage && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" aria-hidden="true" />
                        Thinking...
                      </div>
                    )}

                    {message.content && <p className="whitespace-pre-wrap break-words">{message.content}</p>}

                    {message.evidence && message.evidence.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {message.evidence.map((ev, idx) => (
                          <span
                            key={`${ev.sourceType}-${ev.sourceId}-${idx}`}
                            title={ev.snippet ?? undefined}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-info/10 text-info border border-info/30 text-[10px] font-mono font-bold"
                          >
                            📎 {ev.title || ev.sourceType}
                          </span>
                        ))}
                      </div>
                    )}

                    {message.approval && (
                      <AssistantApprovalCard
                        agentRunId={message.approval.agentRunId}
                        stepIndex={message.approval.stepIndex}
                        description={message.approval.description}
                      />
                    )}

                    {message.errored && (
                      <div className="mt-2 space-y-1.5">
                        <p className="text-xs font-semibold text-destructive">
                          {message.errorMessage || 'Something went wrong.'}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleRetry(message)}
                          className={`${BUTTON_VARIANTS.outline} ${BUTTON_SIZES.sm}`}
                        >
                          ↻ Retry
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Composer */}
        <div className="shrink-0 border-t border-border p-3 space-y-2">
          <div className={`flex items-end gap-2 rounded-xl ${SURFACE.input} p-2`}>
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleComposerKeyDown}
              disabled={isStreaming}
              placeholder="Ask the AI Assistant..."
              rows={2}
              className={`flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-text-disabled focus:outline-none disabled:opacity-60`}
            />
            {isStreaming ? (
              <button type="button" onClick={handleStop} className={`${BUTTON_VARIANTS.destructive} ${BUTTON_SIZES.sm} shrink-0`}>
                ⏹ Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!inputValue.trim() || overLimit}
                className={`${BUTTON_VARIANTS.primary} ${BUTTON_SIZES.sm} shrink-0 ${FOCUS_RING}`}
              >
                ➤ Send
              </button>
            )}
          </div>
          {showCounter && (
            <p className={`text-[10px] text-right ${overLimit ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>
              {inputValue.length}/{ASSISTANT_MAX_MESSAGE_LENGTH}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
