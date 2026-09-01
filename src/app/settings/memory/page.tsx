import { redirect } from 'next/navigation';

/**
 * Phase 90 spec names this page `/settings/memory`. The real implementation lives
 * at `/settings/copilot-memory` (the pre-existing memory-transparency page, now
 * extended into the full memory control center) to avoid duplicating the same
 * data/UI behind two URLs. This route is a thin alias for convenience/discoverability.
 */
export default function MemorySettingsRedirectPage() {
  redirect('/settings/copilot-memory');
}
