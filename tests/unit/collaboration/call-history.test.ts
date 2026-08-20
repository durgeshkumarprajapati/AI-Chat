import { callHistoryMapper } from '@/features/collaboration/call-history/call-history.mapper';
import { CallStatus } from '@prisma/client';

describe('CallHistoryMapper Unit Tests', () => {
  test('formats duration correctly for completed call', () => {
    expect(callHistoryMapper.formatDuration(0, CallStatus.ENDED)).toBe('0 sec');
    expect(callHistoryMapper.formatDuration(45, CallStatus.ENDED)).toBe('45 sec');
    expect(callHistoryMapper.formatDuration(125, CallStatus.ENDED)).toBe('2 min');
    expect(callHistoryMapper.formatDuration(3720, CallStatus.ENDED)).toBe('1 hr 2 min');
  });

  test('formats duration correctly for missed or declined calls', () => {
    expect(callHistoryMapper.formatDuration(0, CallStatus.MISSED)).toBe('Missed');
    expect(callHistoryMapper.formatDuration(0, CallStatus.DECLINED)).toBe('Declined');
  });

  test('maps raw call session to DTO correctly', () => {
    const rawSession = {
      id: 'call_123',
      channelId: 'ch_456',
      hostId: 'usr_789',
      type: 'VIDEO',
      status: CallStatus.ENDED,
      startedAt: new Date('2026-08-20T10:00:00Z'),
      endedAt: new Date('2026-08-20T10:12:00Z'),
      durationSeconds: 720,
      createdAt: new Date('2026-08-20T10:00:00Z'),
      channel: { name: 'Engineering Group', type: 'GROUP' },
      host: { name: 'Alice', avatarUrl: null },
      participants: [
        { userId: 'usr_789', status: CallStatus.ENDED, user: { name: 'Alice', email: 'alice@test.com' } },
        { userId: 'usr_999', status: CallStatus.ENDED, user: { name: 'Bob', email: 'bob@test.com' } }
      ]
    };

    const dto = callHistoryMapper.mapToDTO(rawSession);

    expect(dto.id).toBe('call_123');
    expect(dto.isGroup).toBe(true);
    expect(dto.outcome).toBe('COMPLETED');
    expect(dto.durationSeconds).toBe(720);
    expect(dto.formattedDuration).toBe('12 min');
    expect(dto.participantCount).toBe(2);
  });
});
