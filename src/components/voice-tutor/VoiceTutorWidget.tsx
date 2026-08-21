'use client';

import React, { useState, useEffect, useRef } from 'react';
import { VoiceState } from '@/features/voice-tutor/voice-tutor.types';
import { VoiceOrb } from './VoiceOrb';

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
    <div className="bg-[#0a0e18] border border-[#424754] rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl flex flex-col items-center text-center font-sans">
      {/* Central Voice Orb Component */}
      <VoiceOrb
        state={state}
        disabled={disabled || !sessionId}
        onClick={handleMicClick}
        size="md"
      />

      {permissionError && (
        <div className="text-xs font-semibold text-rose-400 bg-rose-950/60 border border-rose-800/80 p-3 rounded-xl max-w-md w-full">
          ⚠️ {permissionError}
        </div>
      )}

      {/* Fallback Text Input Form */}
      {onTextSubmitted && (
        <form onSubmit={handleManualTextSubmit} className="w-full max-w-lg flex items-center space-x-2 pt-2">
          <input
            type="text"
            placeholder="Type a message or question instead..."
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            disabled={disabled || !sessionId || state === 'LISTENING'}
            className="flex-1 bg-[#0f131d] border border-[#424754] rounded-xl px-4 py-2.5 text-xs text-[#dfe2f1] placeholder-[#8c909f] focus:outline-none focus:border-[#4d8eff] transition"
          />
          <button
            type="submit"
            disabled={!textInput.trim() || disabled || !sessionId}
            className="px-4 py-2.5 bg-gradient-to-r from-[#4d8eff] to-[#adc6ff] hover:opacity-90 disabled:opacity-50 text-[#0a0e18] font-bold text-xs rounded-xl transition shadow-md shadow-[#4d8eff]/20"
          >
            Send 🚀
          </button>
        </form>
      )}
    </div>
  );
};
