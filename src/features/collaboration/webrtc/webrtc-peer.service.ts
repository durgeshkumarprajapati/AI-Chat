import type { CallMediaType, IceServerConfig } from './webrtc.types';
import { createLogger } from '@/lib/structured-logger';

const rtcLog = createLogger('webrtc-peer');

export interface PeerConnectionCallbacks {
  onIceCandidate: (candidate: RTCIceCandidateInit) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
}

/**
 * Thin wrapper around a single RTCPeerConnection + local getUserMedia stream for one call.
 * One instance per active call — always call cleanup() when the call ends so tracks are stopped
 * and the connection is closed, per the project's existing "stop every track on cleanup"
 * convention (mirrors the voice-message recorder in collab-chat/page.tsx).
 *
 * ICE candidates that arrive before the remote description is set (a normal, common race with
 * trickle ICE) are buffered and flushed once setRemoteDescription resolves.
 *
 * Phase 91.8 — every state transition is logged via the existing structured logger (never SDP
 * bodies, ICE credentials, or any token/cookie — only callId + state names), so a real connection
 * failure can be diagnosed from server-safe logs without opening a browser devtools session.
 */
export class WebRTCPeerConnectionManager {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private pendingRemoteCandidates: RTCIceCandidateInit[] = [];
  private remoteDescriptionSet = false;
  private callId = 'unknown';

  public async start(
    iceServers: IceServerConfig[],
    callType: CallMediaType,
    callbacks: PeerConnectionCallbacks,
    callId?: string
  ): Promise<MediaStream> {
    this.callId = callId || 'unknown';

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'VIDEO'
      });
      rtcLog.info('GET_USER_MEDIA_SUCCESS', { callId: this.callId, callType });
    } catch (err) {
      rtcLog.warn('GET_USER_MEDIA_FAILED', { callId: this.callId, callType, reason: err instanceof Error ? err.name : 'unknown' });
      throw err;
    }

    const pc = new RTCPeerConnection({ iceServers: iceServers as RTCIceServer[] });
    this.pc = pc;

    this.localStream.getTracks().forEach((track) => {
      pc.addTrack(track, this.localStream as MediaStream);
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        rtcLog.info('ICE_CANDIDATE_GENERATED', { callId: this.callId, candidateType: event.candidate.type });
        callbacks.onIceCandidate(event.candidate.toJSON());
      }
    };

    pc.ontrack = (event) => {
      rtcLog.info('REMOTE_TRACK_RECEIVED', { callId: this.callId, kind: event.track.kind });
      if (event.streams[0]) {
        callbacks.onRemoteStream(event.streams[0]);
      }
    };

    pc.onconnectionstatechange = () => {
      rtcLog.info('CONNECTION_STATE_CHANGE', { callId: this.callId, connectionState: pc.connectionState });
      callbacks.onConnectionStateChange(pc.connectionState);
    };

    pc.oniceconnectionstatechange = () => {
      rtcLog.info('ICE_CONNECTION_STATE_CHANGE', { callId: this.callId, iceConnectionState: pc.iceConnectionState });
    };

    pc.onicegatheringstatechange = () => {
      rtcLog.info('ICE_GATHERING_STATE_CHANGE', { callId: this.callId, iceGatheringState: pc.iceGatheringState });
    };

    pc.onsignalingstatechange = () => {
      rtcLog.info('SIGNALING_STATE_CHANGE', { callId: this.callId, signalingState: pc.signalingState });
    };

    return this.localStream;
  }

  public async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('Peer connection not started');
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    rtcLog.info('OFFER_CREATED', { callId: this.callId });
    return offer;
  }

  public async createAnswer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('Peer connection not started');
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    rtcLog.info('REMOTE_DESCRIPTION_APPLIED', { callId: this.callId, role: 'answerer' });
    this.remoteDescriptionSet = true;
    await this.flushPendingCandidates();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    rtcLog.info('ANSWER_CREATED', { callId: this.callId });
    return answer;
  }

  public async applyAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) return;
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    rtcLog.info('REMOTE_DESCRIPTION_APPLIED', { callId: this.callId, role: 'offerer' });
    this.remoteDescriptionSet = true;
    await this.flushPendingCandidates();
  }

  public async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc) return;
    if (!this.remoteDescriptionSet) {
      rtcLog.info('ICE_CANDIDATE_BUFFERED', { callId: this.callId });
      this.pendingRemoteCandidates.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      rtcLog.info('ICE_CANDIDATE_ADDED', { callId: this.callId });
    } catch (err) {
      // A late/duplicate/invalid candidate is not fatal to the call — log and ignore it.
      rtcLog.warn('ICE_CANDIDATE_ADD_FAILED', { callId: this.callId, reason: err instanceof Error ? err.name : 'unknown' });
    }
  }

  private async flushPendingCandidates(): Promise<void> {
    const queued = this.pendingRemoteCandidates;
    this.pendingRemoteCandidates = [];
    for (const candidate of queued) {
      await this.addIceCandidate(candidate);
    }
  }

  public setMuted(muted: boolean): void {
    this.localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }

  public setVideoEnabled(enabled: boolean): void {
    this.localStream?.getVideoTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  public cleanup(): void {
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
    this.pendingRemoteCandidates = [];
    this.remoteDescriptionSet = false;
    if (this.pc) {
      this.pc.onicecandidate = null;
      this.pc.ontrack = null;
      this.pc.onconnectionstatechange = null;
      this.pc.oniceconnectionstatechange = null;
      this.pc.onicegatheringstatechange = null;
      this.pc.onsignalingstatechange = null;
      this.pc.close();
      this.pc = null;
    }
  }
}
