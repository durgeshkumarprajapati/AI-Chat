import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

const ENCRYPTION_KEY = process.env.ENCRYPTION_SECRET_KEY || 'default-secret-key-32-chars-long!'; // Must be 32 chars
const ALGORITHM = 'aes-256-gcm';

function get32ByteKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

export class GoogleAuthService {
  /**
   * Encrypt plaintext string at rest using AES-256-GCM
   */
  public encryptToken(plaintext: string): string {
    const key = get32ByteKey(ENCRYPTION_KEY);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /**
   * Decrypt cipher string
   */
  public decryptToken(cipherText: string): string {
    const parts = cipherText.split(':');
    if (parts.length !== 3) return cipherText;

    const iv = Buffer.from(parts[0]!, 'hex');
    const authTag = Buffer.from(parts[1]!, 'hex');
    const encrypted = parts[2]!;

    const key = get32ByteKey(ENCRYPTION_KEY);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Generates Google OAuth 2.0 Auth URL
   */
  public getGoogleAuthUrl(userId: string): string {
    const clientId = process.env.GOOGLE_CLIENT_ID || 'mock-google-client-id';
    const redirectUri = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/integrations/google/callback`;

    const scope = encodeURIComponent('https://www.googleapis.com/auth/calendar.events');

    return `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&scope=${scope}&access_type=offline&prompt=consent&state=${userId}`;
  }

  /**
   * Saves or updates Google OAuth Integration with encrypted tokens
   */
  public async saveGoogleTokens(userId: string, accessToken: string, refreshToken?: string, googleEmail?: string) {
    const encryptedAccessToken = this.encryptToken(accessToken);
    const encryptedRefreshToken = refreshToken ? this.encryptToken(refreshToken) : undefined;

    return prisma.googleIntegration.upsert({
      where: { userId },
      create: {
        userId,
        email: googleEmail || 'user@gmail.com',
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiresAt: new Date(Date.now() + 3600 * 1000)
      },
      update: {
        email: googleEmail || undefined,
        encryptedAccessToken,
        encryptedRefreshToken: encryptedRefreshToken || undefined,
        tokenExpiresAt: new Date(Date.now() + 3600 * 1000)
      }
    });
  }

  /**
   * Disconnect Google Integration
   */
  public async disconnectGoogle(userId: string) {
    return prisma.googleIntegration.deleteMany({
      where: { userId }
    });
  }

  /**
   * Check connection status (Never returns tokens in response!)
   */
  public async getStatus(userId: string) {
    const integration = await prisma.googleIntegration.findUnique({
      where: { userId },
      select: { id: true, email: true, createdAt: true, updatedAt: true }
    });

    return {
      isConnected: Boolean(integration),
      email: integration?.email || null,
      updatedAt: integration?.updatedAt || null
    };
  }
}

export const googleAuthService = new GoogleAuthService();
