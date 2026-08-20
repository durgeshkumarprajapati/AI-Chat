import { collabPubSubService } from '@/features/collaboration/pubsub.service';

describe('CollabCallService Unit Tests', () => {
  test('publishes call invite events to pubsub service correctly', () => {
    const publishedEvents: any[] = [];
    const unsubscribe = collabPubSubService.subscribe('ch-test-123', (evt) => {
      publishedEvents.push(evt);
    });

    collabPubSubService.publish('ch-test-123', {
      type: 'call:invite',
      channelId: 'ch-test-123',
      senderId: 'usr-1',
      data: { callId: 'call-1', callType: 'VOICE' },
      timestamp: new Date().toISOString()
    });

    expect(publishedEvents.length).toBe(1);
    expect(publishedEvents[0].type).toBe('call:invite');
    expect(publishedEvents[0].data.callType).toBe('VOICE');

    unsubscribe();
  });
});
