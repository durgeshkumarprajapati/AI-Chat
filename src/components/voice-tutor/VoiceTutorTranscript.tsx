'use client';

import React from 'react';
import { VoiceTutorMessageDTO } from '@/features/voice-tutor/voice-tutor.types';

interface VoiceTutorTranscriptProps {
  messages: VoiceTutorMessageDTO[];
}

export const VoiceTutorTranscript: React.FC<VoiceTutorTranscriptProps> = ({ messages }) => {
  if (!messages || messages.length === 0) {
    return (
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-8 text-center space-y-2">
        <span className="text-3xl">📜</span>
        <h3 className="text-sm font-bold text-white">Live Voice Transcript</h3>
        <p className="text-xs text-slate-400">
          Your spoken messages and AI tutor explanations will appear here in real time.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4 max-h-[500px] overflow-y-auto font-sans">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 className="text-sm font-bold text-white flex items-center space-x-2">
          <span>📜</span>
          <span>Conversation Transcript</span>
        </h3>
        <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
          {messages.length} message{messages.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="space-y-3">
        {messages.map((msg) => {
          const isUser = msg.role === 'USER';
          return (
            <div
              key={msg.id}
              className={`flex flex-col space-y-1 ${isUser ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center space-x-2 text-[10px] font-mono text-slate-400">
                <span>{isUser ? '👤 You' : '🤖 AI Tutor'}</span>
                <span>•</span>
                <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>

              <div
                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                  isUser
                    ? 'bg-indigo-600 text-white rounded-br-none shadow-md shadow-indigo-600/10'
                    : 'bg-slate-900 border border-slate-800 text-slate-100 rounded-bl-none shadow-md'
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.text}</p>

                {/* Grounding RAG Context Badges */}
                {!isUser && msg.ragContext?.isGrounded && (
                  <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center flex-wrap gap-1 text-[10px] font-mono text-emerald-400">
                    <span>🌱 Grounded in Document Evidence</span>
                  </div>
                )}

                {/* Knowledge Graph Entity Badges */}
                {!isUser && msg.graphContext?.entities?.length > 0 && (
                  <div className="mt-1 flex items-center flex-wrap gap-1 text-[10px] font-mono text-sky-400">
                    <span>🕸 Knowledge Graph Connected:</span>
                    {msg.graphContext.entities.map((e: any, idx: number) => (
                      <span key={idx} className="bg-sky-950/80 border border-sky-800 px-1.5 py-0.5 rounded text-[9px]">
                        {e.name || e.label || 'Entity'}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
