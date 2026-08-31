import { env } from '@/config/env';
import { configService } from '@/features/config';

export interface EmailSendResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface EmailProvider {
  send(_to: string, _subject: string, _html: string, _text: string): Promise<EmailSendResult>;
}

/**
 * Safe default: never actually sends anything. Used whenever email sending is not fully
 * configured/enabled, so the delivery path can always call `getEmailProvider().send(...)`
 * unconditionally without a separate "is email configured" branch at every call site.
 */
class NoopEmailProvider implements EmailProvider {
  public async send(): Promise<EmailSendResult> {
    return { success: false, error: 'Email provider not configured' };
  }
}

/**
 * Plain fetch()-based REST transactional email client — no new npm dependency. Modeled on a
 * generic "Bearer token + JSON body" transactional email API convention (e.g. Postmark/Resend/
 * SendGrid-style single-endpoint APIs all fit this rough shape). Since no real provider key will
 * ever be configured in this sandbox, the exact vendor payload shape matters less than the
 * abstraction being clean and this class's failure modes being safe (timeout-bounded, never
 * throws — always resolves to an EmailSendResult).
 */
class HttpEmailProvider implements EmailProvider {
  public async send(to: string, subject: string, html: string, text: string): Promise<EmailSendResult> {
    const apiKey = env.server?.EMAIL_API_KEY;
    if (!apiKey) {
      return { success: false, error: 'Email provider not configured' };
    }

    const endpoint = process.env.EMAIL_PROVIDER_ENDPOINT || 'https://api.example-email-provider.com/v1/emails';
    const fromAddress = await configService.getString('EMAIL_FROM_ADDRESS', 'notifications@example.com');
    const timeoutMs = await configService.getNumber('NOTIFICATION_DELIVERY_TIMEOUT_MS', 10000);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          from: fromAddress,
          to,
          subject,
          html,
          text
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        return { success: false, error: `Email provider returned ${response.status}: ${body.slice(0, 500)}` };
      }

      const data = await response.json().catch(() => ({}) as Record<string, unknown>);
      const providerMessageId =
        typeof data === 'object' && data !== null && 'id' in data ? String((data as Record<string, unknown>).id) : undefined;

      return { success: true, providerMessageId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    } finally {
      clearTimeout(timeout);
    }
  }
}

const noopProvider = new NoopEmailProvider();
const httpProvider = new HttpEmailProvider();

/**
 * Returns the no-op provider whenever EMAIL_API_KEY is absent or NOTIFICATION_EMAIL_ENABLED is
 * off — safe by construction, never a real network call in those cases.
 */
export async function getEmailProvider(): Promise<EmailProvider> {
  const emailEnabled = await configService.getBoolean('NOTIFICATION_EMAIL_ENABLED', false);
  if (!emailEnabled || !env.server?.EMAIL_API_KEY) {
    return noopProvider;
  }
  return httpProvider;
}
