import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto';

export class PasswordService {
  private readonly iterations = 100000;
  private readonly keyLength = 64;
  private readonly digest = 'sha512';

  /**
   * Hashes a plaintext password securely using PBKDF2 with a random salt.
   */
  public hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const hash = pbkdf2Sync(password, salt, this.iterations, this.keyLength, this.digest).toString('hex');
    return `${salt}:${hash}`;
  }

  /**
   * Verifies a plaintext password against a stored salt:hash string.
   */
  public verifyPassword(password: string, storedHash: string): boolean {
    if (!password || !storedHash || !storedHash.includes(':')) return false;

    const [salt, originalHash] = storedHash.split(':');
    if (!salt || !originalHash) return false;

    const computedHash = pbkdf2Sync(password, salt, this.iterations, this.keyLength, this.digest).toString('hex');

    const bufOriginal = Buffer.from(originalHash, 'hex');
    const bufComputed = Buffer.from(computedHash, 'hex');

    if (bufOriginal.length !== bufComputed.length) return false;
    return timingSafeEqual(bufOriginal, bufComputed);
  }

  /**
   * Validates minimum password strength requirements.
   */
  public validatePasswordStrength(password: string): { isValid: boolean; reason?: string } {
    if (!password || password.length < 8) {
      return { isValid: false, reason: 'Password must be at least 8 characters long.' };
    }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      return { isValid: false, reason: 'Password must contain both letters and numbers.' };
    }
    return { isValid: true };
  }

  /**
   * Generates a secure random password reset token.
   */
  public generateResetToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString('hex');
    const hash = pbkdf2Sync(token, 'reset_salt', 10000, 32, 'sha256').toString('hex');
    return { token, hash };
  }
}

export const passwordService = new PasswordService();
