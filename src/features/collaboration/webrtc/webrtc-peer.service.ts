import type { CallMediaType, IceServerConfig } from './webrtc.types';

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
 */
export class WebRTCPeerConnectionManager {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private pendingRemoteCandidates: RTCIceCandidateInit[] = [];
  private remoteDescriptionSet = false;

  public async start(
    iceServers: IceServerConfig[],
    callType: CallMediaType,
    callbacks: PeerConnectionCallbacks
  ): Promise<MediaStream> {
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callType === 'VIDEO'
    });

    const pc = new RTCPeerConnection({ iceServers: iceServers as RTCIceServer[] });
    this.pc = pc;

    this.localStream.getTracks().forEach((track) => {
      pc.addTrack(track, this.localStream as MediaStream);
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        callbacks.onIceCandidate(event.candidate.toJSON());
      }
    };

    pc.ontrack = (event) => {
      if (event.streams[0]) {
        callbacks.onRemoteStream(event.streams[0]);
      }
    };

    pc.onconnectionstatechange = () => {
      callbacks.onConnectionStateChange(pc.connectionState);
    };

    return this.localStream;
  }

  public async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('Peer connection not started');
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  public async createAnswer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('Peer connection not started');
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    this.remoteDescriptionSet = true;
    await this.flushPendingCandidates();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  public async applyAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) return;
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    this.remoteDescriptionSet = true;
    await this.flushPendingCandidates();
  }

  public async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc) return;
    if (!this.remoteDescriptionSet) {
      this.pendingRemoteCandidates.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {
      // A late/duplicate/invalid candidate is not fatal to the call — ignore it.
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
      this.pc.close();
      this.pc = null;
    }
  }
}
