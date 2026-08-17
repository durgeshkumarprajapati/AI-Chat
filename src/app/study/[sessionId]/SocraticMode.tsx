'use client';

import { useState, useEffect } from 'react';
import { speechToTextService, VoiceState } from '@/features/voice';

interface SocraticMessage {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  level?: string;
}

export function SocraticMode({ sessionId, topicId }: { sessionId: string; topicId?: string }) {
  const [messages, setMessages] = useState<SocraticMessage[]>([]);
  const [userReasoning, setUserReasoning] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>('IDLE');

  useEffect(() => {
    // Initial welcome message
    setMessages([
      {
        id: 'msg-init',
        role: 'ASSISTANT',
        level: 'CLARIFICATION',
        content: 'Welcome to Socratic Dialogue mode. I will guide your reasoning step-by-step without revealing the answer immediately. What is your initial understanding of this topic?'
      }
    ]);

    const unsubVoiceState = speechToTextService.onStateChange((st) => setVoiceState(st));
    const unsubVoiceTranscript = speechToTextService.onTranscript((text, isFinal) => {
      if (isFinal) {
        setUserReasoning((prev) => (prev ? `${prev} ${text}`.trim() : text));
      }
    });

    return () => {
      unsubVoiceState();
      unsubVoiceTranscript();
    };
  }, []);

  const handleToggleVoice = () => {
    if (voiceState === 'LISTENING' || voiceState === 'STARTING') {
      speechToTextService.stopListening();
    } else {
      speechToTextService.startListening();
    }
  };

  const handleSendReasoning = async () => {
    if (!userReasoning.trim() || !topicId) return;

    const userMsg: SocraticMessage = {
      id: `user-${Date.now()}`,
      role: 'USER',
      content: userReasoning
    };

    setMessages((prev) => [...prev, userMsg]);
    const responseText = userReasoning;
    setUserReasoning('');
    setSubmitting(true);

    try {
      const res = await fetch(`/api/study/sessions/${sessionId}/socratic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId,
          response: responseText
        })
      });

      const data = await res.json();
      if (data.success) {
        const assistantMsg: SocraticMessage = {
          id: data.data.messageId || `asst-${Date.now()}`,
          role: 'ASSISTANT',
          level: data.data.level,
          content: data.data.content
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }
    } catch (err) {
      console.error('Failed to submit Socratic step', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
      <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
        <span className="text-xl">🤔</span>
        <h2 className="text-base font-bold text-slate-900 dark:text-white">Socratic Guided Reasoning</h2>
      </div>

      {/* Messages Feed */}
      <div className="space-y-3 max-h-[350px] overflow-y-auto p-2 scrollbar-none">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`p-3.5 rounded-2xl text-xs space-y-1 max-w-[85%] ${
              m.role === 'USER'
                ? 'ml-auto bg-indigo-600 text-white rounded-br-none'
                : 'mr-auto bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-bl-none'
            }`}
          >
            {m.role === 'ASSISTANT' && m.level && (
              <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 inline-block mb-1">
                Level: {m.level}
              </span>
            )}
            <p className="leading-relaxed font-sans">{m.content}</p>
          </div>
        ))}
      </div>

      {/* Input Row */}
      <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <textarea
          value={userReasoning}
          onChange={(e) => setUserReasoning(e.target.value)}
          placeholder="Explain your reasoning or answer to the tutor..."
          rows={3}
          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 resize-none"
        />

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleToggleVoice}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border flex items-center space-x-1.5 transition ${
              voiceState === 'LISTENING'
                ? 'bg-rose-100 dark:bg-rose-950 border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-300 animate-pulse'
                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            <span>{voiceState === 'LISTENING' ? '🔴' : '🎤'}</span>
            <span>{voiceState === 'LISTENING' ? 'Listening...' : 'Voice Input'}</span>
          </button>

          <button
            onClick={handleSendReasoning}
            disabled={submitting || !userReasoning.trim()}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition disabled:opacity-50"
          >
            {submitting ? 'Guiding...' : 'Send Reasoning ➔'}
          </button>
        </div>
      </div>
    </div>
  );
}
