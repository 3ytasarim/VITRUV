# VITRUV — Sprint 1 Plan (proposal)

Goal: turn the extracted master design system ([DESIGN-SYSTEM.md](DESIGN-SYSTEM.md)) into shared,
tested tokens and a production component foundation for web and Flutter — **without** building
final pages, CMS, auth or real content yet.

Status: **Phase A + B + C + D done** (2026-10-15, uncommitted — DESIGN-SYSTEM.md §11–14). Awaiting owner
review. Sprint 0 + Phase A–D work is not committed yet.

## Phase A — Design tokens (single source of truth) — ✅ done

1. `packages/design-tokens` (new, TypeScript): colours (dark + light), typography roles, spacing
   scale, radii, chamfer sizes, glows, motion (easings/durations), breakpoints — values from
   DESIGN-SYSTEM.md §2–6, with the documented contrast fix (lowest text opacity 0.50).
2. Generators:
   - CSS custom properties / Tailwind 4 `@theme` for `apps/web` (replaces the Sprint 0 provisional tokens).
   - Dart constants for `apps/mobile` (`AppColors`, `AppTypography`, `AppSpacing`, `AppMotion`) —
     generated, not hand-copied, with a check that fails CI when they drift.
3. Fonts: self-host Barlow, Barlow Condensed, Chakra Petch (OFL) via `next/font/local` and Flutter
   asset fonts; licence texts committed alongside.
4. Tests: token snapshot; automated WCAG contrast test for every text/background pair.

**Done when:** web and Flutter render only from generated tokens; contrast tests pass; no
hardcoded hex values in components (lint rule).

## Phase B — Core components (web) — ✅ done

Built from the prototype inventory (DESIGN-SYSTEM.md §7), as clean React server components unless
interaction requires client code, each with light/dark, reduced-motion and keyboard support:

- Primitives: `Container`, `Section`, `Eyebrow`, `Heading` (display / h2 / emphasis-italic),
  `Text`, `Chamfer` (clip-path shape with edge stroke), `Button` (primary / secondary / ghost),
  `Badge`, `Divider`, `Icon` (Lucide wrapper — UI icons only).
- Composites: `SiteHeader` (glass, scroll CTA, theme toggle), `MenuOverlay` (numbered items,
  focus trap), `MediaSlot` (wraps `CmsMedia` with chamfer/rounded variants and empty state),
  `Card` (chamfered / rounded), `QuoteCard`, `PackageCard` (+ highlighted), `StepList`,
  `Accordion` (FAQ, native `<details>`), `SiteFooter`.
- Motion: a small `motion` module (entrance reveal, glitch-in accent, CTA glow) — all disabled
  under `prefers-reduced-motion`; flicker limited to < 3 flashes/s.
- A `/design` preview route (dev/admin only, `noindex`) showing every token and component in both
  themes at 320 / 768 / 1440 / 2560 px.

**Done when:** components covered by unit/a11y tests (axe), visual check at the four widths,
lint/typecheck/build green.

## Phase C — Core components (Flutter) — ✅ done

`ThemeData` from generated tokens; `VitruvButton` (chamfer via `ShapeBorder`), `Eyebrow`,
`SectionHeader`, `ChamferCard`, `MediaSlot` placeholder, bottom navigation restyled; golden tests
for dark/light.

## Phase D — Journey Map prototype component (isolated) — ✅ done

`JourneyMapSection` / `JourneyRoute` / `JourneyMilestone` / `JourneyProgressDot` per
DESIGN-SYSTEM.md §9: static SVG geometry (no runtime string generation), scroll-driven
`stroke-dashoffset`, vertical mobile path, ordered-list content outside the SVG, reduced-motion
static state. Rendered on the `/design` route with placeholder content only.

Done as `JourneyMapSection` (`apps/web/src/components/journey/`), preview `/design/journey`;
details and verification in DESIGN-SYSTEM.md §14. Milestone/marker are internal parts of the route
rather than separate exports; Flutter Journey deferred.

## Out of scope for Sprint 1

Final website pages and copy, CMS tables/editor, uploads and S3 driver, auth, coaching features,
video encoding of `Philip.mp4`, any use of sensitive source material.

## Open asset requirements (non-blocking)

From DESIGN-SYSTEM.md §10: vector logo (SVG, light/dark), favicon/app-icon source, licence
confirmation for Vitruvian-man and column illustrations, production photos/videos. Until then:
logo areas show a neutral placeholder, never a redrawn logo.

## Suggested first step

Commit Sprint 0 (`chore: sprint 0 foundation`) on `main`, branch `feature/sprint-1-design-system`,
then Phase A.
