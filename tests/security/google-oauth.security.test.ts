import { googleAuthService } from '@/features/integrations/google/google-auth.service';

describe('Google OAuth & Encrypted Token Security Tests', () => {
  test('encrypts and decrypts OAuth tokens at rest securely using AES-256-GCM', () => {
    const rawToken = 'ya29.a0AfH6SMB-google-oauth-access-token-sample-12345';

    const encrypted = googleAuthService.encryptToken(rawToken);
    expect(encrypted).not.toBe(rawToken);
    expect(encrypted).toContain(':');

    const decrypted = googleAuthService.decryptToken(encrypted);
    expect(decrypted).toBe(rawToken);
  });

  test('never exposes access or refresh tokens in user integration status payload', async () => {
    const status = await googleAuthService.getStatus('non-existent-user');
    expect(status.isConnected).toBe(false);
    expect((status as any).encryptedAccessToken).toBeUndefined();
    expect((status as any).encryptedRefreshToken).toBeUndefined();
  });
});
