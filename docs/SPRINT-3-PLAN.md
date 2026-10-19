# VITRUV — Sprint 3 Plan

Goal: a fully CMS-driven public homepage.

Status: **Stage A + B + C done** (2026-10-16, uncommitted — CMS-ARCHITECTURE.md §9, §11, §12).
Awaiting owner review.

## Stage A — Complete homepage CMS editing coverage — ✅ done

Every homepage section has a working admin editor on the Sprint 2 lifecycle
(Edit → Draft → Preview → Publish):

| Section  | Editor | Preview / public    |
| -------- | ------ | ------------------- |
| Hero     | ✅     | production renderer |
| Results  | ✅     | production renderer |
| Journey  | ✅     | production renderer |
| Coaching | ✅     | production renderer |
| Packages | ✅     | production renderer |
| About    | ✅     | production renderer |
| FAQ      | ✅     | production renderer |
| CTA      | ✅     | production renderer |
| Footer   | ✅     | production renderer |

- No schema/DB change; contracts unchanged (forms follow the existing section schemas).
- Shared form infrastructure: `RepeatableList`, `TextListField`, `CtaFields`/`LinkFields`.
- Tests: editor interaction tests (happy-dom + Testing Library), contract valid/invalid cases per
  section, rolled-back integration test of the lifecycle for all six new types, Chrome E2E.

## Stage B — Production public homepage — ✅ done

- `/` is assembled from published CMS content (`GET /v1/public/website/pages/home`), server-rendered,
  through an exhaustive section registry; all nine section types have production renderers
  (Journey reuses `JourneyMapSection`). Admin preview uses the same renderers.
- Publish → API hook (after commit) → `/api/revalidate` (shared secret) → tag expired → next request
  shows the new content without rebuild/restart.
- `PATCH /v1/admin/website/pages/:slug/sections/:key` (`enabled`, `sortOrder`) — the narrow
  follow-up, API only (no admin UI yet); public order/visibility follow the database.
- Header/footer from CMS content; accessible `<dialog>` mobile menu; FAQ disclosure; hero/CTA
  glow-field fallback without media; `next/image` for CMS images; viewport-driven ambient video.
- Dev content change (intentional, via the admin API): footer navigation links added; hero primary
  CTA and CTA action point to `#cta` (the former `/#kontakt` had no target). The real contact
  target (form/booking) is still open.

Baseline for Stage C (production build, local, cold): ≈ 182 KB compressed JS, ≈ 142 KB fonts,
≈ 12 KB HTML, CLS 0, LCP ≈ 0.36 s (text LCP — no hero media assigned yet). Posters are not yet
optimised; no CDN; Section-level error isolation relies on contract validation.

## Stage C — SEO, performance, conversion hardening — ✅ done

- SEO settings (`seo` page-settings document, admin: Einstellungen), metadata, canonical from
  `PUBLIC_SITE_URL`, JSON-LD (WebSite, Organization, FAQPage), sitemap, robots, `SITE_INDEXING`.
- Contact path `/kontakt` (server action → `POST /v1/public/leads` → `website_leads`), honeypot,
  timing check, rate limits, no PII in logs, notification hook (no provider).
- Consent-gated analytics abstraction (no provider). Nonce CSP + security headers.
- Migration `0002_seo_and_leads` (additive): enum value `seo`, enum `website_lead_status`,
  table `website_leads`.

Measured (production build, local Chrome, cold cache, no hero media — lab data, not field data):

| Metric                | Before (Stage B) | After Stage C |
| --------------------- | ---------------: | ------------: |
| Initial compressed JS |         ≈ 182 KB |      152.7 KB |
| Web fonts             |    ≈ 142 KB (12) |   84.1 KB (6) |
| Requests on /         |               24 |            18 |
| CSS                   |          11.8 KB |       11.6 KB |
| CLS                   |                0 |             0 |
| Local LCP (text)      |    0.36–0.48 s\* |   0.19–0.44 s |

\* Text LCP (no hero media). With a temporary CMS hero image: LCP 0.96 s @1440, 0.43 s @390 3x,
image served as AVIF at the srcset width (1920 / 1200 / 640), CLS 0; INP approximation (FAQ toggle,
mobile menu) 32–64 ms. Causes: `import { type … }` from `@vitruv/contracts` shipped zod + all CMS
schemas to the browser (fixed with `import type`, lint rule
`@typescript-eslint/no-import-type-side-effects`, `sideEffects: false` on shared packages); fonts
preloaded latin-ext files that German text never uses (subset now `latin`). Remaining JS is
mostly framework (react-dom ≈ 71 KB, Next runtime ≈ 46 KB); app code ≈ 20 KB.

## Deferred beyond Sprint 3

Launch blockers: official SVG logo/favicon (never invented; `/favicon.ico` 404 stays), production
admin authentication, production object storage (S3), cross-browser check (Firefox/Safari/Edge),
production-compatible Philipp video (H.264/WebM derivative of the HEVC source), final legal texts
(Impressum, Datenschutz incl. lead retention), e-mail notification provider (if wanted), real
production `PUBLIC_SITE_URL` (https) and hosting. Also deferred: Flutter business features, admin
UI for section order/visibility and for leads.
