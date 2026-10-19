# VITRUV — Design System (v0.4 — tokens + web + Flutter components)

Status: 2026-10-15 · Sprint 1 Stage A done: the canonical tokens are implemented in
`packages/design-tokens` and consumed by web and Flutter (§11). Sections 2–10 document the
**prototype analysis** the tokens were derived from (read-only frequency analysis of every inline
style in `assets-source/prototypes/Website Funktional Dunkel.dc.html` + headless renders at 1440 px
and 390 px); §11 is the authoritative production reference.

## 1. Direction decisions (owner, 2026-10-15) — SUPERSEDED 2026-10-16, see §15

> The owner replaced the dark-only direction on 2026-10-16: the public website is light 'Greek
> Harmony', the admin warm-neutral light, Flutter unchanged. §15 is authoritative; the text below
> is kept as history.

- **The only production direction is `Website Funktional` / `Funktional Dunkel`**: dark, athletic,
  premium, electric-blue accent. It is the foundation for website, admin and Flutter app.
- The earlier beige/gold "Körper · Seele · Geist" direction is **not** carried over as a design
  system. Allowed, sparingly and deliberately only:
  - **Vitruvian man** — low-opacity brand detail / watermark.
  - **Classical columns** — decorative element in a suitable Philosophy/About section only.
  - **Körper / Geist-Verstand / Seele** — as content and brand philosophy, not as a visual system.
- **Not in production for now:** gold icon system, marble texture, snake, ocean, star, beige/gold
  section styles.
- No logo or icon is redrawn or invented. Raster logo = reference until a vector arrives (§9).
- UI/system icons may come from an open-licence icon set; never mixed with brand icons.

## 2. Colour

### Dark (primary)

| Token (proposed)      | Value                                             | Prototype usage                                        |
| --------------------- | ------------------------------------------------- | ------------------------------------------------------ |
| `bg`                  | `#050505`                                         | Page background (html/body)                            |
| `surface`             | `#0e0e0e`                                         | Cards, image slots, panels (18×)                       |
| `surface-alt`         | `#0c0c0c` / `#0a0a0a`                             | Rare nested surfaces                                   |
| `fg`                  | `#f2f2ee`                                         | Primary text, links (30×)                              |
| `fg-muted`            | `rgba(242,242,238,0.66)`                          | Body copy                                              |
| `fg-subtle`           | `rgba(242,242,238,0.50)` (prototype: 0.45–0.55)   | Captions, meta labels — see contrast note              |
| `accent`              | `#4d8dff`                                         | Fills: primary button, highlighted headline span (24×) |
| `accent-fg`           | `#5b9dff`                                         | Labels, numbers, link hover, icons (25×)               |
| `accent-glow`         | `rgba(70,140,255,0.35)` + `rgba(160,205,255,0.8)` | Button/selection glow `0 0 24px …, 0 0 2px …`          |
| `border`              | `rgba(255,255,255,0.10)`                          | Default 1 px hairline (24×)                            |
| `border-subtle`       | `rgba(255,255,255,0.07–0.09)`                     | Card edges                                             |
| `border-strong`       | `rgba(255,255,255,0.22)`                          | Emphasised outlines                                    |
| `on-accent`           | `#050505`                                         | Text on blue (selection, primary button)               |
| `glitch-magenta` (fx) | `rgba(255,60,170,0.8–0.9)`                        | Only inside glitch keyframes (chromatic split)         |

### Light variant (`Funktional Hell`)

| Token                  | Value                 |
| ---------------------- | --------------------- |
| `bg`                   | `#f6f6f3` / `#ecece8` |
| `surface`              | `#ffffff`             |
| `fg`                   | `#0e1014`             |
| `fg-muted`             | `rgba(14,16,20,0.66)` |
| `accent` / `accent-fg` | `#1f5fe0`             |
| `border`               | `rgba(0,0,0,0.10)`    |

Contrast (WCAG 2.1, computed with alpha blended onto the background):

| Pair                                      | Ratio                    | AA small text (4.5) |
| ----------------------------------------- | ------------------------ | ------------------- |
| `#f2f2ee` on `#050505`                    | 18.16                    | ✅                  |
| `#5b9dff` on `#050505` / on `#0e0e0e`     | 7.48 / 7.09              | ✅                  |
| `#4d8dff` on `#050505`                    | 6.38                     | ✅                  |
| `#050505` on `#4d8dff` (button label)     | 6.38                     | ✅                  |
| fg @ 0.66 on `#050505` (body)             | 7.87                     | ✅                  |
| fg @ 0.55                                 | 5.66                     | ✅                  |
| fg @ 0.50                                 | 4.87                     | ✅                  |
| fg @ 0.45 (prototype meta/captions)       | 4.11 (4.18 on `#0e0e0e`) | ❌                  |
| Light: `#1f5fe0` on `#f6f6f3` / `#ecece8` | 5.14 / 4.70              | ✅                  |
| Light: fg @ 0.66 / @ 0.45 on `#f6f6f3`    | 5.99 / 3.00              | ✅ / ❌             |

→ Production deviation from the prototype: the lowest text opacity token is **0.50** (`fg-subtle`);
0.45 is allowed only for non-text decoration.

## 3. Typography

All three families are **SIL Open Font License** (verified on google/fonts `METADATA.pb`):
Barlow & Barlow Condensed — Jeremy Tribby; Chakra Petch — Cadson Demak. Self-host via `next/font`
(web) and bundle in Flutter. Latin subset covers German umlauts/ß.

| Role                                             | Family           | Weight / style | Size                                                                 | Tracking    | Case     | Line height |
| ------------------------------------------------ | ---------------- | -------------- | -------------------------------------------------------------------- | ----------- | -------- | ----------- |
| Display (hero)                                   | Chakra Petch     | 700 _italic_   | `clamp(40px, 5.6vw, 80px)`                                           | −0.01em     | UPPER    | 1.0         |
| H2 section title                                 | Chakra Petch     | 700            | `clamp(28px, 3.6vw, 48px)` (also 3.4vw/46px, 3.8vw/50px, 4.2vw/54px) | −0.005em    | UPPER    | 1.02–1.05   |
| Emphasis title (Journey stages, final CTA, menu) | Chakra Petch     | 700 _italic_   | `clamp(28px, 3.4vw, 46px)` / 40px                                    | −0.005em    | UPPER    | 1.02        |
| Card / package title                             | Barlow           | 500–600        | 19–24px                                                              | —           | Sentence | 1.35        |
| Eyebrow / label                                  | Barlow Condensed | 600            | 11–12px                                                              | 0.18–0.24em | UPPER    | —           |
| Numbering (`01 / 04 · ERNÄHRUNG`, `01 //`)       | Barlow Condensed | 600            | 11px                                                                 | 0.18em      | UPPER    | —           |
| Body                                             | Barlow           | 400            | 16–17px                                                              | —           | Sentence | 1.7–1.75    |
| Small body / list                                | Barlow           | 400            | 13–15px                                                              | —           | Sentence | 1.5–1.65    |
| Button                                           | Barlow Condensed | 600            | 11–12px                                                              | 0.16–0.24em | UPPER    | —           |

Weights to load: Chakra Petch 500/600/700 + 700 italic · Barlow 300/400/500/600 · Barlow Condensed 500/600.

## 4. Layout & spacing

- Container: **`max-width: 1240px`**, horizontal padding **44 px** desktop, `clamp(20px, 3vw, 44px)`
  fluid; 20–22 px on phones.
- Section rhythm: **110 px** vertical (`110px 44px`), hero/first section 120 px top; ≈ 70–90 px on mobile.
- Hairline section separators: `1px solid rgba(255,255,255,0.07–0.10)`.
- Grid: `repeat(auto-fit, minmax(min(100%, Npx), 1fr))` with N = 230 / 260 / 320 / 340 / 440 —
  intrinsic responsive grids, no fixed column counts.
- Gaps: 10 / 14 / 16 / 22 / 28 / 36 px (base step ≈ 2 px; propose snapping to a 4 px scale:
  8 · 12 · 16 · 20 · 24 · 28 · 36 · 44).
- Text measure: 540–680 px max-width for paragraphs, 820 px for display headline.
- **Single breakpoint `820px`** (`@media (max-width: 820px)`) — production adds ≥ 1440 / ≥ 1920
  refinements for large screens (320 → 2560 px requirement).

## 5. Shape & elevation

- **Chamfered corners are the signature shape**: `clip-path: polygon(Npx 0, 100% 0, 100% calc(100% - Npx), calc(100% - Npx) 100%, 0 100%, 0 Npx)`
  — top-left + bottom-right cut. N = **12 px** (buttons), **14 px** (cards, image slots), **16 px**
  (large media), 7 px (badges). A thin diagonal stroke is drawn with background gradients so the cut
  edge keeps its border.
- Rounded containers coexist for large panels: radius **22–32 px** (video frame, coach/FAQ panels),
  **4 px / 2 px** for small elements.
- Elevation is **light, not shadow**: blue glows (`0 0 24px rgba(70,140,255,0.35)`, up to
  `0 0 72px rgba(91,157,255,0.32)` for highlighted package), white inner glows on hover.
- Glass header/menu: `backdrop-filter: blur(14–18px) saturate(140%)` over `rgba(5,5,5,…)`.

## 6. Motion

- Default easing **`cubic-bezier(0.22, 1, 0.36, 1)`** (ease-out-quint); secondary
  `cubic-bezier(0.45, 0, 0.2, 1)`; plain `ease` for colour/opacity.
- Durations: **500–600 ms** standard UI, 400 ms micro, 800–1000 ms reveals, 4–8 s ambient loops.
- Signature effects (13 keyframes): `vt-glitch-in` (headline/section entrance with RGB split),
  `vt-scanline`, `vt-noise`, `vt-logo-flicker`, `vt-cta-flicker`/`vt-cta-glow`, `vt-btn-flicker`,
  `vt-card-pulse`/`vt-card-jitter`/`vt-card-glitch`, `vt-menu-in`/`vt-item-in` (clip-path menu reveal).
- Selection highlight is an animated blue fill with glow.
- `prefers-reduced-motion: reduce` handled in 5 places — production must disable **all** flicker,
  glitch, noise and scanline effects there (flicker also matters for photosensitive users:
  keep flashes < 3 per second even with motion allowed).
- Production guidance: keep glitch effects as **accents** (hero entrance, CTA hover), not on every card.

## 7. Components found in the prototype

| Component         | Notes                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| Fixed header      | Logo mark + wordmark, theme toggle ("HELL"), glass background, CTA appears on scroll                             |
| Full-screen menu  | Numbered italic items (`01 // LEISTUNG` …), clip-path reveal, "Jetzt bewerben" CTA                               |
| Primary button    | Blue fill, chamfer 12 px, glow, uppercase condensed label, fill-sweep on hover                                   |
| Secondary button  | 1.5 px white outline with chamfer, transparent                                                                   |
| Eyebrow label     | Condensed 11 px blue uppercase, wide tracking                                                                    |
| Section header    | Eyebrow + uppercase Chakra Petch title + muted lead                                                              |
| Media slot        | `#0e0e0e` chamfered frame (image/video placeholder) — maps 1:1 to CMS media slots                                |
| Video section     | Rounded frame + caption ("So funktioniert das Coaching, in zwei Minuten erklärt")                                |
| Result card       | Media slot + quote + "TEILNEHMER 0X" meta; horizontal swipe row ("WISCHEN →") on small cards                     |
| Testimonial card  | Blue quote mark, body, meta label, chamfered                                                                     |
| Journey stage     | Media slot + `01 / 04 · ERNÄHRUNG` + italic title + body, alternating sides; progress rail with percentage       |
| Doubt/quote panel | Rounded panel cycling "things you tell yourself" quotes                                                          |
| "Included" list   | Numbered rows inside rounded panel                                                                               |
| Package card      | Title, duration badge, description, `+` feature list, CTA; highlighted variant with "BELIEBT" badge and blue CTA |
| Process steps     | Numbered rows separated by hairlines                                                                             |
| Training showcase | Large rounded media panel with caption tag                                                                       |
| Coach panel       | Portrait slot + facts + story                                                                                    |
| FAQ accordion     | `<details>` rows with blue `+` rotating to ×                                                                     |
| Final CTA         | Centered italic headline + lead + primary button                                                                 |
| Contact channels  | Cards per channel (icon, title, description, link)                                                               |
| Footer            | Logo mark, © line, Instagram / E-Mail / Impressum / Datenschutz                                                  |

## 8. Page sections (master prototype order)

`Hero` → `Video` → `Ergebnisse` (results + **Journey "Vier Etappen. Ein Ziel."** + testimonials) →
`Ausgangspunkt` (doubts) → `Leistung` (included) → `Pakete` (Online Coaching · Coaching +
Intensivwoche) → `Ablauf` → `Im Training` → `Coach` → `FAQ` → `CTA` → `Bewerben` (channels) → `Footer`.

This supersedes the provisional section list in `CMS-ARCHITECTURE.md` (hero, results, journey,
coaching, packages, about, faq, cta, footer) — to be reconciled when CMS schemas are written.

Copy is placeholder/prototype copy; final text comes from the CMS. ⚠️ The prototype's coach text
contains personal life details — the owner must explicitly approve any personal information before
it is published (see the source-handling rules of the project).

## 9. Journey Map — prototype analysis

Implementation in the prototype (`<script type="text/x-dc">`, ≈ 320 lines):

- **Procedural topographic SVG built as one big string**: background grid, roads (double-stroke),
  mountain contour rings with invented summit names (GRATHORN, KRAFTSPITZE …), named streets
  (KRAFTWEG, BALANCE-ALLEE, MOBILITÄTSRING …), dashed trails, compass rose. A seeded pseudo-random
  function makes it deterministic.
- **Route + progress**: every stroked element gets `pathLength="1"` and is drawn on via dash
  offset; a "ghost" dashed route shows the remaining way; anchors per stage; a densified polyline
  drives the progress dot; percentage label ("FORTSCHRITT 0 %").
- **Runtime**: `scroll` listener → `requestAnimationFrame` update; full rebuild on every `resize`;
  `ResizeObserver`; cleanup handler present.

Assessment:

| Aspect        | Keep                                                                             | Rewrite                                                                                                                      |
| ------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Concept       | Map/route metaphor, 4 anchored stages, progress dot + %, alternating stage cards | —                                                                                                                            |
| Geometry      | Deterministic (seeded) generation idea                                           | Generate **once at build time** (or hand-tune) into a static SVG/JSON; no string-built SVG at runtime                        |
| Labels        | —                                                                                | Invented place/street names are decorative noise; if kept, render as `aria-hidden` and make them CMS/i18n-aware or drop them |
| Animation     | `pathLength=1` + dash offset draw-on                                             | Use CSS scroll-driven animations (`animation-timeline: view()`) with GSAP ScrollTrigger fallback; no per-frame layout reads  |
| Resize        | —                                                                                | No full rebuild; scale via `viewBox`; separate **vertical mobile path**                                                      |
| Accessibility | —                                                                                | Stage content as an ordered list outside the SVG; SVG `aria-hidden`; reduced-motion = fully drawn static route               |
| Performance   | —                                                                                | Animate only `stroke-dashoffset`/`transform`/`opacity`; lazy-init below the fold                                             |

Components: `JourneyMapSection`, `JourneyRoute`, `JourneyMilestone`, `JourneyProgressDot`.
Visual reference: `Bildschirmfoto 2026-10-02 um 11.56.23.png` (winding route with photo cards).

## 10. Asset requirements (TODO — owner)

| Need                                                                                      | Status                                                         | Interim                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vector logo** (SVG): ensō mark + "VITRUV" wordmark, light & dark                        | ❌ missing                                                     | Raster `VITRUV LOGO.png` / `VITRUV LOGO Kopie.png` as reference only; text wordmark in Chakra Petch/Barlow Condensed is **not** a substitute logo — placeholder until SVG arrives |
| Favicon / app icon source (≥ 1024 px, square, vector preferred)                           | ❌ derived from missing SVG                                    | none                                                                                                                                                                              |
| Brand icons as individual SVG files                                                       | ❌ only combined raster sheets                                 | not needed for master direction now                                                                                                                                               |
| Hero / journey / results / coach photos & videos                                          | ❌ none production-ready                                       | empty CMS media slots                                                                                                                                                             |
| `Philip.mp4` web encodes (H.264 MP4, optional WebM/AV1, poster, desktop + mobile variant) | ⏳ derive later; **source stays untouched**                    | —                                                                                                                                                                                 |
| Vitruvian man watermark (clean, transparent, licence-clear)                               | ⚠️ candidates `0844C703…png` / `8007FAC7…png` — confirm source | —                                                                                                                                                                                 |
| Column illustration for Philosophy/About                                                  | ⚠️ `9ECDABA0…png` — confirm source/licence                     | —                                                                                                                                                                                 |
| UI/system icons                                                                           | ✅ use an open-licence set (e.g. Lucide, ISC)                  | —                                                                                                                                                                                 |
| Fonts                                                                                     | ✅ Barlow, Barlow Condensed, Chakra Petch (OFL)                | —                                                                                                                                                                                 |

Never in production: `AlveroSignatureDEMO.otf`, the watermarked marble image, unverified Avenir Next.

## 11. Implemented token architecture (Sprint 1 · Stage A)

### 11.1 Source of truth and flow

```
packages/design-tokens/src/tokens.ts          ← the ONLY place design values are edited
        │  validateTokens() + contrast checks (generation refuses to run if anything fails)
        ├─▶ apps/web/src/styles/tokens.generated.css          Tailwind 4 @theme + utilities
        └─▶ apps/mobile/lib/core/theme/vitruv_tokens.g.dart    Dart constants
```

- One typed TypeScript module: **palette** (raw hex, never used by components) → **semantic
  roles** (`bg`, `fg-muted`, `accent-text`, …) per theme → typography roles, spacing, layout,
  shape, effects, motion. No JSON/YAML pipeline, no Style Dictionary — just two small generators.
- Generated files are committed so web and Flutter build without extra tooling, and are excluded
  from Prettier / `dart format` / Dart analysis. **Never edit them by hand.**
- Drift guard: `sync.test.ts` regenerates in memory and fails if the committed outputs differ,
  if a role is missing on either platform, or if `pubspec.yaml` / `apps/web/src/lib/fonts.ts`
  load different font faces than `fontFaces`. `pnpm --filter @vitruv/design-tokens check` does
  the same for CI (verified: a hand-edited generated file makes both fail).

Commands:

```bash
pnpm --filter @vitruv/design-tokens generate   # after editing tokens.ts
pnpm --filter @vitruv/design-tokens check      # CI: fail if generated files are stale
pnpm --filter @vitruv/design-tokens test       # validation, contrast, drift, font sync
```

### 11.2 Colour roles — prototype vs. production

| Role (CSS / Dart)                            | Prototype source value       | Production token                  | Note                                                                   |
| -------------------------------------------- | ---------------------------- | --------------------------------- | ---------------------------------------------------------------------- |
| `bg`                                         | `#050505`                    | `#050505`                         | —                                                                      |
| `surface`                                    | `#0e0e0e`                    | `#0e0e0e`                         | —                                                                      |
| `surface-sunken`                             | `#0a0a0a` / `#0c0c0c`        | `#0a0a0a`                         | unified                                                                |
| `surface-hover`                              | `rgba(255,255,255,0.03)`     | white @ 0.03                      | —                                                                      |
| `overlay`                                    | glass header `rgba(5,5,5,…)` | `#050505` @ 0.72                  | chosen for legibility under blur                                       |
| `fg`                                         | `#f2f2ee`                    | `#f2f2ee`                         | —                                                                      |
| `fg-muted`                                   | `rgba(242,242,238,0.66)`     | `#f2f2ee` @ 0.66                  | —                                                                      |
| `fg-subtle`                                  | `rgba(242,242,238,0.45)`     | `#f2f2ee` @ **0.50**              | ♿ **Accessibility adjustment**: 0.45 = 4.11:1 fails AA; 0.50 = 4.87:1 |
| `fg-disabled`                                | —                            | `#f2f2ee` @ 0.35                  | disabled controls only (WCAG-exempt), never content text               |
| `accent`                                     | `#4d8dff`                    | `#4d8dff`                         | fills                                                                  |
| `accent-hover`                               | `#5b9dff`                    | `#5b9dff`                         | —                                                                      |
| `accent-text`                                | `#5b9dff`                    | `#5b9dff`                         | eyebrows, links, numbers                                               |
| `on-accent`                                  | `#050505`                    | `#050505`                         | —                                                                      |
| `border` / `border-subtle` / `border-strong` | white @ 0.10 / 0.07 / 0.22   | same                              | —                                                                      |
| `focus-ring`                                 | — (browser default)          | `#5b9dff`, 2 px, offset 3 px      | production addition (visible focus, WCAG 2.4.7)                        |
| `success` / `warning` / `error`              | —                            | `#3ddc97` / `#ffc24b` / `#ff6b6b` | production addition for system UI                                      |

The light variant (`[data-theme='light']`, `VitruvColors.light`) is kept compatible, not polished.
Its adjustments: `fg-subtle` 0.45 → 0.62 (3.0 → 5.2:1); `accent-hover` darkens to `#184bb8`
instead of lightening (a white label on `#4d8dff` would be 3.2:1).

### 11.3 Contrast results (automated — `tokens.test.ts` and Dart `theme_test.dart`)

| Pair (dark)                           | Ratio                | Required     |
| ------------------------------------- | -------------------- | ------------ |
| fg on bg · on surface                 | 18.16 · 17.20        | 4.5          |
| fg-muted on bg · on surface           | 7.87 · 7.73          | 4.5          |
| fg-subtle on bg · on surface          | 4.87 · 4.88          | 4.5          |
| accent-text on bg · on surface        | 7.48 · 7.09          | 4.5          |
| on-accent on accent · on accent-hover | 6.38 · 7.48          | 4.5          |
| focus-ring on bg · accent on bg       | 7.48 · 6.38          | 3 (non-text) |
| success · warning · error on surface  | 10.92 · 12.02 · 6.96 | 4.5          |

All 30 pairs (dark + light) pass. A token change that breaks a pair fails the tests and the generator.

### 11.4 Typography roles

| Role      | Family / weight           | Size px (360 → 1440) | LH   | Tracking | Case  | Prototype → adjustment                                             |
| --------- | ------------------------- | -------------------- | ---- | -------- | ----- | ------------------------------------------------------------------ |
| `display` | Chakra Petch 700 _italic_ | 40 → 80              | 1.0  | −0.01em  | UPPER | `clamp(40px, 5.6vw, 80px)` → rem + vw form (zoom-safe, WCAG 1.4.4) |
| `h1`      | Chakra Petch 700          | 32 → 54              | 1.04 | −0.005em | UPPER | from `clamp(30px, 4.2vw, 54px)`                                    |
| `h2`      | Chakra Petch 700          | 28 → 48              | 1.05 | −0.005em | UPPER | `clamp(28px, 3.6vw, 48px)`                                         |
| `h3`      | Chakra Petch 700          | 22 → 30              | 1.1  | 0        | UPPER | journey/CTA titles; italic per use                                 |
| `title`   | Barlow 500                | 19 → 22              | 1.35 | 0        | —     | card/package titles                                                |
| `eyebrow` | Barlow Condensed 600      | 12                   | 1.3  | 0.22em   | UPPER | prototype 11–12px → **12px minimum**                               |
| `body-lg` | Barlow 400                | 17 → 19              | 1.7  | 0        | —     | —                                                                  |
| `body`    | Barlow 400                | 16                   | 1.7  | 0        | —     | —                                                                  |
| `body-sm` | Barlow 400                | 14                   | 1.6  | 0        | —     | —                                                                  |
| `caption` | Barlow Condensed 600      | 12                   | 1.3  | 0.16em   | UPPER | prototype 11px → **12px minimum**                                  |
| `button`  | Barlow Condensed 600      | 12                   | 1.0  | 0.2em    | UPPER | —                                                                  |

Loaded faces (and nothing else): Chakra Petch 700 + 700 italic · Barlow Condensed 600 ·
Barlow 400/500/600. The prototype also requested Chakra Petch 500/600, Barlow 300 and Barlow
Condensed 500 — unused, dropped to save bytes.

### 11.5 Spacing, layout, shape, effects, motion

- **Spacing**: 4 px base (`--spacing: 0.25rem`; Dart `VitruvSpace.s1 … s28`). Prototype values
  snap to the scale (10→8/12, 14→12/16, 22→20/24, 36, 44).
- **Layout**: content 1240 px (`max-w-content`); measures 540/680/820 px
  (`max-w-measure-narrow | measure | measure-display`); gutter `--gutter` 20→44 px; section rhythm
  `--section-space` 72→110 px; breakpoints `sm 480 · md 820 (prototype) · lg 1240 · xl 1440 ·
xxl 1920`; tap target 48 px.
- **Shape**: chamfer `xs 7 · sm 12 · md 14 · lg 16` (web: `.vt-chamfer` component layer, §12.2; Flutter
  `AppTheme.chamfer()` = `BeveledRectangleBorder` on top-left + bottom-right); radius
  `xs 2 · sm 4 · md 12 · lg 22 · xl 28 · pill`; borders hairline 1 · strong 1.5 · focus 2.
- **Effects**: `shadow-glow` (prototype button/selection glow), `shadow-glow-strong`
  (highlighted package), `shadow-glow-soft`; backdrop blur 14 px. No generic drop shadows.
- **Motion**: `--duration-micro 200 · short 400 · base 600 · long 900` ms; `ease-out` =
  `cubic-bezier(0.22, 1, 0.36, 1)`, `ease-in-out` = `cubic-bezier(0.45, 0, 0.2, 1)`. Under
  `prefers-reduced-motion` every duration token becomes 0 ms and animations/transitions stop.
  Flicker effects (Stage B) must stay ≤ 3 flashes/s.

Verified in the browser (production build): at 1440 px — h1 80 px, h2 48 px, container 1240 px,
gutter 44 px, section padding 110 px; at 375 px — h1 40.6 px, gutter 20 px, section 72 px, no
horizontal overflow; fonts loaded: Chakra Petch 700 normal/italic, Barlow Condensed 600, Barlow 400.

### 11.6 How the platforms consume tokens

**Web (Next.js + Tailwind 4)** — `globals.css` imports `tokens.generated.css`, which resets
Tailwind's default palette/scales so only VITRUV tokens exist as utilities: `bg-surface`,
`text-fg-muted`, `text-accent-text`, `border-border-subtle`, `max-w-content`, `shadow-glow`,
`ease-out`, `type-display` … `type-button` (family, size, weight, leading, tracking and case in one
class), plus CSS variables `--gutter`, `--section-space`, `--duration-*`.
Fonts: `src/lib/fonts.ts` via `next/font/google` — downloaded at build time, self-hosted,
preloaded, with metric-adjusted fallbacks (no layout shift), `display: swap`. A web test forbids
hex literals, Tailwind default colours and retired Sprint 0 token names in `apps/web/src`.

**Flutter** — `AppTheme.dark()` builds `ThemeData` only from `vitruv_tokens.g.dart`
(ColorScheme, TextTheme, filled/outlined buttons, cards, navigation bar, dividers, focus ring).
Roles without a Material slot are available through `VitruvTheme.of(context)` (ThemeExtension).
Text roles are fluid via `VitruvTextRole.sizeFor(width)`; Flutter has no `text-transform`, so
`role.apply(text)` uppercases. Fonts are bundled TTFs in `assets/fonts/` (OFL; licences
registered with `LicenseRegistry`).

### 11.7 Known gaps (by design — later stages)

- ~~Chamfered borders lose the stroke on the cut corner~~ — solved in Stage B (§12.2).
- Glitch: one restrained primitive in Stage B (§12.4); other prototype effects intentionally not ported.
- Logo areas show a text placeholder until the vector logo exists (§10).

## 12. Web component system (Sprint 1 · Stage B)

Location: `apps/web/src/components/ui` (import from `@/components/ui`), shapes/states/motion in
`apps/web/src/styles/components.css`. Everything consumes the generated tokens; no new canonical
tokens were needed (see 12.6).

### 12.1 Primitives

| Primitive                                   | Purpose                                                                  | API (summary)                                                                                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chamfer(cut?)`                             | Class helper for the brand cut-corner shape                              | `'xs' \| 'sm' \| 'md' \| 'lg'`                                                                                                                                                                  |
| `Button`                                    | Real `<button>` for actions                                              | `variant` primary/secondary/ghost · `size` md (48 px)/lg (56 px) · `icon`, `iconPosition` · `loading` · `fullWidth` · native `disabled`/`type`; icon-only requires `aria-label` (type-enforced) |
| `ButtonLink`                                | Navigation styled as a button (`next/link` → `<a>`)                      | same style props + `href`; no disabled state by design                                                                                                                                          |
| `Card` / `CardLink`                         | Surface for results, packages, milestones, admin info (composition)      | `tone` default/outline/sunken/accent · `cut` · `padding` none/sm/md/lg · `glow` · `as` (div/article/li/aside); `CardLink` = whole card as one focusable link                                    |
| `MediaFrame`                                | Fixed-ratio image/video frame for CMS media                              | `ratio` 21/9…9/16 · `shape` chamfer/rounded · `cut` · `slot` (ResolvedMediaSlot → `CmsMedia`) or `children` · accessible empty placeholder                                                      |
| `Badge`, `MetaRow`                          | Short status/tags (always with text) and inline metadata                 | `tone` neutral/accent/success/warning/error · `dot`; `items[]` with decorative separators                                                                                                       |
| `Eyebrow`, `SectionHeading`, `SectionIntro` | Consistent section openings                                              | heading `level` (h1–h4) independent of visual `size` (display/h1/h2/h3) · `emphasis` (italic) · `titleId` for `aria-labelledby`                                                                 |
| `Section`, `Container`                      | Vertical rhythm (`--section-space`) and content width/gutters            | `tone`, `divider`, `contained`, `labelledBy`                                                                                                                                                    |
| `vt-autogrid` (CSS)                         | Prototype's intrinsic `repeat(auto-fit, minmax(min(100%, N), 1fr))` grid | `vt-autogrid--sm` (208 px) / default (260 px) / `--lg` (340 px)                                                                                                                                 |
| `Reveal`, `GlitchText`                      | Restrained motion (see 12.4)                                             | —                                                                                                                                                                                               |

`cx()` joins classes; variants never emit conflicting utilities, so no class-merge library is used.

### 12.2 Chamfer implementation (borders + focus preserved)

Stage A's `chamfer-*` utilities applied `clip-path` to the element itself, which cut the border on
the diagonal **and clipped the keyboard focus outline**. They were removed from the generator.

Now the element is never clipped (`.vt-chamfer` has no `clip-path`/`overflow`); two pseudo layers
behind the content paint the shape:

- `::before` — **border ring**: `clip-path: polygon(evenodd, outer…, inner…)`, i.e. the outer
  chamfer minus the inner one. The stroke keeps its full width along the 45° cut, and transparent
  fills (outline variants) show the page behind instead of a filled block.
- `::after` — **fill**, inset by the border width; its cut is `cut − bw × (2 − √2)`
  (`--vt-ic`), so the diagonal border has the same thickness as the straight edges.
- Variants only set custom properties: `--vt-cut`, `--vt-bw`, `--vt-border`, `--vt-fill`.
  Hover/active/disabled change those variables; the pseudo layers transition their colour.
- **Focus**: the native `:focus-visible` outline (2 px `focus-ring`, offset 3 px) sits on the
  unclipped element and is always fully visible. It is rectangular around the chamfer by design —
  a chamfer-shaped ring would be invisible on the blue primary fill and harder to keep compliant.
- **Glow**: `filter: drop-shadow(...)` (`--filter-glow*`, generated from the same `effects` tokens)
  follows the chamfered silhouette instead of a rectangular `box-shadow`.
- Media: `.vt-media__clip` clips the image/video to the inner shape; the border ring stays intact.

### 12.3 States

| State         | Primary                                                             | Secondary                           | Ghost                              |
| ------------- | ------------------------------------------------------------------- | ----------------------------------- | ---------------------------------- |
| default       | blue fill, soft glow                                                | 1.5 px `border-strong`              | `accent-text` label                |
| hover         | `accent-hover`, full glow                                           | border → `fg`, `surface-hover` fill | label → `fg`, `surface-hover` fill |
| focus-visible | 2 px `focus-ring` outline, offset 3 px                              | same                                | same                               |
| active        | base fill, no glow, 1 px press                                      | 1 px press                          | 1 px press                         |
| disabled      | `surface` fill, `fg-disabled` label, no glow, `not-allowed`         | same                                | transparent fill                   |
| loading       | keeps variant colours, spinner + label, `aria-busy`, clicks blocked | same                                | same                               |

`data-preview-state="hover|focus|active"` forces a state for the `/design` page only; it maps to
exactly the same declarations as the real pseudo-classes.

### 12.4 Motion

- Hover/colour: `--duration-micro` (200 ms) · glow/filter: `--duration-short` (400 ms) · easing
  `--ease-out` = `cubic-bezier(0.22, 1, 0.36, 1)`.
- `Reveal`: CSS scroll-driven entrance (`animation-timeline: view()`), no JavaScript; content is
  never hidden when unsupported.
- `GlitchText`: one branded accent for short display text — chromatic `text-shadow` pulses (glyphs
  never move), plays once on first paint and on hover/focus, two pulses per 900 ms (< 3 flashes/s).
  Not for body copy. Only the prototype's chromatic-split idea was ported; scanline, noise,
  flicker, jitter and menu keyframes were intentionally not.
- `prefers-reduced-motion: reduce`: duration tokens are 0 ms, `Reveal`/`GlitchText` animations are
  not applied at all (verified: `animation-name: none`).

### 12.5 `/design` preview route

`apps/web/src/app/design` — foundations (colour roles, type roles, spacing/layout, chamfer sizes,
glow, radius, motion) and components (button matrix with all states, cards incl. interactive,
media frames with local test patterns and empty states, text primitives, badges/meta, responsive
composition). Neutral fictitious demo copy only; test media are abstract SVG patterns in
`public/_design/`.

Exposure: always available in development; in production it returns **404 unless
`DESIGN_PREVIEW=enabled`** (runtime switch, no rebuild). Always `noindex, nofollow`
(page metadata + `X-Robots-Tag` header for `/design` and `/_design/*`), and not linked from any
public navigation. Logo area shows "VITRUV — logo asset pending".

### 12.6 Token changes

None in `packages/design-tokens/src/tokens.ts`. Generator change only
(`generate-css.ts`): removed the element-clipping `chamfer-*` utilities and added
`--filter-glow`, `--filter-glow-strong`, `--filter-glow-soft` (the existing glow tokens expressed
as `drop-shadow` filters). Dart output is unchanged.

### 12.7 Verification (Stage B)

Headless Chrome (puppeteer-core) on the production build: no horizontal overflow at 1440 / 820 /
390 / 375 / 320 px; all 26 buttons ≥ 48 px high; borders continuous on chamfer diagonals (3×
zoom); real keyboard Tab focus visible and unclipped on primary, secondary and card links;
reduced motion disables glitch/reveal. Only Chromium was available locally (Edge could not be
launched headless; Firefox/Safari not installed) — the technique uses widely supported features
(`clip-path: polygon(evenodd, …)`, pseudo-elements, `drop-shadow`), but a Firefox/Safari check is
still open.

## 13. Flutter component system (Sprint 1 · Stage C)

Location: `apps/mobile/lib/shared/ui` (import `shared/ui/ui.dart`). Everything consumes the
generated `vitruv_tokens.g.dart`; there is no separate mobile design system.

### 13.1 Primitives

| Primitive                                                                                       | Purpose                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ChamferCut`, `chamferBorder()` (`core/theme/chamfer_shape.dart`)                               | The single chamfer definition, shared by the Material theme and all widgets                                                                              |
| `ChamferBox`                                                                                    | Static chamfered surface: fill, border, optional token glow                                                                                              |
| `ChamferFocusRing`                                                                              | Chamfered keyboard-focus ring painted outside the child (no layout change)                                                                               |
| `VitruvPressable`                                                                               | Shared behaviour for tappable primitives: focus + Enter/Space, hover, press, semantics, cursor                                                           |
| `VitruvButton`                                                                                  | primary / secondary / ghost · md (48 dp) / lg (56 dp) · leading/trailing icon · loading · disabled · full width · semantic label                         |
| `VitruvCard` / `VitruvCard.tappable`                                                            | Surface (standard / outline / sunken / accent, cut, padding, glow) for workout, coach message, day, progress, document, settings rows — composition only |
| `VitruvMediaFrame`                                                                              | Fixed aspect ratio (21:9 … 9:16), chamfer clip, border on top, neutral placeholder                                                                       |
| `Eyebrow`, `SectionTitle` (heading semantics), `SectionIntro`, `MetaLabel`, `vitruvTextStyle()` | Token typography with fluid sizing                                                                                                                       |
| `VitruvBadge`, `VitruvMetaRow`, `VitruvProgress`                                                | Status with text (never colour-only), decorative separators, progress with visible value text                                                            |

### 13.2 Chamfer in Flutter

Native rendering instead of the web's pseudo-element layers: `BeveledRectangleBorder` with only
the top-left and bottom-right corners bevelled. A `ShapeDecoration` strokes the border along the
real outline (diagonal included) and its `shadows` follow the same silhouette, so fill, border and
glow come from one decoration. Media is clipped with `ClipPath(ShapeBorderClipper)` and the border
is painted as a foreground decoration so media never covers it. The focus ring is a
`CustomPainter` that outsets the chamfer by `focusOffset + borderFocus/2` and grows the cut by
`d·(2 − √2)` so the ring's diagonal stays parallel — on Flutter the ring is chamfered (on the web
it is the browser's rectangular outline).

### 13.3 States

Same semantics as the web (§12.3): hover/pressed = emphasised fill/border (primary: `accent-hover`

- full glow), pressed adds a 1 dp press (buttons) or 0.99 scale (cards), keyboard focus = chamfered
  `focus-ring`, disabled = `surface` + `fg-disabled`, no glow, exposed as disabled and not focusable,
  loading = variant colours kept, spinner over invisible content (no size change), taps blocked,
  semantics value "Lädt". The focus ring only appears for keyboard/traversal focus
  (`FocusHighlightMode.traditional`), not after touches.

### 13.4 Navigation shell

Unchanged scope and behaviour (Material `NavigationBar`, five tabs, `StatefulShellRoute`). Visual
only: hairline top edge, `surface-sunken` bar, chamfered selection marker with an accent hairline,
caption-style labels. Labels stay mixed case for legibility of short words. Safe areas: the bar
pads itself for the bottom inset / gesture bar, app bars handle the top inset; no device-specific
padding.

### 13.5 Design gallery (development only)

`lib/features/design_gallery` — foundations (colours, type roles, spacing, chamfer, glow) and every
Stage C component in all states (normal, pressed, focused, disabled, loading), plus a navigation
example, with neutral demo content and a generated test pattern instead of media.

Access: `designGalleryEnabledProvider` = debug/profile builds, or a release build with
`--dart-define=VITRUV_DESIGN_GALLERY=true`. Otherwise the `/design` route is **not registered**
(unreachable by navigation or deep link) and the only entry point — a developer button on the
Profil placeholder — is not rendered. Never part of the bottom navigation (tested).

### 13.6 Motion, effects, performance

- Durations/easing from tokens (`VitruvMotion.micro`, `easeOut`); with the platform
  "reduce motion"/"remove animations" setting (`MediaQuery.disableAnimations`) all component
  transitions are instant and press offsets/scales are skipped. No glitch effect in Flutter.
- Glow = `BoxShadow` lists from the effects tokens, only on primary buttons and on cards with
  `glow: true`; the web's `drop-shadow` filter has no cheaper Flutter equivalent, so cards default
  to no glow (safe in long workout lists). No blur/backdrop filters.
- Clipping only in `VitruvMediaFrame` (anti-aliased path clip); cards and buttons do not clip.
- Interaction state is local to each control; static cards are plain `DecoratedBox` trees with
  `const` constructors.

### 13.7 Token changes

None in `tokens.ts`. Generator change only (`generate-dart.ts`): the Dart output now starts with
`// dart format off`, because `dart format lib` had reformatted the generated file and the drift
test correctly failed. Web CSS unchanged.

### 13.8 Verification (Stage C)

`flutter analyze` clean; `flutter test` 68 passing (27 existing + 41 new): button variants,
disabled/loading semantics and size stability, keyboard focus ring + Enter, card tones and
tappable semantics, chamfer token mapping, media frame sizing/placeholder/child, badge/progress
semantics, five reachable tabs, gallery access on/off, no overflow at 320 / 375 / 390 / 430 /
768 dp and at 1.5× / 2× text, icon scaling with text size, reduced motion, and a token-discipline
test (no colour literals, numeric `EdgeInsets`/`BorderRadius`, literal font sizes or raw
`TextStyle` in product UI; verified with a deliberate violation). Visual review: gallery rendered
with the real fonts by the Flutter engine at 390, 320 (1× and 2× text) and 768 dp. No emulator or
device rendering — Android SDK/JDK are not installed and iOS needs macOS.

## 14. Journey Map — "Dein Weg" (Sprint 1 · Stage D)

Public-website section, isolated; preview at `/design/journey` (same guard as `/design`:
`DESIGN_PREVIEW=enabled` or `NODE_ENV=development`, otherwise 404; `noindex` via metadata and
`X-Robots-Tag`). Code: `apps/web/src/components/journey/`.

### 14.1 Prototype review

Kept (behaviour/look): one route connecting the stages, a faint "ghost" base route with the drawn
progress route on top, a travelling dot, a percentage readout, contour rings around milestones, the
dark grid. Discarded: procedural street network + Dijkstra pathfinding, seeded random
mountains/contours, string-built SVG, full rebuild on resize, route avoidance around text/image
boxes — complexity without user value, non-deterministic output and costly resize work. Nothing
was copied; the component is a new implementation.

### 14.2 Content model (CMS-ready)

`JourneyContent { eyebrow, title, lead?, stages: JourneyStage[] }`,
`JourneyStage { id, step, name, title, description, media: ResolvedMediaSlot | null }`. The section
renders any number of stages; media comes in as a resolved CMS slot (`null` → `MediaFrame`
placeholder "{name} · Medium folgt"). `JOURNEY_DEMO` holds the four demo stages (Ernährung,
Mobilität, Balance, Kraft) with `media: null` — no bundled editorial images. No CMS yet.

### 14.3 SVG architecture

Deterministic geometry in `journey-route.geometry.ts`: viewBox 400×1000, 10 hand-placed waypoints,
Catmull-Rom → cubic Bézier (`ROUTE_PATH`, computed once at module load, identical on server and
client), milestones on waypoints 0/3/6/9, `ROUTE_STOPS` = their length fractions. Layers: grid →
base path → progress path (`pathLength="1"`, dasharray `1 1`, dashoffset `1 → 0`) → milestones
(rings, halo, dot, label) → marker. Entire SVG is `aria-hidden` + `focusable="false"`; stroke widths
are viewBox units, colours come from token CSS variables.

### 14.4 Scroll strategy and progress math

- `p` = position of a reading line (55 % of viewport height) through the **stage list** (not the
  page), clamped to 0..1.
- Thresholds are layout-derived: `offsetTop_i / listHeight` (first forced to 0, non-decreasing);
  active stage = last `i` with `p ≥ t_i`. Same `p` → same state, regardless of direction or jumps.
- Route fraction = piecewise-linear map from thresholds to `ROUTE_STOPS`, so the marker sits
  exactly on milestone _i_ when stage _i_ activates; 100 % = last stage reached. The percentage is
  floored (never shows 100 % early).
- Marker position from 240 cached `getPointAtLength` samples, linearly interpolated.

### 14.5 Performance

Per frame: one `getBoundingClientRect`, then writes only (`--journey-p`, dashoffset, marker
`transform`, percent `textContent`) — no React render while scrolling. React state changes only when
the active stage changes. Scroll listener (passive, one rAF per frame) is attached only while an
IntersectionObserver reports the section near the viewport. Thresholds re-measured on
ResizeObserver/window resize; route samples measured once. Everything is cleaned up on unmount.

### 14.6 Milestone states

`upcoming` (muted media opacity 0.4, `fg-muted` title, hollow milestone) · `active` (accent ring,
halo, `aria-current="step"`) · `completed` (filled milestone, mobile node with check). A visually
hidden label announces the state. State styles are scoped to `[data-journey-ready]`, so server/no-JS
output shows every stage at full strength.

### 14.7 Responsive

`md` (820 px) and up: two columns (5fr map / 7fr stages), map panel sticky at 100dvh, stages
`min-height: 75dvh`. Below `md`: the map panel is not shown; a dedicated vertical rail runs along
the ordered list (fill = `scaleY(var(--journey-p))`, one node per stage). Verified without horizontal
overflow at 1440 / 820 / 390 / 375 / 320.

### 14.8 Reduced motion, no JS, accessibility

`prefers-reduced-motion: reduce` (also when toggled at runtime): no scroll tracking, route fully
drawn, 100 %, every stage `completed`, marker hidden. Without JavaScript: full content in a
semantic `<ol>`, h2 section / h3 stages, no state styling, no layout dependency on JS.

### 14.9 Token changes

None.

### 14.10 Verification (Stage D)

Unit/SSR tests: progress math, thresholds, route mapping monotonicity, geometry determinism,
baseline markup, heading hierarchy, aria-hidden decorations, data-driven rendering, CSS contracts.
Headless Chrome (production build): 1440/820/390/375/320 at 0/25/50/75/100 %, marker error 0 px
in all cases, marker on each milestone at activation (< 1.2 viewBox units; at 820/390/375 stage 0
cannot be measured exactly because p = 0 would require scrolling above the page top), rapid /
backwards / resize / jump scenarios identical to a fresh load, reduced motion and no-JS checked.
Chrome only (Edge headless did not launch; Firefox/Safari not installed).

## 15. Surfaces & 'Greek Harmony' redesign (owner decision 2026-10-16)

One token source, three surfaces (`packages/design-tokens/src/tokens.ts`):

| Surface                                                               | Selector                | Colours                                                                                                                                                                | Type                                                                                                                   |
| --------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Public website, login, activation, access denied, admin draft preview | `data-surface="public"` | `colorsPublic` — cream paper #f2efe9, cards #faf8f4, warm ink #2b2825, gold-deep text #7a6747; decorative gold #a3906f and route terracotta #cf5a3c (never small text) | `publicTypeScale` — Jost 300–600 (OFL) for all roles, Bodoni Moda 500 italic (OFL) for the gold accent word (`.vt-em`) |
| Admin                                                                 | `data-surface="admin"`  | `colorsAdmin` — canvas #f4f2ee, white cards, same ink/gold                                                                                                             | system sizes, Jost (`adminTypeWeights`), headings in sentence case                                                     |
| Flutter app                                                           | —                       | `VitruvColors.dark` (unchanged)                                                                                                                                        | Barlow / Chakra Petch                                                                                                  |

The generator emits each surface as a scoped block that overrides `--color-*`, `--text-*` and the
per-role `--type-<role>-family/-style/-case` variables, so every `type-*` utility and every
primitive (Button, Card, MediaFrame, Badge, inputs) adapts without new components. Chamfer geometry
becomes soft radii on the light surfaces (`styles/public.css`, shared by both). `.vt-on-media`
swaps roles to light-on-dark over photos/video (using the captured `--vt-ink` / `--vt-paper`).

Stylesheets: `public.css` (surface primitives, header, hero stage, motifs, auth split),
`public-sections.css` (arch frame, Lebenssituationen, Drei Säulen, Neun Stufen, package image,
coaching icon), `admin.css` (panel frame, sidebar/rail, drawer, states, drop zone styles live in
`components.css`).

### Components (2026-10-16)

- **Header** over the hero stage: fixed + transparent with light copy until the hero copy has
  scrolled away, then the warm glass bar (pattern: Meridius.ch header over its hero). Logo = CMS
  page settings → Logo, used as uploaded; inverted to light only by a CSS filter over the video.
- **Hero stage** (hero with CMS media, ideally a muted video loop + poster via `AmbientVideo`):
  full viewport, warm ink gradient, copy lower left, gold accent word, scroll line. Without media:
  calm centered composition with the Vitruvian geometry.
- **Lebenssituationen** — icon medallion cards (gold ring on hover) and a closing line.
- **Drei Säulen** — sticky stage with the pillar illustration inside circle · square · triangle;
  the figure of the active pillar draws dark (Körper = square, Seele = circle, Geist = triangle);
  switcher and reading opacity are driven by `PillarsObserver` (IntersectionObserver, pure
  enhancement — without JavaScript every pillar is readable).
- **Neun Stufen** — one column per pillar (roman numeral), steps 01–09 on a gold line, icon cards.
- **Greek arch frame** (`.vt-arch`) — the signature media shape (About portrait, pillar images on
  phones, package image top).
- **Account pages** — `AuthShell` split (visual panel | form; phones: short accent band).
- **Admin** — `AdminShell` (sticky sidebar from md, collapsible icon rail remembered per browser
  via `useSyncExternalStore`, `<dialog>` drawer on phones with focus return), Lucide nav icons, gold
  active marker, state chips, shimmer skeletons, media drop zone over the native file input.

### Component audit (cross-project patterns adapted — no branding copied)

| Project                          | Pattern                                                                      | Why                      | How adapted in VITRUV                                                            |
| -------------------------------- | ---------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------- |
| MasaNova AI                      | DashboardShell: sticky sidebar, `<dialog>` drawer, skip link, blurred header | proven a11y drawer       | `AdminShell` (+ icon rail)                                                       |
| CleanServisi                     | collapsible sidebar with localStorage; DocumentDropzone                      | dense admin, easy upload | rail store; `.vt-dropzone` (native input covers the zone)                        |
| Kliniva AI                       | KPI card accent bar, staggered enter, reduced motion                         | calm dashboards          | admin page entrance + state chips                                                |
| Meridius.ch                      | header transparent over the hero photo                                       | immersive opening        | `SiteHeader overHero` + hero stage                                               |
| Mezbaha Teknolojileri            | video hero / video embeds                                                    | film opening             | existing `AmbientVideo` (viewport play; poster under reduced motion / Save-Data) |
| Meridius.ch FAQ (BlurredStagger) | per-letter blur reveal                                                       | rejected                 | per-character spans hurt screen readers and performance                          |

Contrast: all text roles ≥ 4.5:1 on their surfaces (validated by `checkContrast` for every theme,
including `public` and `admin`); gold #a3906f is decorative / large display only.
