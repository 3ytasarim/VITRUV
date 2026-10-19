# VITRUV — CMS Architecture

Status: **implemented** (Sprint 2 + Sprint 3 Stage A: editors for all nine sections). Database, API, admin UI (Website → Übersicht /
Inhalte / Medien / Einstellungen), media library and draft previews exist. The public homepage
is assembled from this content in Sprint 3. Since Sprint 4 the admin requires a real login —
see [§8 Auth boundary](#8-auth-boundary) and [AUTH-ARCHITECTURE.md](AUTH-ARCHITECTURE.md).

## 1. Goal and rules

The coach edits every editorial text, image and video of the public website in the admin panel,
without a deployment. Rendering stays predictable because content is **typed per section**.

- Editorial media is never hardcoded in React components or `public/` (project rules).
- Admin changes never alter the public website until **Veröffentlichen** is pressed.
- Invalid content never reaches the public rendering layer: it is validated on save, again on
  publish, and the public API re-checks the public contract before returning a section.
- CMS text is plain, structured text — no HTML, no Markdown. Rich text would get its own
  sanitization architecture first.

## 2. Data model (migration `0001_website_cms.sql`)

```
website_pages              stable pages                       ('home')
  id, slug unique, title, content_revision, last_published_at, timestamps

website_sections           stable page structure               (hero, results, journey …)
  id, page_id → pages (RESTRICT), key (unique per page), type website_section_type,
  sort_order, enabled, timestamps

website_section_versions   typed content documents
  id, section_id → sections (RESTRICT), status website_version_status (DRAFT|PUBLISHED|ARCHIVED),
  content jsonb (object), schema_version, created_by/updated_by/published_by → users (SET NULL),
  published_at, archived_at, timestamps
  ✓ at most ONE draft per section     (partial unique index)
  ✓ at most ONE published per section (partial unique index)
  ✓ DRAFT ⇔ published_at IS NULL; ARCHIVED ⇔ archived_at IS NOT NULL; content is a JSON object

website_media_slots        explicit media references of live (DRAFT/PUBLISHED) versions
  version_id → versions (CASCADE), role text, asset_id → media_assets (RESTRICT)
  PK (version_id, role); index on asset_id

media_assets (+ purpose media_purpose)   WEBSITE | TRAINING_VIDEO | NUTRITION | CLIENT_UPLOAD | FEEDBACK_VIDEO
```

Why this shape:

- **Not one site-wide blob:** each section is validated, versioned and published on its own; an
  error in the FAQ can not break the hero.
- **Not dozens of tables:** a typed JSON document per section version avoids a migration for every
  copy field while Zod keeps full validation. Repeating items (FAQ entries, stages, packages) are
  typed arrays with **stable item IDs**. Anything that later needs relational queries (e.g. packages
  linked to checkout) graduates to its own table.
- **Explicit media references:** content stores only `{ assetId }`; `website_media_slots` mirrors
  every reference with its role so usage and delete protection are plain SQL with a real foreign key.

## 3. Typed section schemas (`packages/contracts/src/cms/`)

| Type       | Content                                                                                               | Media kinds (desktop/mobile) |
| ---------- | ----------------------------------------------------------------------------------------------------- | ---------------------------- |
| `hero`     | eyebrow?, title, highlight?, body?, primaryCta, secondaryCta?, media                                  | image or video (+ poster)    |
| `results`  | eyebrow?, title, intro?, items[] {id, value, label, description?, media}                              | image                        |
| `journey`  | eyebrow, title, lead?, stages[1–8] {id, name, title, description, media, enabled} (≥1 visible)        | image or video (+ poster)    |
| `coaching` | eyebrow?, title, intro?, features[] {id, title, description}, media                                   | image or video               |
| `packages` | eyebrow?, title, intro?, packages[] {id, name, tagline?, priceLabel?, features[], cta, highlighted}   | —                            |
| `about`    | eyebrow?, title, paragraphs[1–8], highlights[] {id, value, label}, media                              | image or video               |
| `faq`      | eyebrow?, title, items[1–40] {id, question, answer}                                                   | —                            |
| `cta`      | eyebrow?, title, body?, action, media                                                                 | image or video               |
| `footer`   | tagline?, navigation[], legal[], contact {email?, phone?, location?}, social[] {platform, https href} | —                            |

- Every schema is defined once and instantiated twice: **stored** (`sectionContentSchemas`, media
  as references) and **public** (`publicSectionContentSchemas`, media resolved to URLs), so the
  editable and rendered models can not drift.
- `packages.priceLabel` is display text only; there is no pricing or payment logic.
- Links (`ctaSchema`, `linkItemSchema`): internal paths (`/…`, not `//`), `#anchors`, `https://`,
  `mailto:`, `tel:`. Rejected: `javascript:`, `data:`, `vbscript:`, `http:`, protocol-relative
  URLs, credentials in URLs, whitespace/control-character tricks (`isSafeHref`). Social links:
  `https://` only.
- Text: trimmed, length-limited, no control characters.
- The **Journey** component (`apps/web/src/components/journey`) renders exactly
  `PublicSectionContent<'journey'>` — its types are derived from the contract; the display number
  ("01") comes from position, so reordering renumbers automatically.

## 4. Draft → preview → publish lifecycle

```
PUBLISHED (public) ──edit──▶ DRAFT (one per section, edited in place) ──preview──▶ admin preview
        ▲                                                   │
        └──────────────── Publish (one transaction) ◀───────┘
```

1. **Save draft** — `PUT /v1/admin/website/pages/:slug/sections/:key/draft`
   (`website.content.write`). In one transaction: lock the section row, validate content with the
   type schema, check media references, upsert the single DRAFT row, rewrite its slot rows.
   Missing image alt text is a **warning** here. The public website is unchanged.
2. **Preview** — `GET …/preview` (`website.content.read`) returns the draft (or the published
   version if there is no draft) with media resolved and hidden Journey stages removed. The admin
   renders it at `/admin/website/vorschau/<key>` (noindex, not linked publicly).
3. **Publish** — `POST …/publish` (`website.content.publish`). One transaction:
   lock section → load draft (409 if none) → **re-validate** content + media (schema drift,
   deleted/private media, now **required** alt text) → current PUBLISHED → ARCHIVED (+ its slot rows
   released) → DRAFT → PUBLISHED (`published_at/by`) → `website_pages.content_revision += 1`.
   Visitors see the old or the new version, never a mix. Any validation error rolls everything back.
4. **Discard draft** — `DELETE …/draft` removes the working copy; the published version stays.

History: every publish keeps the previous version as `ARCHIVED` with its content, publisher and
timestamps (auditable). Draft edits between publishes are not versioned individually. No revision
UI yet. Archived versions do not pin media — restoring one later must re-validate its references.

## 5. Media

**Library** (`/v1/admin/media`, admin page `Website → Medien`):

| Action          | Permission             | Behaviour                                                                                                  |
| --------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| list / detail   | `website.media.read`   | Website assets only (`purpose = WEBSITE`), usage count; detail lists each usage (page/section/role/status) |
| upload          | `website.media.write`  | multipart; see safety below                                                                                |
| update alt text | `website.media.write`  | file itself is immutable                                                                                   |
| delete          | `website.media.delete` | **409 CONFLICT with usage details** while any draft/published version references it                        |

Upload safety: MIME allow-list (JPEG, PNG, WebP, AVIF, MP4, WebM — no SVG/HTML/QuickTime), the
**bytes are sniffed** and must match the declared type, per-kind size limits (20 MB / 100 MB,
env-configurable), HEVC/H.265 MP4s are rejected with a hint to upload an H.264/WebM derivative,
storage keys are generated server-side (`public/website/<yyyy>/<mm>/<uuid>.<ext>`), the client file
name is only stored (sanitised) for display. Image dimensions (PNG/JPEG/WebP/AVIF) and MP4
duration/dimensions are read from headers without external tools; WebM metadata stays unknown.
`Philip.mp4` (HEVC) is **not** uploaded or transcoded — a browser-ready H.264/WebM derivative is
still required.

**Delete protection:** the asset row is locked (`FOR UPDATE`) while usage is checked; the slot FK is
`ON DELETE RESTRICT`, so the database itself refuses to delete referenced media (a concurrent draft
save waits and then fails cleanly). The stored object is removed after commit.

**Slots and roles:** a media field is `MediaSlot | null` = `{ desktop, mobile?, poster? }`, each a
`{ assetId, altText?, focalPoint? }` reference. Roles are paths using item IDs, e.g.
`media.desktop`, `stages.kraft.media.mobile` — reordering never changes them. Rules (API): desktop
required once media is set; mobile has the same kind as desktop and falls back to desktop when
absent; posters are images; accepted kinds per section type (`SECTION_MEDIA_KINDS`).

**Alt text:** default on the asset; a placement can override it or set `altText: ""` =
**decorative** (rendered `alt=""`/`aria-hidden`). Images without effective alt text can be saved as
drafts (warning) but not published. Videos are treated as ambient/decorative.

**Delivery:** the API resolves references to URLs; frontends never build storage URLs.
Development: the API serves `PUBLIC` objects at `/media/<key>` (local driver only, `public/` keys
only, `nosniff`, `CSP: sandbox`, byte ranges for video). Production: `PUBLIC_MEDIA_BASE_URL`
(CDN/public bucket).

## 6. Public read API

`GET /v1/public/website/pages/:slug` → `publicWebsitePageSchema`:
`{ slug, title, contentRevision, publishedAt, sections: [{ key, type, content }] }`.

- Selects **only** `status = 'PUBLISHED'` versions of **enabled** sections (SQL join) — drafts can
  not leak; covered by integration tests that save a draft and assert the response is unchanged.
- No user IDs, storage keys, version IDs or draft flags in the payload; media resolved.
- Each section is re-validated against the public contract; an invalid one is omitted and logged
  as an error instead of reaching the renderer half-valid.
- Caching: `ETag: W/"<slug>-<contentRevision>"`, `Cache-Control: public, max-age=0, must-revalidate`,
  `304` on `If-None-Match`.

## 7. Cache invalidation

`website_pages.content_revision` increases with every public change. After commit the API calls
`onPublished({ pageSlug, sectionKey, contentRevision, publishedAt, reason })`, wired to the web
app's `/api/revalidate` (see §11). Failures are logged, never rolled back. No CDN purge yet.

## 8. Auth boundary

Service permissions (`packages/shared/src/roles.ts`):

| Permission                | ADMIN | COACH | CLIENT |
| ------------------------- | ----- | ----- | ------ |
| `website.content.read`    | ✓     | –     | –      |
| `website.content.write`   | ✓     | –     | –      |
| `website.content.publish` | ✓     | –     | –      |
| `website.media.read`      | ✓     | –     | –      |
| `website.media.write`     | ✓     | –     | –      |
| `website.media.delete`    | ✓     | –     | –      |

**The Website CMS belongs to ADMIN alone** (since the Sprint 5 follow-up; before, COACH could edit
and publish). A coach who must manage the website gets an ADMIN account. COACH users see no
Website navigation, `/admin/website/*` (incl. previews) answers 404 for them, and every
`/v1/admin/website/*` and `/v1/admin/media*` call answers 403.

Every admin route uses `requirePermission(...)`; the principal is set only by
`authenticate(resolver)` (Sprint 4). The panel itself requires `admin.access` (ADMIN, COACH);
CLIENT accounts see "Kein Zugriff".

- **Session resolver** (production): `Authorization: Bearer <access token>` → `auth_sessions` →
  `users` (role + status from the database on every request).
- **Development adapter** (`DEV_AUTH=enabled`, never in production): shared-secret header for
  local scripted API tooling only, chained after the session resolver.

The web admin calls the API server-side (server components, server actions, the upload proxy
`/admin/api/media`) with the signed-in user's access token from the HttpOnly session cookie;
the token never reaches browser JavaScript. `/admin/*` requires a session (proxy → `/login`;
the admin layout verifies the user via `/v1/auth/me`), mutations are origin-checked and
responses are `private, no-store`. Server actions re-validate their inputs. Details:
[AUTH-ARCHITECTURE.md](AUTH-ARCHITECTURE.md).

## 9. Admin UI (`apps/web/src/app/admin`)

- `(shell)/website` — Übersicht (counts from the API), `inhalte` (section list with real status
  badges), `inhalte/[key]` (editor), `medien` (library), `einstellungen` (placeholder).
- Editors — one per section type, all on the same lifecycle (the shell `SectionEditor` handles
  save / publish / discard / preview, the unsaved-change guard and error mapping; `EDITORS` is a
  complete `Record<WebsiteSectionType, …>`, so a new type does not compile without an editor):

  | Section  | Editor            | Repeated items (stable IDs)                  | Media                 |
  | -------- | ----------------- | -------------------------------------------- | --------------------- |
  | Hero     | ✅ HeroEditor     | —                                            | desktop/mobile/poster |
  | Results  | ✅ ResultsEditor  | items (value, label, description, media)     | per item (images)     |
  | Journey  | ✅ JourneyEditor  | stages (+ visible toggle)                    | per stage             |
  | Coaching | ✅ CoachingEditor | features (title, description)                | section medium        |
  | Packages | ✅ PackagesEditor | packages (+ feature lines, CTA, highlighted) | —                     |
  | About    | ✅ AboutEditor    | paragraphs (strings), highlights             | portrait/medium       |
  | FAQ      | ✅ FaqEditor      | questions                                    | —                     |
  | CTA      | ✅ CtaEditor      | —                                            | background            |
  | Footer   | ✅ FooterEditor   | navigation, legal links, social profiles     | —                     |

- Shared form infrastructure (`components/admin/editor/`): `fields.tsx` (labelled inputs, errors via
  `aria-describedby`, `FieldGroup`, `ItemControls`), `repeatable-list.tsx` (`RepeatableList` for
  ID-based items: add / move up / move down / remove, count, array errors; `TextListField` for plain
  string arrays), `cta-fields.tsx` (CTA + link inputs), `editor-state.ts` (pure helpers; client-side
  validation composes the canonical contract schema — no forked Zod schemas in forms).
- Reordering is keyboard-accessible buttons only (no drag-and-drop). Item cards are named
  ("Paket 2 · Plus (hervorgehoben)") so controls read e.g. "… nach oben verschieben".
- Privacy: the About editor starts empty, shows a notice (no health/family/private details or
  photos) and nothing is imported from source documents. Footer contact fields are never pre-filled.
- `MediaSlotField` + `MediaPicker` (native modal `<dialog>`: choose from library or upload new and
  assign) + `MediaUploadForm` (one implementation shared by library and picker).
- `website/vorschau/[key]` — full-width draft preview outside the shell, rendered with the same
  production section renderers as the public homepage (§11).
- Overview statuses come only from API data: Veröffentlicht, Entwurf mit Änderungen, Kein Entwurf,
  Kein Inhalt, Ausgeblendet. Section order (`sort_order`) is shown as the list position; changing
  order/visibility is a narrow follow-up (no layout manager yet).
- Loading (`loading.tsx` skeleton), error (`error.tsx` + inline API error states) and empty states
  on every page; `noindex` via metadata and `X-Robots-Tag`.

## 10. Seeding

`pnpm --filter @vitruv/api seed:website` (idempotent): creates the `home` page, its nine sections
and — only for sections without any version — an initial published version with neutral copy and
no media; with `DEV_AUTH_EMAIL` set, ensures that fictional development user (role ADMIN).
No biography, health/family details, customer names, results, prices or source images are seeded.

## 11. Public homepage (Sprint 3 Stage B)

**Data flow**

```
Admin: Veröffentlichen ─▶ API publishSection (one transaction: DRAFT → PUBLISHED, content_revision+1)
   └─ after COMMIT: onPublished hook ─▶ POST web /api/revalidate  (header x-vitruv-revalidate-secret)
                                            └─ revalidateTag('website:home', { expire: 0 })
Visitor: GET / ─▶ (site)/layout + page ─▶ getPublicHome()
   └─ unstable_cache(tag 'website:home', revalidate 300 s)
        └─ fetch GET /v1/public/website/pages/home   (published + enabled only, media resolved)
   └─ public section registry ─▶ production renderers (server-rendered HTML)
```

- **Server rendering:** `/` is rendered per request (`force-dynamic`, no build-time API
  dependency); the published data comes from the Next data cache, so a request is cheap. There is
  no loading boundary on the public site — the first HTML already contains every section
  (works without JavaScript).
- **Cache / revalidation:** tag `website:<slug>`. After every committed public change (publish,
  section visibility/order) the API calls the web app's `/api/revalidate` with the shared
  `REVALIDATE_SECRET` (header only, constant-time compare, website tags only); the tag is expired
  immediately, so the next visitor gets the new content — no rebuild, no restart. Measured locally:
  publish call ≈ 0.6 s (includes the revalidation round trip), next `/` request ≈ 0.2 s with the
  new content. If the hook fails (web down), the publish still succeeds, the failure is logged and
  the 300 s time-based expiry is the safety net. API failures are never cached (`unstable_cache`
  does not store thrown errors); the page shows a calm "temporarily unavailable" state instead of
  substitute marketing copy. The API's `ETag` / `contentRevision` remain available to other clients.
- **Order / visibility:** the page renders sections in API order (`sort_order`); disabled and
  unpublished sections are absent (no gap). `PATCH /v1/admin/website/pages/:slug/sections/:key`
  (`enabled`, `sortOrder`; permission `website.content.publish`; no admin UI yet) changes them,
  bumps the content revision and triggers revalidation like a publish.
- **Registry:** `apps/web/src/components/site/section-registry.tsx` maps every section type to its
  renderer (exhaustive mapped type — a new type does not compile without one): hero → `HeroSection`,
  results → `ResultsSection`, journey → `JourneyMapSection` (existing production component,
  unchanged contract), coaching → `CoachingSection`, packages → `PackagesSection`,
  about → `AboutSection`, faq → `FaqSection`, cta → `CtaSection`, footer → `SiteFooter`
  (rendered by the layout, outside `<main>`). Unknown types render nothing; invalid sections are
  dropped by the API and again per section in the web data layer.
- **Anchors:** each section's DOM id is its CMS key (`#journey`, `#coaching`, `#packages`,
  `#about`, `#faq`, `#cta` …), with `scroll-margin-top` for the sticky header.
- **Navigation:** header links = the CMS footer navigation; header CTA = the CTA section's action.
  In-page links to sections that are not rendered are removed from header and footer.
- **The admin preview** renders drafts with the same production renderers.
- **Media:** `CmsMedia` is the single presenter. Images go through `next/image` optimisation
  (`getImageProps`, AVIF/WebP, responsive `sizes`, `<picture>` + mobile `<source>` for art
  direction, lazy below the fold, eager + high priority for the hero). Allowed hosts come from
  `CMS_MEDIA_ORIGINS` (default: API origin); `CMS_MEDIA_ALLOW_LOCAL=true` (development only) lets
  the optimiser read media from localhost. Videos use `AmbientVideo`: muted, inline, looped, no
  controls, poster first, no autoplay in the server HTML; plays only while ≥ 25 % visible, never
  with reduced motion or Save-Data; `preload="metadata"` for the hero, `"none"` elsewhere.
- **Hero fallback:** without CMS media the hero (and CTA) shows the CSS "glow field" (grid, blue
  glow, chamfered frames). `Philip.mp4` (HEVC) is never used; a browser-ready H.264/WebM
  derivative must be uploaded through the media library when available.
- **Editorial integrity:** no marketing copy in components (guarded by a test that compares the
  seed copy against the public component sources), no source-folder access, no image fallbacks.

## 12. SEO, contact and hardening (Sprint 3 Stage C)

**SEO settings (admin: Website → Einstellungen).** A page-settings document of section type
`seo` (migration `0002_seo_and_leads.sql` adds the enum value): `title`, `description`,
`siteName`, `ogImage` (Media Library slot, images only, alt text required on publish) and
`faqStructuredData`. It reuses the section lifecycle (draft → publish, history, media references
with delete protection, revalidation) and is never rendered as page content (placement `meta`).
Lengths are safety limits (120 / 320 / 80); the editor shows the usual search-result lengths as
guidance only. Drafts never reach the metadata (it is built from the published page).

**Canonical URL.** One server variable `PUBLIC_SITE_URL` (https required in production;
localhost allowed for local production builds) feeds canonical, Open Graph URL, sitemap,
robots and JSON-LD. Never derived from request headers. `SITE_INDEXING=disabled` turns staging
into noindex + `Disallow: /`.

**Metadata.** `generateMetadata` of `/` → title (absolute), description, canonical, Open Graph
(type, locale de_DE, url, site name, image + alt only if a CMS OG image is published), Twitter card
(`summary_large_image` only with an image), robots. No fake image without a CMS asset.

**Structured data.** `lib/seo.ts` builds one JSON-LD graph from published data only: WebSite,
Organization (name/url; e-mail, phone and `sameAs` only when the published footer shows them) and
FAQPage (only if enabled and the FAQ section is published/visible). No Person (no approved data),
no address, ratings, reviews or credentials. Serialised with `<` escaped.

**Sitemap / robots.** `/sitemap.xml`: `/` (lastModified = last publish) and `/kontakt`.
Impressum/Datenschutz stay out (noindex placeholders). `/robots.txt` disallows `/admin`,
`/design`, `/_design`, `/api/`. Admin, design and previews keep noindex via metadata and
`X-Robots-Tag` — robots.txt is not a security mechanism.

**Contact / leads.** Hero CTA and closing CTA point to `/kontakt` (dev content). The page reuses
the published CTA copy as introduction; form labels are structural UI. Fields: name, e-mail,
optional phone, message (hint: no health data), explicit consent checkbox (never pre-checked,
links /datenschutz). Flow: server action (`app/(site)/kontakt/actions.ts`) → contract validation
→ per-client limit (5 / 10 min) → `POST /v1/public/leads` (API: validation, 16 KB body limit,
honeypot `website` + minimum completion time 2.5 s → silent discard, 3 per e-mail/hour, 30 per
minute per process) → `website_leads` (name, email, phone, message, consent_at, status NEW,
timestamps; no IP, no tracking ids). Response is always `{ ok: true }`; there is no read
endpoint. Logs contain only the lead id. E-mail notification: `LeadNotifier` hook, not
configured (no provider approved). Retention/deletion and the privacy text are pending legal
review. Rate limits are in-memory per process — a multi-instance deployment needs a shared store.

**Analytics.** `lib/analytics.ts`: events `cta_click`, `navigation_click`,
`package_cta_click`, `faq_open`, `form_start`, `contact_submit`; a no-op until an adapter is
registered AND consent is set. Properties limited to `section`/`label`; e-mail- or phone-like
values are dropped. Clicks are captured by one delegated listener (`data-track*` attributes).

**Security headers.** Proxy (`src/proxy.ts`) sets a per-request nonce CSP: `script-src 'self'
'nonce-…' 'strict-dynamic'` (no `unsafe-eval` in production), `style-src 'self' 'unsafe-inline'`
(inline style attributes from next/image/object-position), img/media from self + CMS media
origins, `frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'`,
`upgrade-insecure-requests` only for an https site. Plus nosniff, DENY framing,
referrer-policy, permissions-policy, COOP same-origin, HSTS (production). All pages render
dynamically (root layout awaits `connection()`) so every HTML response gets a fresh nonce.

## 13. Method sections & media fields (2026-10-16, additive)

Migration `0008_website_method_sections` (enum values only): section types `pillars` (Drei Säulen:
name, title, keywords, lead, paragraphs, facets, illustration), `situations` (Lebenssituationen:
title, sentence, icon; outro) and `steps` (Neun Stufen: group, title, description, icon). Seeded
idempotently with explicit `sortOrder` 15 / 35 / 45 (between the existing rows) and neutral copy.

Optional fields on existing types (stored content stays valid): coaching feature `icon`, package
`media`, about `highlight` + `detailMedia`, page settings `logo`. Media references are collected
and resolved generically; `SECTION_MEDIA_KINDS` allows images for packages and the three method
sections. The admin draft preview renders on the public surface (same look as the live page).

## 14. Deferred

S3 driver + presigned uploads, e-mail notification for
leads + lead admin UI, shared rate-limit store, admin UI for section
order/visibility (the API endpoint exists), focal-point editing, revision history UI/restore, WebM
metadata, video poster extraction, CDN purge, legal
pages as rich text.
