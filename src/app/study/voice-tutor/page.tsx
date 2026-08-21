'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AppLayout } from '@/components/layout/AppLayout';
import { VoiceState, VoiceTutorSessionDTO, VoiceTutorFeedbackDTO } from '@/features/voice-tutor/voice-tutor.types';
import { VoiceTutorWidget } from '@/components/voice-tutor/VoiceTutorWidget';
import { VoiceTutorTranscript } from '@/components/voice-tutor/VoiceTutorTranscript';
import { VoiceTutorSummaryCard } from '@/components/voice-tutor/VoiceTutorSummaryCard';

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

  // Auto-create initial session if none active
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

      // Update local session state with user & assistant messages
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
        throw new Error(data.error || 'Failed to process text query');
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
      setErrorMessage(err.message || 'Failed to process input.');
      setState('ERROR');
    }
  };

  const handleEndSession = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/study/voice-tutor/sessions/${session.id}/complete`, {
        method: 'POST'
      });

      const data = await res.json();
      if (data.success && data.data) {
        setSession(data.data.session);
        setFeedback(data.data.feedback);
      }
      setState('ENDED');
    } catch (err: any) {
      console.error('[VoicePage] Error completing session:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-8 w-full font-sans">
        {/* Header */}
        <div data-tour="voice-tutor-header" className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center space-x-3">
              <span className="text-3xl">🎤</span>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">AI Voice Tutor</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 uppercase tracking-wide">
                Voice AI
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Natural voice learning conversation grounded in document evidence and Knowledge Graph context.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <Link
              href="/study/voice-tutor/history"
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white transition flex items-center space-x-2"
            >
              <span>📜 Session History</span>
            </Link>
          </div>
        </div>

        {/* Start Session Setup Banner if No Active Session */}
        {!session && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 text-center max-w-2xl mx-auto shadow-2xl">
            <span className="text-4xl">🎙️</span>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white">Start New Voice Tutoring Session</h2>
              <p className="text-xs text-slate-400">Choose a topic title and mode to begin your conversation.</p>
            </div>

            <div className="space-y-4 text-left max-w-md mx-auto">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Session Topic / Title</label>
                <input
                  type="text"
                  placeholder="e.g. Database Sharding & PostgreSQL Indexing"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Tutoring Mode</label>
                <select
                  value={modeInput}
                  onChange={(e: any) => setModeInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="FREE_TUTOR">💬 Free Interactive Tutor</option>
                  <option value="QUIZ_TUTOR">🎯 Quiz & Assessment Tutor</option>
                  <option value="DOCUMENT_TUTOR">📄 Document Grounded Tutor</option>
                </select>
              </div>

              <button
                onClick={createSession}
                disabled={loading}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition flex items-center justify-center space-x-2"
              >
                <span>{loading ? 'Starting Session...' : '🎤 Begin Voice Session'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Active Session Interface */}
        {session && (
          <div className="space-y-8">
            {/* Top Control Bar */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <div>
                  <h3 className="text-xs font-bold text-white">{session.title}</h3>
                  <p className="text-[10px] font-mono text-slate-400">Mode: {session.mode} • Started {new Date(session.startedAt).toLocaleTimeString()}</p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {state === 'PAUSED' ? (
                  <button
                    onClick={() => setState('IDLE')}
                    className="px-3.5 py-1.5 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 text-xs font-semibold rounded-xl transition"
                  >
                    ▶ Resume
                  </button>
                ) : (
                  <button
                    onClick={() => setState('PAUSED')}
                    disabled={state === 'ENDED'}
                    className="px-3.5 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-semibold rounded-xl transition"
                  >
                    ⏸ Pause
                  </button>
                )}

                <button
                  onClick={handleEndSession}
                  disabled={loading || state === 'ENDED'}
                  className="px-3.5 py-1.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 text-xs font-semibold rounded-xl transition"
                >
                  ⏹ End Session
                </button>
              </div>
            </div>

            {errorMessage && (
              <div className="bg-rose-950/80 border border-rose-800 text-rose-300 text-xs p-3.5 rounded-2xl flex items-center justify-between">
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
    </AppLayout>
  );
}
