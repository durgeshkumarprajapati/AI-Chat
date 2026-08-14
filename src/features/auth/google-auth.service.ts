import { prisma } from '@/lib/prisma';
import { SessionUser, sessionService } from './session.service';
import { UserRole, AuthProvider, UserStatus } from '@prisma/client';

export interface GoogleUserProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

export class GoogleAuthService {
  /**
   * Validates a Google OAuth credential payload/token safely and links/creates the user in PostgreSQL.
   */
  public async handleGoogleAuth(profile: GoogleUserProfile): Promise<{ user: SessionUser; sessionToken: string }> {
    if (!profile.email || !profile.emailVerified) {
      throw new Error('Unverified email from Google authentication is rejected.');
    }

    // 1. Check if user exists by googleId or email
    let user = await prisma.user.findFirst({
      where: {
        OR: [{ googleId: profile.googleId }, { email: profile.email.toLowerCase() }]
      }
    });

    if (!user) {
      // Create new USER with default role USER and authProvider GOOGLE
      user = await prisma.user.create({
        data: {
          email: profile.email.toLowerCase(),
          name: profile.name || profile.email.split('@')[0],
          googleId: profile.googleId,
          avatarUrl: profile.picture,
          role: UserRole.USER,
          authProvider: AuthProvider.GOOGLE,
          status: UserStatus.ACTIVE,
          emailVerified: true
        }
      });
    } else if (!user.googleId) {
      // Link googleId safely if verified email matches
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: profile.googleId,
          avatarUrl: user.avatarUrl || profile.picture
        }
      });
    }

    const sessionToken = await sessionService.createSession(user.id);
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        authProvider: user.authProvider,
        status: user.status,
        emailVerified: user.emailVerified,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt
      },
      sessionToken
    };
  }
}

export const googleAuthService = new GoogleAuthService();
