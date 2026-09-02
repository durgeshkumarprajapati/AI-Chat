export type CallMediaType = 'VOICE' | 'VIDEO';
export type CallDirection = 'OUTGOING' | 'INCOMING';

/**
 * Global call state machine. Mirrors the IDLE -> OUTGOING/INCOMING -> CONNECTING -> ACTIVE ->
 * IDLE flow, with REJECTED/ENDED/FAILED as brief terminal-display states before returning to
 * IDLE (see GlobalCallProvider for the exact transitions and their timings).
 */
export type CallStatus =
  | 'IDLE'
  | 'OUTGOING'
  | 'INCOMING'
  | 'CONNECTING'
  | 'ACTIVE'
  | 'REJECTED'
  | 'ENDED'
  | 'FAILED';

export interface CallPeerInfo {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

export interface IncomingCallInfo {
  callId: string;
  channelId: string;
  callType: CallMediaType;
  caller: CallPeerInfo;
}

export interface ActiveCallInfo {
  callId: string;
  channelId: string;
  callType: CallMediaType;
  direction: CallDirection;
  peer: CallPeerInfo;
  isMuted: boolean;
  isVideoOff: boolean;
  startedAt: string;
}

export interface CallSignalEventData {
  callId: string;
  senderId: string;
  signalType: 'offer' | 'answer' | 'ice_candidate';
  signalData: unknown;
}

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}
