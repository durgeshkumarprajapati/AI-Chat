'use client';

import React from 'react';
import { VoiceTutorMessageDTO } from '@/features/voice-tutor/voice-tutor.types';

interface VoiceTutorTranscriptProps {
  messages: VoiceTutorMessageDTO[];
}

export const VoiceTutorTranscript: React.FC<VoiceTutorTranscriptProps> = ({ messages }) => {
  if (!messages || messages.length === 0) {
    return (
      <div className="bg-card border border-border rounded-3xl p-8 text-center text-xs font-mono text-muted-foreground shadow-xl">
        💬 Conversation history will appear here once you begin speaking.
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl font-sans">
      <div className="flex items-center justify-between border-b border-border/60 pb-4">
        <h3 className="text-sm font-extrabold text-foreground tracking-tight flex items-center space-x-2">
          <span>💬</span>
          <span>Voice Conversation Transcript</span>
        </h3>
        <span className="text-[10px] font-mono text-primary bg-primary/10 px-2.5 py-1 rounded-full border border-primary/30">
          {messages.length} Message{messages.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
        {messages.map((msg) => {
          const isUser = msg.role === 'USER';
          return (
            <div
              key={msg.id}
              className={`p-4 rounded-2xl border transition-all duration-300 ${
                isUser
                  ? 'bg-surface border-border ml-6'
                  : 'bg-primary/10 border-primary/40 mr-6'
              }`}
            >
              {/* Message Header */}
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${
                  isUser ? 'text-primary' : 'text-success'
                }`}>
                  {isUser ? '👤 YOU' : '🤖 AI TUTOR'}
                </span>
                <span className="text-[9px] font-mono text-muted-foreground">
                  {new Date(msg.createdAt).toLocaleTimeString()}
                </span>
              </div>

              {/* Message Body Text */}
              <p className="text-xs text-foreground leading-relaxed font-medium">
                {msg.text}
              </p>

              {/* RAG Context & Citation Badges */}
              {msg.ragContext && Array.isArray(msg.ragContext) && msg.ragContext.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-border/40 flex flex-wrap gap-2 text-[10px] font-mono">
                  <span className="text-warning font-bold">📄 GROUNDED EVIDENCE:</span>
                  {msg.ragContext.map((item: any, idx: number) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded bg-card border border-border text-muted-foreground"
                    >
                      Page {item.pageNumber || 1} • {item.filename || 'Document'}
                    </span>
                  ))}
                </div>
              )}

              {/* Knowledge Graph Badges */}
              {msg.graphContext && Array.isArray(msg.graphContext) && msg.graphContext.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-mono">
                  <span className="text-success font-bold">🧠 KNOWLEDGE GRAPH:</span>
                  {msg.graphContext.map((entity: any, idx: number) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded bg-card border border-success/30 text-success"
                    >
                      {entity.name || entity}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
