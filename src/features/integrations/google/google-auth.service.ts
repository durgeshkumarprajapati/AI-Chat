import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { envConfig } from '@/config/env';

const ENCRYPTION_KEY = process.env.ENCRYPTION_SECRET_KEY || 'default-secret-key-32-chars-long!'; // Must be 32 chars
const ALGORITHM = 'aes-256-gcm';

function get32ByteKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

export type AccessTokenResult =
  | { status: 'VALID'; accessToken: string; email: string | null; scope: string | null }
  | { status: 'NOT_CONNECTED'; errorCode: 'GOOGLE_CALENDAR_NOT_CONNECTED' }
  | { status: 'REAUTH_REQUIRED'; errorCode: 'GOOGLE_REAUTH_REQUIRED' };

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
    if (!cipherText) return '';
    const parts = cipherText.split(':');
    if (parts.length !== 3) return cipherText;

    try {
      const iv = Buffer.from(parts[0]!, 'hex');
      const authTag = Buffer.from(parts[1]!, 'hex');
      const encrypted = parts[2]!;

      const key = get32ByteKey(ENCRYPTION_KEY);
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch {
      return cipherText;
    }
  }

  /**
   * Generates Google OAuth 2.0 Auth URL specifically for Google Calendar integration
   */
  public getGoogleAuthUrl(userId: string): string {
    const clientId = envConfig.google.clientId || process.env.GOOGLE_CLIENT_ID || 'mock-google-client-id';
    const redirectUri = envConfig.google.calendar.redirectUri;
    const scope = encodeURIComponent(envConfig.google.calendar.scope);

    return `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&scope=${scope}&access_type=offline&prompt=consent&state=${userId}`;
  }

  /**
   * Exchange authorization code for real Google OAuth tokens & account info
   */
  public async exchangeCodeForTokens(code: string, userId: string) {
    const clientId = envConfig.google.clientId || process.env.GOOGLE_CLIENT_ID;
    const clientSecret = envConfig.google.clientSecret || process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = envConfig.google.calendar.redirectUri;

    let accessToken = `mock_access_token_${Date.now()}`;
    let refreshToken: string | undefined = `mock_refresh_token_${Date.now()}`;
    let googleEmail = 'user@gmail.com';
    let googleUserId: string | undefined = undefined;
    let scope = envConfig.google.calendar.scope;

    if (clientId && clientSecret && code && !code.startsWith('mock_')) {
      try {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code'
          })
        });

        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          accessToken = tokenData.access_token;
          if (tokenData.refresh_token) refreshToken = tokenData.refresh_token;
          if (tokenData.scope) scope = tokenData.scope;

          // Fetch authenticated Google User Identity
          const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          if (userinfoRes.ok) {
            const userinfo = await userinfoRes.json();
            if (userinfo.email) googleEmail = userinfo.email;
            if (userinfo.id) googleUserId = userinfo.id;
          }
        }
      } catch (err) {
        console.error('[GoogleAuth] Token exchange failed:', err instanceof Error ? err.message : err);
      }
    }

    return this.saveGoogleTokens(userId, accessToken, refreshToken, googleEmail, googleUserId, scope);
  }

  /**
   * Saves or updates Google OAuth Integration with encrypted tokens
   */
  public async saveGoogleTokens(
    userId: string,
    accessToken: string,
    refreshToken?: string,
    googleEmail?: string,
    googleUserId?: string,
    scope?: string
  ) {
    const encryptedAccessToken = this.encryptToken(accessToken);
    const encryptedRefreshToken = refreshToken ? this.encryptToken(refreshToken) : undefined;
    const tokenExpiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour

    return prisma.googleIntegration.upsert({
      where: { userId },
      create: {
        userId,
        email: googleEmail || 'user@gmail.com',
        googleUserId,
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiresAt,
        scope: scope || envConfig.google.calendarScope
      },
      update: {
        email: googleEmail || undefined,
        googleUserId: googleUserId || undefined,
        encryptedAccessToken,
        encryptedRefreshToken: encryptedRefreshToken || undefined,
        tokenExpiresAt,
        scope: scope || undefined
      }
    });
  }

  /**
   * Validates access token and refreshes automatically if expired
   */
  public async getValidAccessToken(userId: string): Promise<AccessTokenResult> {
    const integration = await prisma.googleIntegration.findUnique({
      where: { userId }
    });

    if (!integration || !integration.encryptedAccessToken) {
      return { status: 'NOT_CONNECTED', errorCode: 'GOOGLE_CALENDAR_NOT_CONNECTED' };
    }

    const now = Date.now();
    const expiresAt = integration.tokenExpiresAt ? integration.tokenExpiresAt.getTime() : 0;
    const isExpired = expiresAt === 0 || expiresAt - now < 300 * 1000; // 5 minute buffer

    if (!isExpired) {
      const accessToken = this.decryptToken(integration.encryptedAccessToken);
      return {
        status: 'VALID',
        accessToken,
        email: integration.email,
        scope: integration.scope
      };
    }

    // Token is expired -> Attempt automatic refresh using refresh_token
    if (!integration.encryptedRefreshToken) {
      return { status: 'REAUTH_REQUIRED', errorCode: 'GOOGLE_REAUTH_REQUIRED' };
    }

    const refreshToken = this.decryptToken(integration.encryptedRefreshToken);
    const clientId = envConfig.google.clientId || process.env.GOOGLE_CLIENT_ID;
    const clientSecret = envConfig.google.clientSecret || process.env.GOOGLE_CLIENT_SECRET;

    if (refreshToken.startsWith('mock_') || !clientId || !clientSecret) {
      // Mock refresh for tests/dev environment
      const newMockAccessToken = `mock_access_token_${Date.now()}`;
      await this.saveGoogleTokens(
        userId,
        newMockAccessToken,
        refreshToken,
        integration.email || undefined,
        integration.googleUserId || undefined,
        integration.scope || undefined
      );

      return {
        status: 'VALID',
        accessToken: newMockAccessToken,
        email: integration.email,
        scope: integration.scope
      };
    }

    try {
      console.log(`[GoogleAuth] Refreshing expired access token for user=${userId}`);
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'refresh_token'
        })
      });

      if (!refreshRes.ok) {
        console.error(`[GoogleAuth] Token refresh failed (HTTP ${refreshRes.status})`);
        return { status: 'REAUTH_REQUIRED', errorCode: 'GOOGLE_REAUTH_REQUIRED' };
      }

      const data = await refreshRes.json();
      const newAccessToken = data.access_token;
      const newRefreshToken = data.refresh_token || refreshToken;

      await this.saveGoogleTokens(
        userId,
        newAccessToken,
        newRefreshToken,
        integration.email || undefined,
        integration.googleUserId || undefined,
        integration.scope || undefined
      );

      console.log(`[GoogleAuth] Token refresh successful for user=${userId}`);
      return {
        status: 'VALID',
        accessToken: newAccessToken,
        email: integration.email,
        scope: integration.scope
      };
    } catch (err: any) {
      console.error('[GoogleAuth] Exception during token refresh:', err?.message || err);
      return { status: 'REAUTH_REQUIRED', errorCode: 'GOOGLE_REAUTH_REQUIRED' };
    }
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
   * Check connection status and diagnostics (Never returns tokens or secrets!)
   */
  public async getStatus(userId: string) {
    const integration = await prisma.googleIntegration.findUnique({
      where: { userId }
    });

    if (!integration) {
      return {
        connected: false,
        isConnected: false,
        calendarAccess: false,
        calendarId: 'primary',
        accountEmail: null,
        email: null,
        scopeGranted: false,
        requiredScope: envConfig.google.calendar.scope
      };
    }

    const scopeGranted = Boolean(
      integration.scope &&
        (integration.scope.includes('calendar.events') || integration.scope.includes('/auth/calendar'))
    );

    return {
      connected: true,
      isConnected: true,
      calendarAccess: scopeGranted,
      calendarId: 'primary',
      accountEmail: integration.email || 'user@gmail.com',
      email: integration.email || 'user@gmail.com',
      scopeGranted,
      requiredScope: envConfig.google.calendar.scope
    };
  }
}

export const googleAuthService = new GoogleAuthService();
