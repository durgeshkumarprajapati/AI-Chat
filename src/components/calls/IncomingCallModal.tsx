'use client';

import React from 'react';
import { Modal } from '@/components/ui/Modal';
import type { IncomingCallInfo } from '@/features/collaboration/webrtc/webrtc.types';

interface IncomingCallModalProps {
  incomingCall: IncomingCallInfo | null;
  isOpen: boolean;
  onAccept: () => void;
  onReject: () => void;
}

/** Global ringing screen — mounted once by GlobalCallProvider, so it renders above whatever
 * page the recipient is currently viewing, anywhere in the authenticated app. */
export function IncomingCallModal({ incomingCall, isOpen, onAccept, onReject }: IncomingCallModalProps) {
  if (!incomingCall) return null;

  const isVideo = incomingCall.callType === 'VIDEO';

  return (
    <Modal isOpen={isOpen} onClose={onReject} maxWidthClassName="max-w-sm">
      <div className="flex flex-col items-center text-center space-y-4 py-2" data-testid="incoming-call-modal">
        <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-primary">
          Incoming {isVideo ? 'Video' : 'Voice'} Call
        </p>
        <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-2xl font-extrabold text-primary">
          {incomingCall.caller.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">{incomingCall.caller.name}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {isVideo ? '📹 Incoming Video Call' : '📞 Incoming Call'}
          </p>
        </div>
        <div className="flex items-center justify-center space-x-4 pt-2 w-full">
          <button
            type="button"
            onClick={onReject}
            data-testid="reject-call-button"
            className="flex-1 h-11 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={onAccept}
            data-testid="accept-call-button"
            className="flex-1 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors"
          >
            Accept
          </button>
        </div>
      </div>
    </Modal>
  );
}
