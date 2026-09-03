'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from 'react';
import { useWorkspace } from '@/context/WorkspaceContext';
import { WebRTCPeerConnectionManager } from '@/features/collaboration/webrtc/webrtc-peer.service';
import { createLogger } from '@/lib/structured-logger';
import type {
  ActiveCallInfo,
  CallMediaType,
  CallPeerInfo,
  CallSignalEventData,
  CallStatus,
  IceServerConfig,
  IncomingCallInfo
} from '@/features/collaboration/webrtc/webrtc.types';
import { IncomingCallModal } from './IncomingCallModal';
import { ActiveCallOverlay } from './ActiveCallOverlay';

const callLog = createLogger('web-call');

interface RawCallParticipant {
  userId: string;
  user?: { id: string; name?: string | null; email: string; avatarUrl?: string | null };
}

interface CallContextValue {
  callStatus: CallStatus;
  incomingCall: IncomingCallInfo | null;
  activeCall: ActiveCallInfo | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  errorMessage: string | null;
  startCall: (channelId: string, callType: CallMediaType) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleVideo: () => void;
}

const CallContext = createContext<CallContextValue | undefined>(undefined);

export function useGlobalCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) {
    throw new Error('useGlobalCall must be used within a GlobalCallProvider');
  }
  return ctx;
}

const RESET_DISPLAY_MS = 2500;
const CONNECTING_TIMEOUT_MS = 20000;

function peerFromParticipants(participants: RawCallParticipant[], excludeUserId: string): CallPeerInfo {
  const other = participants.find((p) => p.userId !== excludeUserId);
  const user = other?.user;
  return {
    id: other?.userId || '',
    name: user?.name || user?.email?.split('@')[0] || 'Member',
    avatarUrl: user?.avatarUrl || null
  };
}

export function GlobalCallProvider({ children }: { children: React.ReactNode }) {
  const { authStatus, currentUser } = useWorkspace();

  const [callStatus, setCallStatus] = useState<CallStatus>('IDLE');
  const [incomingCall, setIncomingCall] = useState<IncomingCallInfo | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCallInfo | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Refs mirror the latest state for use inside the long-lived SSE handler/closures below,
  // which must never rebind on every state change (that would tear down and reopen the
  // EventSource on every call-status transition).
  const callStatusRef = useRef<CallStatus>('IDLE');
  const activeCallRef = useRef<ActiveCallInfo | null>(null);
  const incomingCallRef = useRef<IncomingCallInfo | null>(null);
  const currentUserIdRef = useRef<string | undefined>(currentUser?.id);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerManagerRef = useRef<WebRTCPeerConnectionManager | null>(null);
  const iceServersRef = useRef<IceServerConfig[]>([]);
  const ringTimeoutMsRef = useRef<number>(30000);
  const lastParticipantsRef = useRef<RawCallParticipant[]>([]);

  useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);
  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);
  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);
  useEffect(() => {
    currentUserIdRef.current = currentUser?.id;
  }, [currentUser?.id]);

  const clearRingTimeout = useCallback(() => {
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
  }, []);

  const scheduleReset = useCallback((finalStatus: CallStatus) => {
    setCallStatus(finalStatus);
    if (connectingTimeoutRef.current) {
      clearTimeout(connectingTimeoutRef.current);
      connectingTimeoutRef.current = null;
    }
    if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
    resetTimeoutRef.current = setTimeout(() => {
      setCallStatus('IDLE');
      setActiveCall(null);
      setIncomingCall(null);
      setErrorMessage(null);
    }, RESET_DISPLAY_MS);
  }, []);

  const cleanupPeer = useCallback(() => {
    peerManagerRef.current?.cleanup();
    peerManagerRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
  }, []);

  const ensureIceServers = useCallback(async (): Promise<IceServerConfig[]> => {
    if (iceServersRef.current.length > 0) return iceServersRef.current;
    try {
      const res = await fetch('/api/collaboration/calls/config');
      const body = await res.json();
      if (body.success && body.data) {
        iceServersRef.current = body.data.iceServers || [];
        ringTimeoutMsRef.current = body.data.ringTimeoutMs || 30000;
      }
    } catch {
      // Fall back to a public STUN-only default so the call can still attempt to connect.
      iceServersRef.current = [{ urls: 'stun:stun.l.google.com:19302' }];
    }
    return iceServersRef.current;
  }, []);

  const sendSignal = useCallback(
    async (callId: string, signalType: 'offer' | 'answer' | 'ice_candidate', signalData: unknown, targetUserId: string) => {
      try {
        await fetch(`/api/collaboration/calls/${callId}/signal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signalType, signalData, targetUserId })
        });
      } catch (err) {
        callLog.warn('CALL_SIGNAL_SEND_FAILED', { callId, signalType });
      }
    },
    []
  );

  const callAction = useCallback(
    async (callId: string, action: 'accept' | 'decline' | 'end') => {
      try {
        await fetch(`/api/collaboration/calls/${callId}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action })
        });
      } catch {
        // Best-effort — local state has already been (or will be) updated regardless, and the
        // SSE broadcast is how the peer finds out; a failed action call is logged, not fatal.
        callLog.warn('CALL_ACTION_SEND_FAILED', { callId, action });
      }
    },
    []
  );

  const clearConnectingTimeout = useCallback(() => {
    if (connectingTimeoutRef.current) {
      clearTimeout(connectingTimeoutRef.current);
      connectingTimeoutRef.current = null;
    }
  }, []);

  // Safety net for Part 18-G ("no permanent CONNECTING state"): if ICE negotiation never
  // resolves to 'connected' or 'failed' within this window (e.g. a network path that neither
  // completes nor is definitively torn down), force the call to FAILED rather than leaving the
  // UI stuck showing "Connecting..." forever.
  const scheduleConnectingTimeout = useCallback(
    (callId: string) => {
      clearConnectingTimeout();
      connectingTimeoutRef.current = setTimeout(() => {
        if (callStatusRef.current === 'CONNECTING' && activeCallRef.current?.callId === callId) {
          callLog.warn('WEBRTC_CONNECTION_FAILED', { callId, reason: 'connecting_timeout' });
          cleanupPeer();
          callAction(callId, 'end');
          setErrorMessage('Connection timed out.');
          scheduleReset('FAILED');
        }
      }, CONNECTING_TIMEOUT_MS);
    },
    [clearConnectingTimeout, cleanupPeer, callAction, scheduleReset]
  );

  // ---- Outgoing (caller) flow ----

  const startCall = useCallback(
    async (channelId: string, callType: CallMediaType) => {
      if (callStatusRef.current !== 'IDLE') return;
      setErrorMessage(null);

      try {
        const res = await fetch('/api/collaboration/calls/initiate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId, type: callType })
        });
        const body = await res.json();
        if (!body.success || !body.data) {
          setErrorMessage(body.error || 'Unable to start call.');
          return;
        }

        const participants: RawCallParticipant[] = body.data.participants || [];
        lastParticipantsRef.current = participants;
        const peer = peerFromParticipants(participants, currentUserIdRef.current || '');

        setActiveCall({
          callId: body.data.id,
          channelId,
          callType,
          direction: 'OUTGOING',
          peer,
          isMuted: false,
          isVideoOff: callType === 'VOICE',
          startedAt: new Date().toISOString()
        });
        setCallStatus('OUTGOING');
        callLog.info('CALL_INVITE_SENT', { callId: body.data.id, callType });

        await ensureIceServers();
        clearRingTimeout();
        ringTimeoutRef.current = setTimeout(() => {
          if (callStatusRef.current === 'OUTGOING' && activeCallRef.current?.callId === body.data.id) {
            callAction(body.data.id, 'end');
            cleanupPeer();
            callLog.info('CALL_TIMEOUT', { callId: body.data.id });
            setErrorMessage('No answer.');
            scheduleReset('FAILED');
          }
        }, ringTimeoutMsRef.current);
      } catch {
        setErrorMessage('Unable to start call.');
      }
    },
    [ensureIceServers, clearRingTimeout, callAction, cleanupPeer, scheduleReset]
  );

  // ---- Incoming (recipient) flow ----

  const acceptCall = useCallback(async () => {
    const invite = incomingCallRef.current;
    if (!invite || callStatusRef.current !== 'INCOMING') return;

    clearRingTimeout();
    setCallStatus('CONNECTING');
    scheduleConnectingTimeout(invite.callId);
    setActiveCall({
      callId: invite.callId,
      channelId: invite.channelId,
      callType: invite.callType,
      direction: 'INCOMING',
      peer: invite.caller,
      isMuted: false,
      isVideoOff: invite.callType === 'VOICE',
      startedAt: new Date().toISOString()
    });
    setIncomingCall(null);

    await callAction(invite.callId, 'accept');
    callLog.info('CALL_ACCEPTED', { callId: invite.callId, callType: invite.callType });

    try {
      const iceServers = await ensureIceServers();
      const manager = new WebRTCPeerConnectionManager();
      peerManagerRef.current = manager;

      const stream = await manager.start(iceServers, invite.callType, {
        onIceCandidate: (candidate) => sendSignal(invite.callId, 'ice_candidate', candidate, invite.caller.id),
        onRemoteStream: (remote) => setRemoteStream(remote),
        onConnectionStateChange: (state) => {
          if (state === 'connected') {
            clearConnectingTimeout();
            setCallStatus('ACTIVE');
            callLog.info('WEBRTC_CONNECTED', { callId: invite.callId });
          } else if (state === 'failed' || state === 'closed') {
            callLog.warn('WEBRTC_CONNECTION_FAILED', { callId: invite.callId, state });
            cleanupPeer();
            scheduleReset('FAILED');
          }
        }
      }, invite.callId);
      setLocalStream(stream);
      // The offer will arrive from the caller now that this side has answered; the peer
      // connection above is primed to receive it and reply with an answer.
    } catch (err) {
      callLog.warn('WEBRTC_MEDIA_PERMISSION_DENIED', { callId: invite.callId, callType: invite.callType });
      setErrorMessage(
        invite.callType === 'VIDEO'
          ? 'Camera/microphone access is required for video calls.'
          : 'Microphone access is required for voice calls.'
      );
      await callAction(invite.callId, 'end');
      cleanupPeer();
      scheduleReset('FAILED');
    }
  }, [clearRingTimeout, callAction, ensureIceServers, sendSignal, cleanupPeer, scheduleReset, scheduleConnectingTimeout, clearConnectingTimeout]);

  const rejectCall = useCallback(async () => {
    const invite = incomingCallRef.current;
    if (!invite) return;
    clearRingTimeout();
    setIncomingCall(null);
    await callAction(invite.callId, 'decline');
    callLog.info('CALL_REJECTED', { callId: invite.callId });
    scheduleReset('REJECTED');
  }, [clearRingTimeout, callAction, scheduleReset]);

  const endCall = useCallback(async () => {
    const call = activeCallRef.current;
    const wasOutgoingBeforeAccept = callStatusRef.current === 'OUTGOING';
    if (!call) return;
    clearRingTimeout();
    cleanupPeer();
    await callAction(call.callId, 'end');
    callLog.info(wasOutgoingBeforeAccept ? 'CALL_CANCELLED' : 'CALL_ENDED', { callId: call.callId });
    scheduleReset('ENDED');
  }, [clearRingTimeout, cleanupPeer, callAction, scheduleReset]);

  const toggleMute = useCallback(() => {
    setActiveCall((prev) => {
      if (!prev) return prev;
      const nextMuted = !prev.isMuted;
      peerManagerRef.current?.setMuted(nextMuted);
      return { ...prev, isMuted: nextMuted };
    });
  }, []);

  const toggleVideo = useCallback(() => {
    setActiveCall((prev) => {
      if (!prev) return prev;
      const nextVideoOff = !prev.isVideoOff;
      peerManagerRef.current?.setVideoEnabled(!nextVideoOff);
      return { ...prev, isVideoOff: nextVideoOff };
    });
  }, []);

  // ---- SSE signaling connection ----

  const handleSignalEvent = useCallback(
    async (data: CallSignalEventData) => {
      const call = activeCallRef.current;
      // Call-ID correlation guard — never apply a signal from a different call to this one.
      if (!call || data.callId !== call.callId) return;
      if (data.senderId === currentUserIdRef.current) return;

      if (data.signalType === 'offer') {
        // We are the answerer (we already called acceptCall(), which started our peer
        // connection). If media permission was denied, there is no peer manager to answer with.
        const manager = peerManagerRef.current;
        if (!manager) return;
        try {
          const answer = await manager.createAnswer(data.signalData as RTCSessionDescriptionInit);
          await sendSignal(call.callId, 'answer', answer, data.senderId);
        } catch {
          callLog.warn('WEBRTC_CONNECTION_FAILED', { callId: call.callId, stage: 'create_answer' });
        }
      } else if (data.signalType === 'answer') {
        const manager = peerManagerRef.current;
        if (!manager) return;
        try {
          await manager.applyAnswer(data.signalData as RTCSessionDescriptionInit);
        } catch {
          callLog.warn('WEBRTC_CONNECTION_FAILED', { callId: call.callId, stage: 'apply_answer' });
        }
      } else if (data.signalType === 'ice_candidate') {
        await peerManagerRef.current?.addIceCandidate(data.signalData as RTCIceCandidateInit);
      }
    },
    [sendSignal]
  );

  const handleCallInvite = useCallback((data: Record<string, unknown>, senderId: string | undefined) => {
    if (!senderId || senderId === currentUserIdRef.current) return;

    // Avoid overlapping calls — auto-decline a second invite while already busy, matching the
    // product's existing single-active-call-per-channel model (see call.service.ts).
    if (callStatusRef.current !== 'IDLE') {
      callAction(String(data.callId), 'decline');
      return;
    }

    const invite: IncomingCallInfo = {
      callId: String(data.callId),
      channelId: String(data.channelId),
      callType: (data.callType as CallMediaType) || 'VOICE',
      caller: { id: senderId, name: String(data.hostName || 'Member'), avatarUrl: null }
    };
    setIncomingCall(invite);
    setCallStatus('INCOMING');
    callLog.info('CALL_INVITE_RECEIVED', { callId: invite.callId, callType: invite.callType });
    callLog.info('CALL_MODAL_SHOWN', { callId: invite.callId });

    clearRingTimeout();
    ringTimeoutRef.current = setTimeout(() => {
      if (callStatusRef.current === 'INCOMING' && incomingCallRef.current?.callId === invite.callId) {
        rejectCall();
      }
    }, ringTimeoutMsRef.current);
  }, [callAction, clearRingTimeout, rejectCall]);

  const handleCallAccept = useCallback(
    (data: Record<string, unknown>) => {
      const callId = String(data.callId);
      const acceptingUserId = String(data.userId);
      const status = callStatusRef.current;
      const call = activeCallRef.current;

      if (status === 'OUTGOING' && call?.callId === callId) {
        // A recipient accepted our outgoing call — we are the offerer.
        clearRingTimeout();
        const peer = peerFromParticipants(lastParticipantsRef.current, currentUserIdRef.current || '');
        setActiveCall((prev) => (prev ? { ...prev, peer: peer.id ? peer : { ...prev.peer, id: acceptingUserId } } : prev));
        setCallStatus('CONNECTING');
        scheduleConnectingTimeout(callId);

        (async () => {
          try {
            const iceServers = await ensureIceServers();
            const manager = new WebRTCPeerConnectionManager();
            peerManagerRef.current = manager;
            const stream = await manager.start(iceServers, call.callType, {
              onIceCandidate: (candidate) => sendSignal(callId, 'ice_candidate', candidate, acceptingUserId),
              onRemoteStream: (remote) => setRemoteStream(remote),
              onConnectionStateChange: (state) => {
                if (state === 'connected') {
                  clearConnectingTimeout();
                  setCallStatus('ACTIVE');
                  callLog.info('WEBRTC_CONNECTED', { callId });
                } else if (state === 'failed' || state === 'closed') {
                  callLog.warn('WEBRTC_CONNECTION_FAILED', { callId, state });
                  cleanupPeer();
                  scheduleReset('FAILED');
                }
              }
            }, callId);
            setLocalStream(stream);
            const offer = await manager.createOffer();
            await sendSignal(callId, 'offer', offer, acceptingUserId);
          } catch {
            callLog.warn('WEBRTC_MEDIA_PERMISSION_DENIED', { callId });
            setErrorMessage(
              call.callType === 'VIDEO'
                ? 'Camera/microphone access is required for video calls.'
                : 'Microphone access is required for voice calls.'
            );
            callAction(callId, 'end');
            cleanupPeer();
            scheduleReset('FAILED');
          }
        })();
        return;
      }

      if (status === 'INCOMING' && incomingCallRef.current?.callId === callId) {
        // Someone else got there first — either another recipient (group channel) or this same
        // user's own accept in a different tab. If THIS tab had accepted, callStatus would
        // already be CONNECTING (set synchronously in acceptCall()) by the time this arrives,
        // so reaching this branch always means "not me, in this tab" — dismiss our modal.
        clearRingTimeout();
        setIncomingCall(null);
        setCallStatus('IDLE');
      }
    },
    [clearRingTimeout, ensureIceServers, sendSignal, cleanupPeer, scheduleReset, callAction, scheduleConnectingTimeout, clearConnectingTimeout]
  );

  const handleCallDeclineOrEnd = useCallback(
    (data: Record<string, unknown>, isEnd: boolean) => {
      const callId = String(data.callId);
      const status = callStatusRef.current;

      if (activeCallRef.current?.callId === callId) {
        clearRingTimeout();
        cleanupPeer();
        if (status === 'ACTIVE' || status === 'CONNECTING') {
          callLog.info('CALL_ENDED', { callId });
          scheduleReset('ENDED');
        } else {
          callLog.info(isEnd ? 'CALL_CANCELLED' : 'CALL_REJECTED', { callId });
          scheduleReset(isEnd ? 'ENDED' : 'REJECTED');
        }
      } else if (incomingCallRef.current?.callId === callId) {
        clearRingTimeout();
        setIncomingCall(null);
        setCallStatus('IDLE');
      }
    },
    [clearRingTimeout, cleanupPeer, scheduleReset]
  );

  useEffect(() => {
    if (authStatus !== 'AUTHENTICATED' || !currentUser?.id) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      return;
    }

    let isUnmounted = false;
    let reconnectAttempt = 0;
    const backoffDelays = [1000, 2000, 5000, 10000, 15000];

    const connect = () => {
      if (isUnmounted) return;
      const es = new EventSource('/api/collaboration/events');
      eventSourceRef.current = es;

      es.onopen = () => {
        reconnectAttempt = 0;
      };

      es.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data);
          if (event.type === 'call:invite') {
            handleCallInvite(event.data || {}, event.senderId);
          } else if (event.type === 'call:accept') {
            handleCallAccept(event.data || {});
          } else if (event.type === 'call:decline') {
            handleCallDeclineOrEnd(event.data || {}, false);
          } else if (event.type === 'call:end') {
            handleCallDeclineOrEnd(event.data || {}, true);
          } else if (event.type === 'call:ice_candidate') {
            handleSignalEvent(event.data as CallSignalEventData);
          }
        } catch {
          // Not a call-related payload (or malformed) — ignore, other consumers of this stream
          // (NotificationCenter, collab-chat) handle their own event types independently.
        }
      };

      es.onerror = () => {
        if (isUnmounted) return;
        es.close();
        if (eventSourceRef.current === es) eventSourceRef.current = null;
        const delay = backoffDelays[Math.min(reconnectAttempt, backoffDelays.length - 1)];
        reconnectAttempt++;
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      isUnmounted = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
    // Deliberately NOT depending on call/UI state — this connection must persist across every
    // call-state transition, only reconnecting when the authenticated identity itself changes.
  }, [authStatus, currentUser?.id, handleCallInvite, handleCallAccept, handleCallDeclineOrEnd, handleSignalEvent]);

  // Full cleanup on unmount (defensive — AppLayout mounts this once for the app's lifetime).
  useEffect(() => {
    return () => {
      clearRingTimeout();
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
      if (connectingTimeoutRef.current) clearTimeout(connectingTimeoutRef.current);
      peerManagerRef.current?.cleanup();
    };
  }, [clearRingTimeout]);

  // Part 18-E ("browser closes — best-effort cleanup"): a regular fetch() made from an unload
  // handler is routinely cancelled by the browser before it reaches the network. sendBeacon is
  // specifically designed to reliably deliver a small POST during page teardown, so the peer and
  // server both learn the call ended instead of the peer waiting out a full ICE-timeout before
  // discovering the same thing.
  useEffect(() => {
    const handleUnload = () => {
      const call = activeCallRef.current;
      if (!call) return;
      try {
        navigator.sendBeacon(
          `/api/collaboration/calls/${call.callId}/action`,
          new Blob([JSON.stringify({ action: 'end' })], { type: 'application/json' })
        );
      } catch {
        // Nothing more to do — the page is unloading regardless.
      }
    };
    window.addEventListener('pagehide', handleUnload);
    return () => window.removeEventListener('pagehide', handleUnload);
  }, []);

  return (
    <CallContext.Provider
      value={{
        callStatus,
        incomingCall,
        activeCall,
        localStream,
        remoteStream,
        errorMessage,
        startCall,
        acceptCall,
        rejectCall,
        endCall,
        toggleMute,
        toggleVideo
      }}
    >
      {children}
      <IncomingCallModal incomingCall={incomingCall} isOpen={callStatus === 'INCOMING'} onAccept={acceptCall} onReject={rejectCall} />
      <ActiveCallOverlay
        callStatus={callStatus}
        activeCall={activeCall}
        localStream={localStream}
        remoteStream={remoteStream}
        errorMessage={errorMessage}
        onEndCall={endCall}
        onToggleMute={toggleMute}
        onToggleVideo={toggleVideo}
      />
    </CallContext.Provider>
  );
}
