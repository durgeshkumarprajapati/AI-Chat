/** @type {import('next').NextConfig} */

// Phase 91 — Security headers.
//
// CSP note: the app has no external script/style CDNs and no cross-origin embeds (verified by
// grep — no fonts.googleapis/gstatic, no unpkg/jsdelivr, no analytics snippets), but it DOES rely
// on two categories of inline scripts that a strict, no-'unsafe-inline' CSP would break:
//   1. Next.js 14 App Router's own hydration/RSC-payload inline <script> tags.
//   2. `src/app/layout.tsx`'s inline flash-of-wrong-theme-prevention <script>.
// A nonce-based CSP (Next.js's documented approach for this) requires per-request middleware to
// mint a nonce, thread it onto both Next's own inline scripts and the theme script via a `nonce`
// prop, and read it back out in this config — real, testable surface area with real risk of
// silently breaking hydration or the theme script if any step is missed. Per this phase's brief,
// the safer choice given that risk is a still-meaningfully-hardened policy that keeps
// 'unsafe-inline' for script-src/style-src (a real gap vs. maximal strictness) while still: (a)
// blocking ALL cross-origin script/style/font/connect/frame sources outright (`'self'` only —
// this is the part that actually stops a large class of injected-script/data-exfiltration
// attacks), (b) blocking this app from being framed by anyone (`frame-ancestors 'none'`,
// mirrored by X-Frame-Options: DENY below — no feature here needs to be iframe-embedded), and
// (c) blocking plugin content entirely (`object-src 'none'`). Revisit nonce-based CSP if a
// future phase adds a real external script/style dependency that would otherwise force loosening
// this further.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Only meaningfully effective behind HTTPS termination; a proxy terminating plain HTTP simply
  // won't have this header respected by non-HTTPS clients, so it's always safe to send.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'"
    ].join('; ')
  }
];

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['amqplib', 'pg', 'redis', 'pdfjs-dist']
  },
  async headers() {
    return [
      {
        // Applied to every route. Verified this adds no Cache-Control (or any other) header that
        // would conflict with the SSE streaming routes' own no-cache headers
        // (/api/chat/stream, /api/assistant/chat, /api/collaboration/events) — this list is
        // security headers only, so there is nothing here for those routes to conflict with.
        source: '/:path*',
        headers: securityHeaders
      }
    ];
  }
};

export default nextConfig;
