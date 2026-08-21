'use client';

import React, { useEffect, useRef, useState } from 'react';
import { soundscapeService } from '@/features/chill-focus/audio/soundscape.service';

interface SoundscapePlayerProps {
  soundscapeId: string;
  volume: number;
  isMuted: boolean;
  onVolumeChange: (_vol: number) => void;
  onMuteToggle: () => void;
}

export const SoundscapePlayer: React.FC<SoundscapePlayerProps> = ({
  soundscapeId,
  volume,
  isMuted,
  onVolumeChange,
  onMuteToggle
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setLoadError(false);
    setAutoplayBlocked(false);

    const url = soundscapeService.getAudioUrl(soundscapeId);

    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.loop = true;
    }

    const audio = audioRef.current;
    audio.src = url;
    audio.volume = isMuted ? 0 : volume;

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        if (err.name === 'NotAllowedError' || err.name === 'NotSupportedError') {
          setAutoplayBlocked(true);
        } else {
          setLoadError(true);
        }
      });
    }

    return () => {
      audio.pause();
    };
  }, [soundscapeId, volume, isMuted]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const handleUserGesturePlay = () => {
    if (audioRef.current) {
      audioRef.current.play().then(() => {
        setAutoplayBlocked(false);
      }).catch(() => {
        setLoadError(true);
      });
    }
  };

  return (
    <div className="flex items-center space-x-2">
      {autoplayBlocked && (
        <button
          onClick={handleUserGesturePlay}
          className="px-3 py-1 bg-amber-950/90 border border-amber-800 text-amber-300 text-[11px] font-bold rounded-full animate-pulse flex items-center space-x-1"
        >
          <span>🎵 Tap sound to start</span>
        </button>
      )}

      {loadError && (
        <span className="text-[10px] font-mono text-slate-400 bg-slate-900 border border-slate-800 px-2 py-1 rounded-full">
          Soundscape unavailable
        </span>
      )}

      <button
        type="button"
        onClick={onMuteToggle}
        aria-label={isMuted ? 'Unmute soundscape' : 'Mute soundscape'}
        className="w-10 h-10 rounded-full bg-slate-900/80 hover:bg-slate-800 border border-slate-800 flex items-center justify-center text-white text-base transition shadow-lg"
      >
        {isMuted || volume === 0 ? '🔇' : '🔊'}
      </button>

      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={isMuted ? 0 : volume}
        onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
        aria-label="Soundscape volume"
        className="w-20 accent-indigo-500 bg-slate-800 rounded-lg cursor-pointer"
      />
    </div>
  );
};
