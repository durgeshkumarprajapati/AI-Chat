'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { VoiceState, VoiceTutorSessionDTO, VoiceTutorFeedbackDTO } from '@/features/voice-tutor/voice-tutor.types';
import { VoiceTutorWidget } from '@/components/voice-tutor/VoiceTutorWidget';
import { VoiceTutorTranscript } from '@/components/voice-tutor/VoiceTutorTranscript';
import { VoiceTutorSummaryCard } from '@/components/voice-tutor/VoiceTutorSummaryCard';
import { VoiceOrb } from '@/components/voice-tutor/VoiceOrb';

export default function VoiceTutorPage() {
  const [session, setSession] = useState<VoiceTutorSessionDTO | null>(null);
  const [state, setState] = useState<VoiceState>('IDLE');
  const [loading, setLoading] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [modeInput, setModeInput] = useState<'FREE_TUTOR' | 'QUIZ_TUTOR' | 'DOCUMENT_TUTOR'>('FREE_TUTOR');
  const [feedback, setFeedback] = useState<VoiceTutorFeedbackDTO | null>(null);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [audioMimeType, setAudioMimeType] = useState<string>('audio/mp3');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const topicSuggestions = [
    'Database Sharding & PostgreSQL Indexing',
    'System Design',
    'React',
    'JavaScript',
    'AI & Machine Learning',
    'Database Architecture'
  ];

  const createSession = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/study/voice-tutor/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: titleInput.trim() || 'AI Voice Tutoring Session',
          mode: modeInput
        })
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to start session');
      }

      setSession(data.data);
      setFeedback(null);
      setState('IDLE');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to initialize session.');
    } finally {
      setLoading(false);
    }
  };

  const handleAudioRecorded = async (audioBlob: Blob) => {
    if (!session) return;
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');

      const res = await fetch(`/api/study/voice-tutor/sessions/${session.id}/audio`, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to process voice input');
      }

      const turn = data.data;
      setAudioBase64(turn.audioBase64 || null);
      setAudioMimeType(turn.audioMimeType || 'audio/mp3');

      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: [...(prev.messages || []), turn.userMessage, turn.tutorMessage]
        };
      });

      if (turn.audioBase64) {
        setState('SPEAKING');
      } else {
        setState('IDLE');
      }
    } catch (err: any) {
      console.error('[VoicePage] Audio processing error:', err);
      setErrorMessage(err.message || 'Failed to process voice input.');
      setState('ERROR');
    }
  };

  const handleTextSubmitted = async (text: string) => {
    if (!session) return;
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/study/voice-tutor/sessions/${session.id}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to send text message');
      }

      const turn = data.data;
      setAudioBase64(turn.audioBase64 || null);
      setAudioMimeType(turn.audioMimeType || 'audio/mp3');

      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: [...(prev.messages || []), turn.userMessage, turn.tutorMessage]
        };
      });

      if (turn.audioBase64) {
        setState('SPEAKING');
      } else {
        setState('IDLE');
      }
    } catch (err: any) {
      console.error('[VoicePage] Text processing error:', err);
      setErrorMessage(err.message || 'Failed to send message.');
      setState('ERROR');
    }
  };

  const handleEndSession = async () => {
    if (!session) return;
    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/study/voice-tutor/sessions/${session.id}/complete`, {
        method: 'POST'
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to complete session');
      }

      const feedbackRes = await fetch(`/api/study/voice-tutor/sessions/${session.id}/feedback`);
      const feedbackData = await feedbackRes.json();
      if (feedbackData.success && feedbackData.data) {
        setFeedback(feedbackData.data);
      }

      setState('ENDED');
    } catch (err: any) {
      console.error('[VoicePage] End session error:', err);
      setErrorMessage(err.message || 'Failed to complete session properly.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-8 w-full font-sans selection:bg-primary selection:text-white">
      {/* Header */}
      <div data-tour="voice-tutor-header" className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <span className="text-3xl">🎤</span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight font-sans">
              AI Voice Tutor
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-primary/20 text-primary border border-primary/30 uppercase tracking-wider">
              VOICE AI
            </span>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Natural voice learning conversation grounded in document evidence and Knowledge Graph context.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            href="/study/voice-tutor/history"
            className="px-4 py-2 rounded-xl bg-card hover:bg-surface border border-border text-xs font-semibold text-muted-foreground hover:text-foreground transition flex items-center space-x-2 shadow-sm"
          >
            <span>↶ Session History</span>
          </Link>
        </div>
      </div>

      {/* Start Session Setup Panel if No Active Session */}
      {!session && (
        <div className="bg-card border border-border rounded-3xl p-6 sm:p-10 space-y-8 max-w-2xl mx-auto shadow-2xl relative overflow-hidden">
          {/* Central Orb Preview */}
          <div className="pt-2">
            <VoiceOrb state="IDLE" size="md" />
          </div>

          <div className="text-center space-y-1">
            <h2 className="text-xl font-extrabold text-foreground tracking-tight">
              Start your learning session
            </h2>
            <p className="text-xs text-muted-foreground">
              Choose what you want to learn and how you want your tutor to teach
            </p>
          </div>

          <div className="space-y-6 text-left max-w-lg mx-auto">
            {/* Topic Input */}
            <div className="space-y-2">
              <label className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary">
                WHAT WOULD YOU LIKE TO LEARN?
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">🔍</span>
                <input
                  type="text"
                  placeholder="e.g. Database Sharding & PostgreSQL Indexing"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  className="w-full bg-surface border border-border rounded-xl pl-10 pr-4 py-3 text-xs text-foreground placeholder-text-disabled focus:outline-none focus:border-primary shadow-inner transition"
                />
              </div>

              {/* Lightweight Topic Suggestion Chips */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="text-[10px] font-mono text-muted-foreground self-center mr-1">Popular:</span>
                {topicSuggestions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setTitleInput(item)}
                    className="px-2.5 py-1 rounded-lg bg-surface hover:bg-surface-hover border border-border/60 text-[10px] font-mono text-muted-foreground hover:text-primary transition"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {/* Tutoring Experience Selectable Cards */}
            <div className="space-y-2">
              <label className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary">
                TUTORING EXPERIENCE
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Option 1: FREE_TUTOR */}
                <button
                  type="button"
                  onClick={() => setModeInput('FREE_TUTOR')}
                  className={`p-3.5 rounded-2xl border text-left transition-all duration-300 flex flex-col justify-between ${
                    modeInput === 'FREE_TUTOR'
                      ? 'bg-primary/15 border-primary shadow-lg shadow-primary/20 scale-[1.02]'
                      : 'bg-surface hover:bg-surface-hover border-border text-muted-foreground'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xl">💬</span>
                    {modeInput === 'FREE_TUTOR' && <span className="text-xs text-success font-bold">✓</span>}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-foreground">Interactive Tutor</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Natural conversation</div>
                  </div>
                </button>

                {/* Option 2: QUIZ_TUTOR */}
                <button
                  type="button"
                  onClick={() => setModeInput('QUIZ_TUTOR')}
                  className={`p-3.5 rounded-2xl border text-left transition-all duration-300 flex flex-col justify-between ${
                    modeInput === 'QUIZ_TUTOR'
                      ? 'bg-primary/15 border-primary shadow-lg shadow-primary/20 scale-[1.02]'
                      : 'bg-surface hover:bg-surface-hover border-border text-muted-foreground'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xl">🎓</span>
                    {modeInput === 'QUIZ_TUTOR' && <span className="text-xs text-success font-bold">✓</span>}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-foreground">Guided Learning</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Structured walkthrough</div>
                  </div>
                </button>

                {/* Option 3: DOCUMENT_TUTOR */}
                <button
                  type="button"
                  onClick={() => setModeInput('DOCUMENT_TUTOR')}
                  className={`p-3.5 rounded-2xl border text-left transition-all duration-300 flex flex-col justify-between ${
                    modeInput === 'DOCUMENT_TUTOR'
                      ? 'bg-primary/15 border-primary shadow-lg shadow-primary/20 scale-[1.02]'
                      : 'bg-surface hover:bg-surface-hover border-border text-muted-foreground'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xl">❓</span>
                    {modeInput === 'DOCUMENT_TUTOR' && <span className="text-xs text-success font-bold">✓</span>}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-foreground">Q&A Session</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Targeted assessment</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Primary CTA Button */}
            <button
              onClick={createSession}
              disabled={loading}
              className="w-full h-12 bg-gradient-to-r from-primary via-primary to-primary-hover hover:opacity-95 disabled:opacity-50 text-primary-foreground font-extrabold text-sm rounded-2xl shadow-xl shadow-primary/30 transition-all flex items-center justify-center space-x-2"
            >
              <span>{loading ? '◌ Preparing your tutor...' : '🎙 Begin Voice Session'}</span>
            </button>
          </div>

          {/* Trust / Capability Strip */}
          <div className="pt-6 border-t border-border/40 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center text-xs font-mono text-muted-foreground">
            <div className="space-y-0.5">
              <div className="text-foreground font-bold flex items-center justify-center space-x-1">
                <span>📄</span>
                <span>Grounded Answers</span>
              </div>
              <div className="text-[10px] text-muted-foreground">From your documents</div>
            </div>

            <div className="space-y-0.5">
              <div className="text-foreground font-bold flex items-center justify-center space-x-1">
                <span>🧠</span>
                <span>Knowledge Graph</span>
              </div>
              <div className="text-[10px] text-muted-foreground">Context-aware learning</div>
            </div>

            <div className="space-y-0.5">
              <div className="text-foreground font-bold flex items-center justify-center space-x-1">
                <span>🔊</span>
                <span>Voice AI</span>
              </div>
              <div className="text-[10px] text-muted-foreground">Natural conversation</div>
            </div>
          </div>
        </div>
      )}

      {/* Active Session Interface */}
      {session && (
        <div className="space-y-8">
          {/* Top Session Control Bar */}
          <div className="bg-card border border-border rounded-2xl px-6 py-4 flex flex-wrap items-center justify-between gap-4 shadow-xl">
            <div className="flex items-center space-x-3">
              <span className="w-2.5 h-2.5 rounded-full bg-success animate-pulse" />
              <div>
                <h3 className="text-sm font-bold text-foreground">{session.title}</h3>
                <p className="text-[10px] font-mono text-muted-foreground">
                  Mode: {session.mode} • Started {new Date(session.startedAt).toLocaleTimeString()}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              {state === 'PAUSED' ? (
                <button
                  onClick={() => setState('IDLE')}
                  className="px-4 py-2 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 text-xs font-semibold rounded-xl transition"
                >
                  ▶ Resume
                </button>
              ) : (
                <button
                  onClick={() => setState('PAUSED')}
                  disabled={state === 'ENDED'}
                  className="px-4 py-2 bg-surface hover:bg-surface-hover border border-border text-muted-foreground text-xs font-semibold rounded-xl transition"
                >
                  ⏸ Pause
                </button>
              )}

              <button
                onClick={handleEndSession}
                disabled={loading || state === 'ENDED'}
                className="px-4 py-2 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 text-xs font-semibold rounded-xl transition"
              >
                ⏹ End Session
              </button>
            </div>
          </div>

          {errorMessage && (
            <div className="bg-rose-950/80 border border-rose-800 text-rose-300 text-xs p-4 rounded-2xl flex items-center justify-between">
              <span>⚠️ {errorMessage}</span>
              <button onClick={() => setErrorMessage(null)} className="text-rose-400 font-bold">✕</button>
            </div>
          )}

          {/* Live Voice Microphone Widget */}
          <VoiceTutorWidget
            sessionId={session.id}
            state={state}
            onStateChange={setState}
            onAudioRecorded={handleAudioRecorded}
            onTextSubmitted={handleTextSubmitted}
            audioResponseBase64={audioBase64}
            audioMimeType={audioMimeType}
            disabled={state === 'ENDED' || state === 'PAUSED'}
          />

          {/* Post-Session Summary Card */}
          {feedback && (
            <VoiceTutorSummaryCard feedback={feedback} onClose={() => setFeedback(null)} />
          )}

          {/* Live Transcript View */}
          <VoiceTutorTranscript messages={session.messages || []} />
        </div>
      )}
    </div>
  );
}
