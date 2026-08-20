import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { voiceMessageStorageService } from '@/features/collaboration/voice-storage.service';
import { collaborationService } from '@/features/collaboration/collaboration.service';
import { prisma } from '@/lib/prisma';

describe('Voice Message Unit Test Suite', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('should validate voice payload size and MIME type correctly', () => {
    const validBuffer = Buffer.from('mock audio bytes');
    expect(() =>
      voiceMessageStorageService.validateVoiceUpload(validBuffer, 'audio/webm;codecs=opus', 5000)
    ).not.toThrow();

    const oversizedBuffer = Buffer.alloc(15 * 1024 * 1024); // 15MB
    expect(() =>
      voiceMessageStorageService.validateVoiceUpload(oversizedBuffer, 'audio/webm', 5000)
    ).toThrow(/exceeds limit/);
  });

  it('should enforce rate limits on voice message uploads per minute', async () => {
    const mockChannelMember = {
      id: 'mem_1',
      channelId: 'ch_1',
      userId: 'user_spammer',
      channel: { members: [{ userId: 'user_spammer' }] }
    };

    (prisma as any).collabChannelMember = {
      findUnique: (jest.fn() as any).mockResolvedValue(mockChannelMember)
    };
    (prisma as any).collabMessage = {
      count: (jest.fn() as any).mockResolvedValue(15) // > 10 rate limit
    };

    await expect(
      collaborationService.sendVoiceMessage('ch_1', 'user_spammer', Buffer.from('audio'), 'audio/webm', 3000)
    ).rejects.toThrow(/rate limit exceeded/);
  });
});
