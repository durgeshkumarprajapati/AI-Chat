import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { voiceMessageStorageService } from '@/features/collaboration/voice-storage.service';
import { collaborationService } from '@/features/collaboration/collaboration.service';
import { prisma } from '@/lib/prisma';

describe('Security: Collaboration Voice Message Authorization', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('should prevent path traversal attacks in voice storage keys', () => {
    const maliciousKey = '../../../../etc/passwd';
    const resolvedPath = voiceMessageStorageService.getVoiceFilePath(maliciousKey);
    expect(resolvedPath).not.toContain('..');
  });

  it('should deny unauthorized user from sending voice message to private channel', async () => {
    (prisma as any).collabChannelMember = {
      findUnique: (jest.fn() as any).mockResolvedValue(null)
    };

    await expect(
      collaborationService.sendVoiceMessage('ch_private', 'user_hacker', Buffer.from('audio'), 'audio/webm', 4000)
    ).rejects.toThrow(/Access Denied/);
  });
});
