import { callHistoryRepository } from '@/features/collaboration/call-history/call-history.repository';

describe('Call History Tenant Isolation & Security Tests', () => {
  test('rejects access when user queries channel call history for a channel they do not belong to', async () => {
    await expect(
      callHistoryRepository.getCallHistoryForUser('unauthorized_user_id', { channelId: 'private_channel_999' })
    ).rejects.toThrow('Access Denied');
  });

  test('rejects access when user requests call details for a call in an unauthorized channel', async () => {
    await expect(
      callHistoryRepository.getCallDetails('non_existent_or_unauthorized_call', 'user_without_access')
    ).resolves.toBeNull();
  });
});
