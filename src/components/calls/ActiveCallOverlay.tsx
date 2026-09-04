'use client';

import React, { useEffect, useRef } from 'react';
import type { ActiveCallInfo, CallStatus } from '@/features/collaboration/webrtc/webrtc.types';

interface ActiveCallOverlayProps {
  callStatus: CallStatus;
  activeCall: ActiveCallInfo | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  errorMessage: string | null;
  onEndCall: () => void;
  onToggleMute: () => void;
  onToggleVideo: () => void;
}

const VISIBLE_STATUSES: CallStatus[] = ['OUTGOING', 'CONNECTING', 'ACTIVE', 'REJECTED', 'ENDED', 'FAILED'];

/** Global outgoing/connecting/active call surface — a small persistent panel (not the full-page
 * Modal used for incoming calls), consistent with the pre-existing in-call bar's footprint but
 * now global instead of embedded in a single page. Renders local/remote <video> for video calls;
 * for voice calls only a hidden <audio> element plays the remote stream. */
export function ActiveCallOverlay({
  callStatus,
  activeCall,
  localStream,
  remoteStream,
  errorMessage,
  onEndCall,
  onToggleMute,
  onToggleVideo
}: ActiveCallOverlayProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  if (!activeCall || !VISIBLE_STATUSES.includes(callStatus)) return null;

  const isVideo = activeCall.callType === 'VIDEO';

  if (callStatus === 'REJECTED' || callStatus === 'ENDED' || callStatus === 'FAILED') {
    return (
      <div
        data-testid="call-status-toast"
        className="fixed bottom-4 right-4 left-4 sm:left-auto sm:bottom-6 sm:right-6 z-50 px-4 py-3 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-2xl border border-slate-700 animate-fade-in"
      >
        {callStatus === 'REJECTED' && 'Call declined.'}
        {callStatus === 'ENDED' && 'Call ended.'}
        {callStatus === 'FAILED' && (errorMessage || 'Call could not be connected.')}
      </div>
    );
  }

  return (
    <div
      data-testid="active-call-overlay"
      className="fixed bottom-4 right-4 left-4 sm:left-auto sm:bottom-6 sm:right-6 z-50 w-auto sm:w-80 max-w-[calc(100vw-2rem)] rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden text-white"
    >
      {isVideo && (
        <div className="relative bg-black aspect-video">
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute bottom-2 right-2 w-20 h-14 rounded-lg object-cover border border-slate-600"
          />
        </div>
      )}
      {!isVideo && <audio ref={remoteAudioRef} autoPlay />}

      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold">{activeCall.peer.name || 'Calling...'}</p>
            <p className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">
              {callStatus === 'OUTGOING' && 'Ringing…'}
              {callStatus === 'CONNECTING' && 'Connecting…'}
              {callStatus === 'ACTIVE' && (isVideo ? '📹 Video Call' : '📞 Voice Call')}
            </p>
          </div>
        </div>
        {errorMessage && <p className="text-[10px] text-rose-400">{errorMessage}</p>}
        <div className="flex items-center space-x-2 pt-1">
          <button
            type="button"
            onClick={onToggleMute}
            data-testid="toggle-mute-button"
            className={`flex-1 h-9 rounded-lg text-[11px] font-bold transition-colors ${
              activeCall.isMuted ? 'bg-amber-600' : 'bg-slate-800'
            }`}
          >
            {activeCall.isMuted ? '🎙 Unmute' : '🎤 Mute'}
          </button>
          {isVideo && (
            <button
              type="button"
              onClick={onToggleVideo}
              data-testid="toggle-video-button"
              className={`flex-1 h-9 rounded-lg text-[11px] font-bold transition-colors ${
                activeCall.isVideoOff ? 'bg-amber-600' : 'bg-slate-800'
              }`}
            >
              {activeCall.isVideoOff ? '📹 Video On' : '📷 Video Off'}
            </button>
          )}
          <button
            type="button"
            onClick={onEndCall}
            data-testid="end-call-button"
            className="flex-1 h-9 rounded-lg bg-rose-600 hover:bg-rose-700 text-[11px] font-bold transition-colors"
          >
            End
          </button>
        </div>
      </div>
    </div>
  );
}
