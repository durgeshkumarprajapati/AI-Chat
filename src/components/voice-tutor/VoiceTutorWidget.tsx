'use client';

import React, { useState, useEffect, useRef } from 'react';
import { VoiceState } from '@/features/voice-tutor/voice-tutor.types';
import { VOICE_STATE_DESCRIPTIONS } from '@/features/voice-tutor/voice-tutor.constants';

interface VoiceTutorWidgetProps {
  sessionId: string | null;
  state: VoiceState;
  onStateChange: (_newState: VoiceState) => void;
  onAudioRecorded: (_audioBlob: Blob) => void;
  onTextSubmitted?: (_text: string) => void;
  audioResponseBase64?: string | null;
  audioMimeType?: string;
  disabled?: boolean;
}

export const VoiceTutorWidget: React.FC<VoiceTutorWidgetProps> = ({
  sessionId,
  state,
  onStateChange,
  onAudioRecorded,
  onTextSubmitted,
  audioResponseBase64,
  audioMimeType = 'audio/mp3',
  disabled = false
}) => {
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [textInput, setTextInput] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  // Stop playback when user interrupts / barge-in occurs
  const handleInterruptPlayback = () => {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
    }
  };

  // Play incoming TTS audio when available and in SPEAKING state
  useEffect(() => {
    if (audioResponseBase64 && state === 'SPEAKING') {
      try {
        if (!audioElementRef.current) {
          audioElementRef.current = new Audio();
        }

        const src = `data:${audioMimeType};base64,${audioResponseBase64}`;
        audioElementRef.current.src = src;
        audioElementRef.current.onended = () => {
          onStateChange('IDLE');
        };
        audioElementRef.current.onerror = () => {
          onStateChange('IDLE');
        };

        audioElementRef.current.play().catch((err) => {
          console.warn('[VoiceWidget] Audio autoplay blocked or failed:', err);
          onStateChange('IDLE');
        });
      } catch (err) {
        console.error('[VoiceWidget] Failed to initialize audio playback:', err);
        onStateChange('IDLE');
      }
    }
  }, [audioResponseBase64, state, audioMimeType, onStateChange]);

  // Request microphone & start recording upon explicit user click
  const startRecording = async () => {
    if (!sessionId || disabled) return;

    // Interrupt any active speech playback
    handleInterruptPlayback();
    setPermissionError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setPermissionError('Microphone API is not supported by your browser.');
      onStateChange('ERROR');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        mimeType = 'audio/ogg';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        // Stop stream tracks
        stream.getTracks().forEach((track) => track.stop());

        if (audioBlob.size > 0) {
          onStateChange('PROCESSING');
          onAudioRecorded(audioBlob);
        } else {
          onStateChange('IDLE');
        }
      };

      recorder.start(250);
      onStateChange('LISTENING');
    } catch (err: any) {
      console.error('[VoiceWidget] Microphone permission or capture error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionError('Microphone permission was denied. Please allow microphone access in your browser.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setPermissionError('No microphone input device was detected on your system.');
      } else {
        setPermissionError(err.message || 'Failed to access microphone.');
      }
      onStateChange('ERROR');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleMicClick = () => {
    if (state === 'LISTENING') {
      stopRecording();
    } else if (state === 'SPEAKING') {
      handleInterruptPlayback();
      startRecording();
    } else if (state === 'IDLE' || state === 'PAUSED' || state === 'ERROR') {
      startRecording();
    }
  };

  const handleManualTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim() || !onTextSubmitted || !sessionId) return;
    handleInterruptPlayback();
    const text = textInput.trim();
    setTextInput('');
    onStateChange('THINKING');
    onTextSubmitted(text);
  };

  return (
    <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl flex flex-col items-center text-center">
      {/* Microphone State Visualizer Ring */}
      <div className="relative flex items-center justify-center my-2">
        {state === 'LISTENING' && (
          <div className="absolute inset-0 rounded-full bg-rose-500/20 animate-ping" />
        )}
        {state === 'THINKING' && (
          <div className="absolute inset-0 rounded-full bg-indigo-500/20 animate-pulse" />
        )}
        {state === 'SPEAKING' && (
          <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-pulse" />
        )}

        <button
          type="button"
          onClick={handleMicClick}
          disabled={disabled || !sessionId || state === 'PROCESSING'}
          aria-label={state === 'LISTENING' ? 'Stop recording speech' : 'Start speaking to AI Tutor'}
          className={`w-28 h-28 sm:w-32 sm:h-32 rounded-full flex items-center justify-center text-4xl sm:text-5xl transition-all shadow-xl border-4 ${
            state === 'LISTENING'
              ? 'bg-rose-600 hover:bg-rose-500 border-rose-400 text-white scale-105 shadow-rose-500/30'
              : state === 'SPEAKING'
              ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-400 text-white scale-105 shadow-emerald-500/30'
              : state === 'THINKING' || state === 'PROCESSING'
              ? 'bg-indigo-600 border-indigo-400 text-white animate-pulse shadow-indigo-500/30'
              : 'bg-indigo-600/90 hover:bg-indigo-500 border-indigo-400/80 text-white shadow-indigo-600/20 hover:scale-105'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {state === 'LISTENING' ? '⏹' : state === 'SPEAKING' ? '🔊' : state === 'THINKING' || state === 'PROCESSING' ? '🧠' : '🎤'}
        </button>
      </div>

      {/* State Text & Feedback */}
      <div className="space-y-1 max-w-md">
        <div className="text-sm font-bold text-white flex items-center justify-center space-x-2">
          <span>{VOICE_STATE_DESCRIPTIONS[state] || VOICE_STATE_DESCRIPTIONS.IDLE}</span>
        </div>
        <p className="text-xs text-slate-400">
          {state === 'SPEAKING' ? 'Click microphone to interrupt and ask a new question.' : 'Click the microphone button to speak naturally with your AI Tutor.'}
        </p>

        {permissionError && (
          <div className="mt-2 text-xs font-semibold text-rose-400 bg-rose-950/60 border border-rose-800/80 p-2.5 rounded-xl">
            ⚠️ {permissionError}
          </div>
        )}
      </div>

      {/* Fallback Text Input Form */}
      {onTextSubmitted && (
        <form onSubmit={handleManualTextSubmit} className="w-full max-w-lg flex items-center space-x-2 pt-2">
          <input
            type="text"
            placeholder="Type a message or topic instead..."
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            disabled={disabled || !sessionId || state === 'LISTENING'}
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
          />
          <button
            type="submit"
            disabled={!textInput.trim() || disabled || !sessionId}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition shadow-md shadow-indigo-600/20"
          >
            Send 🚀
          </button>
        </form>
      )}
    </div>
  );
};
