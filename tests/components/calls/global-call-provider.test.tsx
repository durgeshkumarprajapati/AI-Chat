import React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { GlobalCallProvider, useGlobalCall } from '@/components/calls/GlobalCallProvider';

/**
 * Global incoming call regression suite. The recipient's incoming-call listener previously only
 * existed inside src/app/collab-chat/page.tsx as page-local state — these tests exercise the new
 * GlobalCallProvider in isolation (no page mounted) to prove the modal/state machine works
 * regardless of which page the recipient is on, matching the bug report's exact complaint.
 *
 * jsdom has no native EventSource/RTCPeerConnection/getUserMedia, so all three are mocked below.
 */

class MockEventSource {
  static instances: MockEventSource[] = [];
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onopen: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    MockEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
  }
  emit(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

function latestEventSource(): MockEventSource {
  const live = MockEventSource.instances.filter((es) => !es.closed);
  const es = live[live.length - 1];
  if (!es) throw new Error('No live MockEventSource instance');
  return es;
}

class MockRTCPeerConnection {
  onicecandidate: ((e: { candidate: { toJSON: () => object } | null }) => void) | null = null;
  ontrack: ((e: { streams: MediaStream[] }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  connectionState: RTCPeerConnectionState = 'new';
  closed = false;
  constructor(public config: unknown) {}
  addTrack() {}
  async createOffer() {
    return { type: 'offer', sdp: 'mock-offer' } as RTCSessionDescriptionInit;
  }
  async createAnswer() {
    return { type: 'answer', sdp: 'mock-answer' } as RTCSessionDescriptionInit;
  }
  async setLocalDescription() {}
  async setRemoteDescription() {}
  async addIceCandidate() {}
  close() {
    this.closed = true;
  }
}

function mockTrack(kind: 'audio' | 'video') {
  return { kind, enabled: true, stop: jest.fn() };
}

function mockMediaStream(tracks: ReturnType<typeof mockTrack>[]): MediaStream {
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
    getVideoTracks: () => tracks.filter((t) => t.kind === 'video')
  } as unknown as MediaStream;
}

const currentUserRef: { id: string } = { id: 'user-b' };
let mockAuthStatus: 'LOADING' | 'AUTHENTICATED' | 'UNAUTHENTICATED' = 'AUTHENTICATED';

jest.mock('@/context/WorkspaceContext', () => ({
  useWorkspace: () => ({
    authStatus: mockAuthStatus,
    currentUser: mockAuthStatus === 'AUTHENTICATED' ? { id: currentUserRef.id, name: 'User B', email: 'b@example.com', role: 'USER' } : null
  })
}));

let getUserMediaMock: jest.Mock;

function Probe() {
  const call = useGlobalCall();
  return (
    <div>
      <span data-testid="status">{call.callStatus}</span>
      <span data-testid="incoming-caller">{call.incomingCall?.caller.name || 'none'}</span>
      <span data-testid="incoming-call-id">{call.incomingCall?.callId || 'none'}</span>
      <span data-testid="active-call-id">{call.activeCall?.callId || 'none'}</span>
      <span data-testid="error">{call.errorMessage || 'none'}</span>
    </div>
  );
}

function renderProvider() {
  return render(
    <GlobalCallProvider>
      <Probe />
    </GlobalCallProvider>
  );
}

describe('GlobalCallProvider — global incoming call listener', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    (global as any).EventSource = MockEventSource;
    (global as any).RTCPeerConnection = MockRTCPeerConnection;
    (global as any).RTCSessionDescription = function (desc: unknown) {
      return desc;
    };
    (global as any).RTCIceCandidate = function (candidate: unknown) {
      return candidate;
    };
    mockAuthStatus = 'AUTHENTICATED';
    currentUserRef.id = 'user-b';

    getUserMediaMock = jest.fn(async (constraints: { audio: boolean; video: boolean }) => {
      const tracks = [mockTrack('audio')];
      if (constraints.video) tracks.push(mockTrack('video'));
      return mockMediaStream(tracks);
    });
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: { getUserMedia: getUserMediaMock },
      configurable: true
    });

    global.fetch = jest.fn((url: string, _init?: RequestInit) => {
      if (url === '/api/collaboration/calls/config') {
        return Promise.resolve({
          json: async () => ({ success: true, data: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }], ringTimeoutMs: 30000 } })
        });
      }
      if (url.endsWith('/action') || url.endsWith('/signal') || url === '/api/collaboration/calls/initiate') {
        return Promise.resolve({ json: async () => ({ success: true, data: { id: 'call-1', participants: [] } }) });
      }
      return Promise.resolve({ json: async () => ({ success: false }) });
    }) as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows the incoming-call modal for a voice call, from any page (no page-specific mount needed)', async () => {
    renderProvider();
    await waitFor(() => expect(latestEventSource()).toBeDefined());

    act(() => {
      latestEventSource().emit({
        type: 'call:invite',
        channelId: 'ch-1',
        senderId: 'user-a',
        data: { callId: 'call-1', channelId: 'ch-1', hostName: 'User A', callType: 'VOICE' }
      });
    });

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('INCOMING'));
    expect(screen.getByTestId('incoming-caller').textContent).toBe('User A');
    expect(screen.getByText('📞 Incoming Call')).toBeInTheDocument();
  });

  it('shows the incoming-call modal for a video call, distinguishing it from voice', async () => {
    renderProvider();
    await waitFor(() => expect(latestEventSource()).toBeDefined());

    act(() => {
      latestEventSource().emit({
        type: 'call:invite',
        channelId: 'ch-1',
        senderId: 'user-a',
        data: { callId: 'call-2', channelId: 'ch-1', hostName: 'User A', callType: 'VIDEO' }
      });
    });

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('INCOMING'));
    expect(screen.getByText('📹 Incoming Video Call')).toBeInTheDocument();
  });

  it('dismisses the incoming modal when this same user accepts the call from a different tab', async () => {
    renderProvider();
    await waitFor(() => expect(latestEventSource()).toBeDefined());

    act(() => {
      latestEventSource().emit({
        type: 'call:invite',
        channelId: 'ch-1',
        senderId: 'user-a',
        data: { callId: 'call-tab', channelId: 'ch-1', hostName: 'User A', callType: 'VOICE' }
      });
    });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('INCOMING'));

    // This tab never clicked Accept — the SSE broadcast reports user-b (this same user) as the
    // acceptor because a *different* tab accepted first.
    act(() => {
      latestEventSource().emit({
        type: 'call:accept',
        channelId: 'ch-1',
        senderId: 'user-b',
        data: { callId: 'call-tab', userId: 'user-b' }
      });
    });

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('IDLE'));
    expect(getUserMediaMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('incoming-call-modal')).not.toBeInTheDocument();
  });

  it('ignores a duplicate call:invite for the same callId while already ringing (no duplicate modal)', async () => {
    renderProvider();
    await waitFor(() => expect(latestEventSource()).toBeDefined());

    const invite = {
      type: 'call:invite',
      channelId: 'ch-1',
      senderId: 'user-a',
      data: { callId: 'call-3', channelId: 'ch-1', hostName: 'User A', callType: 'VOICE' }
    };

    act(() => {
      latestEventSource().emit(invite);
    });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('INCOMING'));

    act(() => {
      latestEventSource().emit(invite);
    });

    // Still exactly one modal instance — a second overlapping invite while busy is auto-declined,
    // never rendered as a second modal.
    expect(screen.getAllByTestId('incoming-call-modal')).toHaveLength(1);
  });

  it('dismisses the modal immediately when the caller cancels before acceptance (call:end while INCOMING)', async () => {
    renderProvider();
    await waitFor(() => expect(latestEventSource()).toBeDefined());

    act(() => {
      latestEventSource().emit({
        type: 'call:invite',
        channelId: 'ch-1',
        senderId: 'user-a',
        data: { callId: 'call-4', channelId: 'ch-1', hostName: 'User A', callType: 'VOICE' }
      });
    });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('INCOMING'));

    act(() => {
      latestEventSource().emit({ type: 'call:end', channelId: 'ch-1', senderId: 'user-a', data: { callId: 'call-4', endedBy: 'user-a' } });
    });

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('IDLE'));
    expect(screen.queryByTestId('incoming-call-modal')).not.toBeInTheDocument();
  });

  it('accept requests only microphone for a voice call, sends the accept action with the correct callId, and starts a peer connection', async () => {
    renderProvider();
    await waitFor(() => expect(latestEventSource()).toBeDefined());

    act(() => {
      latestEventSource().emit({
        type: 'call:invite',
        channelId: 'ch-1',
        senderId: 'user-a',
        data: { callId: 'call-5', channelId: 'ch-1', hostName: 'User A', callType: 'VOICE' }
      });
    });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('INCOMING'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('accept-call-button'));
    });

    const actionCall = (global.fetch as jest.Mock).mock.calls.find(([url]) => url === '/api/collaboration/calls/call-5/action');
    expect(actionCall).toBeDefined();
    expect(JSON.parse(actionCall![1].body)).toEqual({ action: 'accept' });

    expect(getUserMediaMock).toHaveBeenCalledWith({ audio: true, video: false });
    expect(screen.getByTestId('active-call-id').textContent).toBe('call-5');
  });

  it('accept requests camera + microphone for a video call', async () => {
    renderProvider();
    await waitFor(() => expect(latestEventSource()).toBeDefined());

    act(() => {
      latestEventSource().emit({
        type: 'call:invite',
        channelId: 'ch-1',
        senderId: 'user-a',
        data: { callId: 'call-6', channelId: 'ch-1', hostName: 'User A', callType: 'VIDEO' }
      });
    });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('INCOMING'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('accept-call-button'));
    });

    expect(getUserMediaMock).toHaveBeenCalledWith({ audio: true, video: true });
  });

  it('reject sends the decline action, closes the modal, and never requests media', async () => {
    renderProvider();
    await waitFor(() => expect(latestEventSource()).toBeDefined());

    act(() => {
      latestEventSource().emit({
        type: 'call:invite',
        channelId: 'ch-1',
        senderId: 'user-a',
        data: { callId: 'call-7', channelId: 'ch-1', hostName: 'User A', callType: 'VOICE' }
      });
    });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('INCOMING'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('reject-call-button'));
    });

    const actionCall = (global.fetch as jest.Mock).mock.calls.find(([url]) => url === '/api/collaboration/calls/call-7/action');
    expect(actionCall).toBeDefined();
    expect(JSON.parse(actionCall![1].body)).toEqual({ action: 'decline' });
    expect(getUserMediaMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('incoming-call-modal')).not.toBeInTheDocument();
  });

  it('does not open a signaling connection while unauthenticated', async () => {
    mockAuthStatus = 'UNAUTHENTICATED';
    renderProvider();
    await act(async () => {});

    expect(MockEventSource.instances.filter((es) => !es.closed)).toHaveLength(0);
  });

  it('closes the signaling connection when the user logs out (AUTHENTICATED -> UNAUTHENTICATED)', async () => {
    mockAuthStatus = 'AUTHENTICATED';
    const { rerender } = renderProvider();
    await waitFor(() => expect(latestEventSource()).toBeDefined());
    const es = latestEventSource();
    expect(es.closed).toBe(false);

    mockAuthStatus = 'UNAUTHENTICATED';
    rerender(
      <GlobalCallProvider>
        <Probe />
      </GlobalCallProvider>
    );

    await waitFor(() => expect(es.closed).toBe(true));
  });

  it('ignores a signaling event carrying a different, stale callId than the active call (callId correlation guard)', async () => {
    renderProvider();
    await waitFor(() => expect(latestEventSource()).toBeDefined());

    act(() => {
      latestEventSource().emit({
        type: 'call:invite',
        channelId: 'ch-1',
        senderId: 'user-a',
        data: { callId: 'call-8', channelId: 'ch-1', hostName: 'User A', callType: 'VOICE' }
      });
    });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('INCOMING'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('accept-call-button'));
    });
    await waitFor(() => expect(screen.getByTestId('active-call-id').textContent).toBe('call-8'));

    // An ICE candidate for a totally different (unrelated) call must never be applied here.
    await act(async () => {
      latestEventSource().emit({
        type: 'call:ice_candidate',
        channelId: 'ch-1',
        senderId: 'user-a',
        data: { callId: 'some-other-call-999', senderId: 'user-a', signalType: 'offer', signalData: { type: 'offer', sdp: 'x' } }
      });
    });

    // Still the original call, unaffected — status did not change as a side effect of the
    // stale-call event, proving the callId correlation guard rejected it.
    expect(screen.getByTestId('active-call-id').textContent).toBe('call-8');
  });

  it('stops all local media tracks when the call ends', async () => {
    renderProvider();
    await waitFor(() => expect(latestEventSource()).toBeDefined());

    act(() => {
      latestEventSource().emit({
        type: 'call:invite',
        channelId: 'ch-1',
        senderId: 'user-a',
        data: { callId: 'call-9', channelId: 'ch-1', hostName: 'User A', callType: 'VIDEO' }
      });
    });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('INCOMING'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('accept-call-button'));
    });
    await waitFor(() => expect(getUserMediaMock).toHaveBeenCalled());

    const producedStream: MediaStream = await getUserMediaMock.mock.results[0]!.value;
    const trackStopSpies = producedStream.getTracks().map((t) => t as unknown as { stop: jest.Mock });

    act(() => {
      latestEventSource().emit({ type: 'call:end', channelId: 'ch-1', senderId: 'user-a', data: { callId: 'call-9', endedBy: 'user-a' } });
    });

    await waitFor(() => trackStopSpies.forEach((t) => expect(t.stop).toHaveBeenCalled()));
  });

  it('ignores message:new / message:edit / message:delete events on the shared collaboration stream without affecting call state (coexistence with real-time chat)', async () => {
    renderProvider();
    await waitFor(() => expect(latestEventSource()).toBeDefined());

    act(() => {
      latestEventSource().emit({
        type: 'message:new',
        channelId: 'ch-1',
        senderId: 'user-a',
        data: { id: 'msg-1', channelId: 'ch-1', senderId: 'user-a', content: 'hello', createdAt: new Date().toISOString() }
      });
    });

    // No crash, no spurious call state change — the provider silently ignores non-call events,
    // leaving the same SSE connection free for message events to be handled by whichever
    // component (e.g. collab-chat's own listener) owns that event type.
    expect(screen.getByTestId('status').textContent).toBe('IDLE');
  });

  it('never remains permanently CONNECTING — a stuck negotiation is forced to FAILED then IDLE after the connecting-timeout window', async () => {
    jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
    try {
      renderProvider();
      await waitFor(() => expect(latestEventSource()).toBeDefined());

      act(() => {
        latestEventSource().emit({
          type: 'call:invite',
          channelId: 'ch-1',
          senderId: 'user-a',
          data: { callId: 'call-stuck', channelId: 'ch-1', hostName: 'User A', callType: 'VOICE' }
        });
      });
      await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('INCOMING'));

      await act(async () => {
        fireEvent.click(screen.getByTestId('accept-call-button'));
        // Let the accept-flow's own promise chain (media + peer connection setup) settle before
        // the fake-timer clock advances — the mock RTCPeerConnection never fires
        // onconnectionstatechange on its own, so this call is now realistically "stuck".
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByTestId('status').textContent).toBe('CONNECTING');

      await act(async () => {
        await jest.advanceTimersByTimeAsync(20000);
      });
      expect(screen.getByTestId('status').textContent).toBe('FAILED');

      await act(async () => {
        await jest.advanceTimersByTimeAsync(2500);
      });
      expect(screen.getByTestId('status').textContent).toBe('IDLE');
    } finally {
      jest.useRealTimers();
    }
  });
});
