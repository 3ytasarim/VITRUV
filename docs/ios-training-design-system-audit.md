# iPhone Training App — Design-System Denetimi (salt okunur)

> Tarih: 2026-11-22 · Kapsam: `D:\Claude Code Project\VITRUV` monorepo, yalnız kod/doküman okuması.
> Canlı site (vitruv-move.com) **çekilmedi**; DB'deki CMS değerleri **okunmadı**.
> Durum etiketleri: **MEVCUT / KISMEN MEVCUT / EKSIK / DOGRULANAMADI**.
> Bu belge dışında hiçbir dosya değiştirilmedi; token generator çalıştırılmadı.

Okunan ana kaynaklar: `packages/design-tokens/src/tokens.ts`, `apps/web/src/lib/theme.ts`,
`apps/web/src/lib/brand.ts`, `apps/web/src/lib/fonts.ts`, `apps/web/src/styles/public-reference.css`,
`public-functional.css`, `public.css`, `tokens.generated.css`, `portal.css`,
`apps/web/src/app/(site)/layout.tsx`, `apps/web/src/app/mein-training/layout.tsx`,
`packages/contracts/src/cms/sections.ts`, `apps/mobile/pubspec.yaml`, `apps/mobile/lib/app.dart`,
`apps/mobile/lib/core/theme/*`, `apps/mobile/lib/shared/ui/*`, `apps/mobile/lib/features/workout/countdown_panel.dart`,
`apps/mobile/lib/features/design_gallery/*`, `docs/DESIGN-SYSTEM.md`, `docs/MOBILE-ARCHITECTURE.md`, `CLAUDE.md`.

---

## 0. Önce bilinmesi gereken üç bulgu (brief ile kod arasındaki farklar)

1. **Public site renkleri artık CMS temasından gelmiyor.** `apps/web/src/app/(site)/layout.tsx:64`
   yalnız `referenceThemeCss()` basıyor; bu fonksiyon (`theme.ts:138`) sabit `referencePalette`
   değerlerini `--r-*` değişkenlerine yazıyor. `tokens.ts:287` yorumu: *"the CMS colour editor is
   retired for the public site"*. CMS "Farben & Design" teması (`themeCss()`) kodda yalnız
   **`/mein-training`** (`mein-training/layout.tsx:42`) ve **login/auth shell**
   (`components/auth/auth-shell.tsx:27`) tarafından uygulanıyor.
   → Public sitenin canlı renkleri = `referencePalette.dark` (kodda sabit). CMS temasının canlı
   değerleri (DB) **DOGRULANAMADI**, ama bunlar public siteyi değil, web müşteri alanını etkiliyor.
2. **Header logosu CMS medyası değil, paketli dosya.** `(site)/layout.tsx:54`
   `const logo = BRAND_LOGO.src;` → `/brand/vitruv-logo-v2.png` (`lib/brand.ts:9`, 704×400 RGBA).
   CMS'te `seo.logo` alanı hâlâ var (`packages/contracts/src/cms/sections.ts:327-328`) ama site
   layout'u onu okumuyor. Repoda `kreis-logo-neu.png` adlı **hiçbir dosya yok** (aşağıda §1).
   `CLAUDE.md` hâlâ `kreis-logo-neu.png`'yi anıyor → doküman/kod tutarsızlığı.
3. **Public site Jost/Bodoni değil, app ile aynı fontları kullanıyor.** `public-functional.css:14-17`
   `.vt-site[data-surface='public']:not(.vt-pshell)` içinde `--font-heading: Chakra Petch`,
   `--font-label: Barlow Condensed`, `--font-body: Barlow`; `public-reference.css:13`
   `font-family: var(--font-barlow)`. Jost/Bodoni Moda yalnız `.vt-pshell` (web müşteri alanı
   `/mein-training`), admin ve auth shell'de. → **iOS app'in mevcut font seti (Chakra Petch / Barlow
   Condensed / Barlow) canlı public site ile birebir aynı.** Bu büyük bir avantaj.

---

## 1. Logo

| Konu | Bulgu | Kanıt | Durum |
|---|---|---|---|
| Sitede kullanılan logo dosyası | `apps/web/public/brand/vitruv-logo-v2.png` — 704×400 PNG, RGBA, "siyah mürekkep, şeffaf zemin" (ensō işareti + VITRUV wordmark). Yorum: *"the owner's NEW logo (Archiv.zip, confirmed 2026-11-18) … unchanged, only trimmed and scaled"* | `apps/web/src/lib/brand.ts:1-9` (`BRAND_LOGO`) | MEVCUT |
| Kullanım yerleri | Public header + footer (`(site)/layout.tsx:72,82`), admin shell (`admin/(shell)/layout.tsx:29`), web müşteri alanı (`mein-training/layout.tsx:65`) | grep `BRAND_LOGO` | MEVCUT |
| `kreis-logo-neu.png` | Repoda (node_modules/.next hariç) bu adla dosya **yok**. CMS medya deposunda olabilir — DB/obje deposu okunamadı | `find -iname '*kreis*'` → yalnız `assets-source/media/KREIS.jpg`, `KREIS-d748bd63.jpg` (yalnız adları listelendi) | DOGRULANAMADI |
| CMS logo alanı | `seo.logo: media.optional()` var, public layout kullanmıyor | `contracts/src/cms/sections.ts:327-328` | KISMEN MEVCUT (alan var, kullanılmıyor) |
| Kaynak ham logolar | `assets-source/media/VITRUV LOGO.png`, `VITRUV LOGO Kopie.png`, `VITRUV LOGO-338d8f65.png`, `KREIS.jpg` (yalnız dosya adları; açılmadı) | `ls assets-source/media` | MEVCUT (referans, production değil) |
| OG görseli | `apps/web/public/brand/og-image.jpg` 1200×630, "white logo centred on black" | `brand.ts:15-21` | MEVCUT |
| Login ikonu | `apps/web/public/brand/login-icon.png` 96×96 RGBA; CSS **mask** olarak kullanılıyor (rengi `currentColor`/tema belirliyor) | `public-reference.css:462-468` (`.r-links__login-icon`) | MEVCUT |
| Vektör (SVG) logo | Yok; `DESIGN-SYSTEM.md §10` "❌ missing" | `docs/DESIGN-SYSTEM.md:209` | EKSIK |
| Varyantlar (açık/koyu) | Tek dosya (siyah). Koyu zeminde CSS filtresiyle beyaza çevriliyor | aşağıda | KISMEN MEVCUT |

**Sitede ters çevirme:**
- `referencePalette.dark.logoFilter = 'invert(1)'`, `light.logoFilter = 'none'` (`tokens.ts:312, 342`)
  → `theme.ts:96` `--r-logo-filter`, `theme.ts:126` `--vt-logo-filter`.
- `.r-brand__logo { height: 46px; filter: var(--r-logo-filter); }` (`public-reference.css:280-288`),
  footer `.df-logo img { height: clamp(56px, 6vw, 72px); filter: var(--r-logo-filter); }` (`:3064-3069`).
- CMS teması koyu zeminde `--vt-logo-filter: invert(1) brightness(1.15)` (`theme.ts:48`, eşik:
  luminance < 0.18).
- Mobilde (<820px) logo `r-logo-flicker` animasyonu alır, `prefers-reduced-motion`'da kapanır
  (`public-reference.css:509-512, 3718-3722`).

**Flutter'ın paketlediği:** `pubspec.yaml` `assets:` yalnız 3 OFL lisans metni; `apps/mobile/assets/`
altında yalnız `fonts/`. **Hiçbir logo görseli paketli değil** → EKSIK. Login ekranı logonun yerine
metin eyebrow `l10n.appTitle` ("VITRUV") kullanıyor (`features/auth/login_screen.dart` `SectionIntro(eyebrow: l10n.appTitle …)`).
iOS app ikonu: `ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-1024x1024@1x.png` 10 932 bayt,
2026-10-15 scaffold tarihli; `LaunchImage*.png` 68 bayt (boş yer tutucu). Flutter varsayılan ikonu
olduğu kuvvetle muhtemel ama görsel olarak açılmadı → **DOGRULANAMADI** (markalı ikon için
`DESIGN-SYSTEM.md §10` "Favicon / app icon source ❌" kaydı EKSIK durumunu destekliyor).

**Öneri (yeni logo değil):** `vitruv-logo-v2.png` dosyasının **aynısını** (değiştirmeden) app'e system
asset olarak almak (`apps/mobile/assets/brand/`), koyu zeminde `ColorFiltered` ile invert
(sitedeki `invert(1)` ile eşdeğer) veya sahibinden onaylı beyaz varyant istemek. App ikonu için
≥1024 px kare kaynak sahibinden istenmeli; logo yeniden çizilmez/üretilmez.

---

## 2. Renkler

### 2.1 Public site — `referencePalette` (`tokens.ts:292-351` → `theme.ts` `--r-*`)

| Rol | Token | Dark (varsayılan) | Light (header switch) | Nerede |
|---|---|---|---|---|
| Arka plan | `bg` → `--r-bg` | `#050505` | `#f6f6f3` | sayfa, `body:has(.vt-site)` |
| Metin / başlık | `fg` → `--r-fg` | `#f2f2ee` | `#0e1014` | metin, `.r-h2` |
| Primary (dolgu) | `accent` → `--r-accent` | `#4d8dff` | `#1f5fe0` | `.r-btn--primary`, `.r-stick`, rota, featured border |
| Accent metin | `accentText` → `--r-accent-text` | `#5b9dff` | `#1f5fe0` | eyebrow, link, FAQ + |
| Accent üstü metin | `onAccent` → `--r-on-accent` | `#050505` | `#ffffff` | mavi buton etiketi |
| Kart | `card` → `--r-card` | `#0e0e0e` | `#ecece8` | `.r-slot`, medya kartları |
| Paket kartı | `cardPackage` | `#0c0c0c` | `#ffffff` | paket kartları |
| Hero zemini | `heroBg` | `#0a0a0a` | `#e4e4df` | video arkası |
| Footer | `footer` | `#000000` | `#ecece8` | footer |
| Çizgi tabanı | `lineRgb` | `255,255,255` | `0,0,0` | hairline'lar `rgba(line, .07/.1/.22)` |
| Glow | `glowRgb` / `btnGlowRgb`+`btnGlowAlpha` | `91,157,255` / `70,140,255` @0.35 | `31,95,224` / `37,99,235` @0.3 | buton glow |
| Halo | `haloRgb` | `160,205,255` | aynı | buton iç halo |
| Glitch | `glitchRgb` | `255,60,170` | `220,40,120` | menü glitch efekti |
| İkinci accent (Cantaloupe) | `spark` → `--r-spark` | `#fc734d` | `#b5401f` | eyebrow noktası (`public-reference.css:73`), `:1899`, `:2692`, `:2838`, `:2887` |
| Kredi | `credit` / `creditShine` | `#2f8bff` / `#bfe0ff` | `#0047ab` / `#1a5fd6` | "Designed by Bleibsichtbar" (app'e taşınmaz) |

Türetilmiş roller (`theme.ts:105-127`): `--color-fg-muted = rgba(fg, .66)`, `--color-fg-subtle =
rgba(fg, .55)`, `--color-border = rgba(line, .10)`, `-subtle .07`, `-strong .22`,
`--color-surface-hover = rgba(line, .03)`, `--color-overlay = rgba(bg, .86)`.

Not: public sitede **semantik success/warning/error rengi `referencePalette`'te yok** — formlar
genel token'lardan alıyor.

### 2.2 Flutter app — `colorsDark` → `VitruvColors.dark` (`tokens.ts:117-138`, `vitruv_tokens.g.dart:14-35`)

| Rol | Kaynak | HEX (alpha) | Flutter `Color` | Kullanım (app) |
|---|---|---|---|---|
| `bg` | `palette.ink950` | `#050505` | `0xFF050505` | scaffold, `ColorScheme.surface` |
| `surface` | `ink850` | `#0e0e0e` | `0xFF0E0E0E` | kart, `surfaceContainer*` |
| `surfaceSunken` | `ink900` | `#0a0a0a` | `0xFF0A0A0A` | NavigationBar zemini |
| `surfaceHover` | white @0.03 | `#ffffff` 3% | `0x08FFFFFF` | basılı/hover yıkama |
| `overlay` | ink950 @0.72 | `#050505` 72% | `0xB8050505` | `scrim` |
| `fg` | `paper50` | `#f2f2ee` | `0xFFF2F2EE` | ana metin |
| `fgMuted` | paper50 @0.66 | `#f2f2ee` 66% | `0xA8F2F2EE` | gövde metni |
| `fgSubtle` | paper50 @0.50 | `#f2f2ee` 50% | `0x80F2F2EE` | caption/meta |
| `fgDisabled` | paper50 @0.35 | `#f2f2ee` 35% | `0x59F2F2EE` | yalnız disabled |
| `accent` (primary) | `blue500` | `#4d8dff` | `0xFF4D8DFF` | FilledButton, progress |
| `accentHover` | `blue400` | `#5b9dff` | `0xFF5B9DFF` | pressed |
| `accentText` (secondary) | `blue400` | `#5b9dff` | `0xFF5B9DFF` | eyebrow, seçili nav |
| `onAccent` | ink950 | `#050505` | `0xFF050505` | buton etiketi |
| `border` | white @0.10 | | `0x1AFFFFFF` | `outlineVariant`, divider |
| `borderSubtle` | white @0.07 | | `0x12FFFFFF` | kart kenarı |
| `borderStrong` | white @0.22 | | `0x38FFFFFF` | `outline` |
| `focusRing` | blue400 | `#5b9dff` | `0xFF5B9DFF` | odak halkası |
| `success` | `green400` | `#3ddc97` | `0xFF3DDC97` | durum |
| `warning` | `amber400` | `#ffc24b` | `0xFFFFC24B` | durum |
| `error` | `red400` | `#ff6b6b` | `0xFFFF6B6B` | form hatası |

`VitruvColors.light` (`#f6f6f3` / `#0e1014` / accent `#1f5fe0` / hover `#184bb8` / success
`#0f7a4d` / warning `#9a5b00` / error `#c62828`) üretiliyor ama `app.dart:20` `themeMode: ThemeMode.dark`.

**Eşleşme:** `VitruvColors.dark` ile `referencePalette.dark` **bg, fg, accent, accentText, onAccent,
card(=surface), heroBg(=surfaceSunken)** değerlerinde birebir aynı. Fark: app'te `fgSubtle` 0.50,
sitede 0.55; app'te **`spark` (#fc734d) yok**; sitedeki `cardPackage #0c0c0c` ve `footer #000000`
app'te yok.

### 2.3 Diğer paletler (bilgi)

- `colorsGlass` (web müşteri alanı `/mein-training` + admin, monokrom): bg `#070708`, fg `#f4f4f5`,
  accent `#f4f4f5`, accentHover `#e4e4e7`, accentText `#d4d4d8`, success/warn/error = dark ile aynı
  (`tokens.ts:225-246`). Web müşteri alanı ayrıca CMS `themeCss()` ile ezilir → canlı değerler
  **DOGRULANAMADI**.
- `colorsPublic` ("Greek Harmony" krem/altın, `tokens.ts:168-189`) ve `colorsAdmin` — public sitede
  `referencePalette` tarafından eziliyor; app için önerilmez.
- `themePresets.blue` (`tokens.ts:359-365`) — CMS editör hazır ayarı.

### 2.4 Kontrast (WCAG 2.1, sRGB göreli parlaklık; alpha arka plana karıştırılarak hesaplandı)

| Ön plan / Arka plan | Oran | AA normal metin (4.5) | Not |
|---|---|---|---|
| `#f2f2ee` / `#050505` (fg/bg) | **18.16:1** | ✔ | |
| `#f2f2ee` / `#0e0e0e` (fg/surface) | 17.20:1 | ✔ | sayaç rakamları kart içinde |
| fg@0.66 / `#050505` (fgMuted) | 7.87:1 | ✔ | kart üstünde 7.73:1 |
| fg@0.55 / `#050505` (site fgSubtle) | 5.66:1 | ✔ | |
| fg@0.50 / `#050505` (app fgSubtle) | 4.87:1 | ✔ (sınırda) | kartta 4.88:1 |
| fg@0.45 / `#0c0c0c` (site `.r-package__note`) | 4.18:1 | ✘ | webde küçük not metni AA altı — app'e taşınmamalı |
| `#5b9dff` / `#050505` (accentText) | 7.48:1 | ✔ | kartta 7.09:1 |
| `#4d8dff` / `#050505` (accent UI sınırı) | 6.38:1 | ✔ (≥3 yeter) | |
| `#050505` / `#4d8dff` (buton etiketi) | 6.38:1 | ✔ | pressed `#5b9dff` üstünde 7.48:1 |
| `#fc734d` / `#050505` (spark) | 7.47:1 | ✔ | kartta 7.08:1 (tokens yorumundaki 7.3 ile tutarlı) |
| `#3ddc97` / `#0e0e0e` (success) | 10.92:1 | ✔ | |
| `#ffc24b` / `#0e0e0e` (warning) | 12.02:1 | ✔ | |
| `#ff6b6b` / `#0e0e0e` (error) | 6.96:1 | ✔ | |
| `#0e1014` / `#f6f6f3` (light fg/bg) | 17.59:1 | ✔ | |
| `#1f5fe0` / `#f6f6f3` (light accent text) | 5.14:1 | ✔ | |
| `#ffffff` / `#1f5fe0` (light buton) | 5.57:1 | ✔ | |
| `#b5401f` / `#f6f6f3` (light spark) | 5.22:1 | ✔ | beyazda 5.65:1 (yorum "5.3" ≈) |
| `#f4f4f5` / `#070708` (glass) | 18.32:1 | ✔ | |

Otomatik koruma: `contrastRequirements` (`tokens.ts:384-400`) `tokens.test.ts`'te; Dart tarafında
`apps/mobile/test/theme_test.dart` mevcut (dosya adı listelendi). `referencePalette` ve `spark` bu
gereksinim listesinde **yok** → app'e `spark` eklenirse kontrast testine de eklenmeli.

---

## 3. Tipografi

### 3.1 Font aileleri — nerede ne kullanılıyor

| Font | Rol | Nerede | Kanıt | App'te |
|---|---|---|---|---|
| **Chakra Petch** 700 + 700 italic | heading (display/h1-h3, uppercase) | Public site, app | `tokens.ts:406`, `public-functional.css:14`, `public-reference.css` 15× `var(--font-heading)` | ✔ paketli |
| **Barlow Condensed** 600 | label (eyebrow, caption, button) | Public site, app | `tokens.ts:407`, `public-reference.css` 29× `var(--font-label)` | ✔ paketli |
| **Barlow** 400/500/600 | body | Public site, app | `tokens.ts:408`, `public-reference.css:13` | ✔ paketli |
| **Jost** 300/400/500/600 | public-sans | Yalnız web müşteri alanı (`.vt-pshell`), admin, auth shell | `tokens.ts:537`, `fonts.ts:56-62`, `tokens.generated.css:221` | ✘ (gerek yok) |
| **Bodoni Moda** 500 italic | public-serif (vurgu kelime) | admin.css:411, portal.css:739/817, public-motion.css:391/1604 | `tokens.ts:538`, `fonts.ts:64-70` | ✘ |

Web yükleme: `apps/web/src/lib/fonts.ts` — `next/font/google` (build'de indirilip self-host),
`subsets: ['latin']`, `display: 'swap'`; ilk üç ailede `adjustFontFallback: false`.

### 3.2 Ölçek (`typeScale`, `tokens.ts:449-529`; app'te aynen `VitruvType`)

| Rol | Aile | Ağırlık | Boyut px (360→1440 fluid) | line-height | letter-spacing (em) | Büyük harf |
|---|---|---|---|---|---|---|
| display | Chakra Petch | 700 *italic* | 40 → 80 | 1.0 | −0.01 | ✔ |
| h1 | Chakra Petch | 700 | 32 → 54 | 1.04 | −0.005 | ✔ |
| h2 | Chakra Petch | 700 | 28 → 48 | 1.05 | −0.005 | ✔ |
| h3 | Chakra Petch | 700 | 22 → 30 | 1.1 | 0 | ✔ |
| title | Barlow | 500 | 19 → 22 | 1.35 | 0 | |
| eyebrow | Barlow Condensed | 600 | 12 | 1.3 | **0.22** | ✔ |
| bodyLg | Barlow | 400 | 17 → 19 | 1.7 | 0 | |
| body | Barlow | 400 | 16 | 1.7 | 0 | |
| bodySm | Barlow | 400 | 14 | 1.6 | 0 | |
| caption | Barlow Condensed | 600 | 12 | 1.3 | **0.16** | ✔ |
| button | Barlow Condensed | 600 | 12 | 1.0 | **0.20** | ✔ |

Sitedeki gerçek değerler (prototipten 1:1, token'dan değil): `.r-eyebrow` 11px / 0.2em / pill çerçeve
(`public-reference.css:46-64`); `.r-btn` 12px / **0.18em** (`:187-206`); `.r-stick` 12px / 0.18em;
`.r-package__badge` 10px / 0.18em (`:1460-1470`); `.r-h2` `clamp(28px,3.6vw,48px)` / 1.05 / −0.005em
(`:80-90`); `.r-brand__word` 13px / 0.28em; mobil menü 0.2em. Token'lar 12px minimum kuralını koruyor
(DEVIATION notları `tokens.ts:493, 509`) — app token'ları izlemeli, sitedeki 10–11px değerleri değil.

Flutter: `VitruvTextRole.style()` `letterSpacing = em × size` (`vitruv_token_types.dart:102`);
uppercase `role.apply(text)` ile (`:108`). Başlıklar `textScaler.clamp(maxScaleFactor: 1.5)`
(`shared/ui/typography.dart:63`).

### 3.3 Flutter font dosyaları ve lisans

| Kontrol | Bulgu | Durum |
|---|---|---|
| `pubspec.yaml` `fonts:` | Barlow (Regular/Medium 500/SemiBold 600), Barlow Condensed (SemiBold 600), Chakra Petch (Bold 700, BoldItalic 700) | MEVCUT |
| TTF dosyaları | `apps/mobile/assets/fonts/*.ttf` 6 dosya, `fontFaces` (`tokens.ts:413-420`) ile birebir; senkron testi `packages/design-tokens/src/sync.test.ts` | MEVCUT |
| `google_fonts` paketi | Kullanılmıyor (pubspec'te yok) — çevrimdışı/gizlilik açısından doğru | MEVCUT (bilinçli) |
| Lisans metinleri | `OFL-Barlow.txt`, `OFL-BarlowCondensed.txt`, `OFL-ChakraPetch.txt` — "SIL Open Font License, Version 1.1"; `main.dart:22` `LicenseRegistry.addLicense` ile kaydediliyor | MEVCUT |
| iOS'a gömme | SIL OFL 1.1 uygulama içine gömmeye ve ticari dağıtıma izin verir (fontun tek başına satılmaması şartıyla) | MEVCUT |
| Jost / Bodoni lisans dosyası | Repoda yok (web'de next/font ile indiriliyor); app için gerekmiyor | — |
| Yasak fontlar | `AlveroSignatureDEMO.otf` (yalnız `assets-source`'ta, dosya adı), Avenir Next — **önerilmiyor** | — |
| Tabular rakamlar | Sayaçta `FontFeature.tabularFigures()` (`countdown_panel.dart:191`); Barlow'un `tnum` desteği bu denetimde font dosyası incelenmeden **DOGRULANAMADI** | DOGRULANAMADI |

---

## 4. Bileşenler, şekil, efekt, hareket

### 4.1 Butonlar (site)

| Sınıf | Stil | Kanıt |
|---|---|---|
| `.r-btn` | `padding 18px 34px`, `border-radius 2px`, **chamfer 12px** `clip-path: polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px)` (sol üst + sağ alt kesik), Barlow Condensed 600 12px 0.18em uppercase | `public-reference.css:187-206` |
| `.r-btn--primary` | dolgu `--r-accent`, glow `0 0 24px var(--r-btn-glow), 0 0 2px rgba(halo,.8)`; hover `translateY(-2px)` + `0 0 40px rgba(glow,.45)`, 500ms | `:207-224` |
| `.r-btn--glass` | `rgba(line,.06)` + 1px `rgba(line,.3)` kenar + köşelerde 135° çizgi (kesik köşe çizgisi), `backdrop-filter: blur(8px)` | `:225-248` |
| `.r-btn--outline` | 1px `rgba(line,.22)`, hover'da fg dolgu / bg metin | `:1498-1520` |
| `.r-stick` | sağ kenar sekmesi, `min-height: 48px`, **yalnız sol üst** 12px kesik `polygon(12px 0,100% 0,100% 100%,0 100%,0 12px)`, accent dolgu + glow; `--light` varyantı beyaz zemin + `color-mix(accent 72%, black)` metin (AA için); focus `outline 2px solid fg, offset −4px`; ≤820px'te alt çubuk | `:311-372` |
| `.r-package__badge` | 7px chamfer, 10px etiket, accent glow | `:1460-1470` |
| Yardımcılar | `.r-cut-12/14/16` chamfer clip-path'leri | `:155-185` |

### 4.2 Kart, kenar, gölge, boşluk, radius

| Öğe | Değer | Kanıt |
|---|---|---|
| Kart/medya slotu | `--r-card` zemin + `1px rgba(line,.1)` kenar | `.r-slot` `public-reference.css:142-147` |
| Chamfer token'ları | xs 7 · sm 12 · md 14 · lg 16 | `tokens.ts:683`, `VitruvShape.chamfer*` |
| Radius | xs 2 · sm 4 · md 12 · lg 22 · xl 28 · pill 999 | `tokens.ts:685` |
| Kenar kalınlığı | hairline 1 · strong 1.5 · focus 2 · focusOffset 3 | `tokens.ts:686-687` |
| Gölge (glow) | `glow` 24px `#468cff`@.35 + 2px `#a0cdff`@.8; `glowStrong` 72px `#5b9dff`@.32; `glowSoft` 38px `#5b9dff`@.14; `backdropBlur` 14 | `tokens.ts:702-714`, `VitruvEffects` |
| Boşluk | 4px taban: 0,4,8,12,16,20,24,28,32,36,40,44,48,56,64,80,96,112 | `tokens.ts:636-656`, `VitruvSpace` |
| Dokunma hedefi | `layout.tapTarget = 48` | `tokens.ts:675`, `VitruvLayout.tapTarget` |
| Header | `rgba(bg,.6)` + `blur(18px) saturate(140%)`, alt hairline `.07`, yükseklik 64px | `public-reference.css:249-256, 10` |

Not: proje kuralı "8px grid" (kök `CLAUDE.md`) — token ölçeği 4px tabanlı ama 8'in katlarını içeriyor;
app'te tercihen `s2/s4/s6/s8/s12…` kullanılmalı.

### 4.3 Hareket

| Token | Değer | Kanıt |
|---|---|---|
| Süreler | micro 200 · short 400 · base 600 · long 900 ms | `tokens.ts:720-725`, `VitruvMotion` |
| Easing | `out` cubic-bezier(0.22, 1, 0.36, 1) · `inOut` (0.45, 0, 0.2, 1) | `tokens.ts:726-731` |
| Site | `--r-ease: cubic-bezier(0.22,1,0.36,1)` (`public-reference.css:11`); public-functional'da `--vf-ease: cubic-bezier(0.16,1,0.3,1)` (`public-functional.css:18`) | — |
| Reduced motion | `reducedMotion: { durationMs: 0, disableAmbient: true }`, `maxFlashesPerSecond: 3` | `tokens.ts:733-735` |

Not: kök `CLAUDE.md` varsayılan easing'i `cubic-bezier(0.16,1,0.3,1)` diyor; VITRUV token'ı
`(0.22,1,0.36,1)`. Proje içi kaynak (tokens.ts) esas alınmalı.

### 4.4 İkonlar

| Platform | Set | Kanıt | Durum |
|---|---|---|---|
| Web | `lucide-react ^1.57.0` (ISC) | `apps/web/package.json:20` | MEVCUT |
| Flutter | Material `Icons.*` (+ `cupertino_icons` bağımlılığı) — ör. `Icons.timer_outlined`, `Icons.fitness_center` | `shared/shell/app_shell.dart:42-63`, `countdown_panel.dart:162` | KISMEN MEVCUT (Lucide ile görsel eşlik yok) |
| Marka ikonları | CMS medyası (Neun Stufen, Lebenssituationen) — bileşene gömülmez | `CLAUDE.md` | — |

---

## 5. Mevcut Flutter tema durumu

| Dosya | İçerik | Durum |
|---|---|---|
| `lib/core/theme/vitruv_tokens.g.dart` (325 satır, GENERATED) | `VitruvColors.dark/light/public/admin/glass`, `VitruvFonts`, `VitruvType` (11 rol), `VitruvSpace`, `VitruvLayout`, `VitruvShape`, `VitruvEffects`, `VitruvMotion` | MEVCUT |
| `lib/core/theme/vitruv_token_types.dart` | `VitruvColorScheme`, `VitruvTextRole` (fluid boyut, em→px tracking, uppercase) | MEVCUT |
| `lib/core/theme/app_theme.dart` | `AppTheme.dark()/light()` — yalnız token'lardan `ColorScheme`, `TextTheme`, AppBar, NavigationBar (chamfer indicator), Filled/Outlined button (chamfer sm, 48 min), Card (chamfer md), `VitruvTheme` ThemeExtension | MEVCUT |
| `lib/core/theme/chamfer_shape.dart` | `ChamferCut` enum + `chamferBorder()` = `BeveledRectangleBorder` (sol üst + sağ alt) — sitedeki `.r-btn` clip-path ile aynı geometri | MEVCUT |
| `lib/shared/ui/` | `VitruvButton` (primary/secondary/ghost, md 48 / lg 56, loading, reduced motion, ikon textScaler), `VitruvCard`, `chamfer.dart`, `media_frame.dart`, `pressable.dart` (haptic), `status.dart`, `typography.dart` (`SectionTitle`, `SectionIntro`, `Eyebrow`, `MetaLabel`) | MEVCUT |
| `lib/features/design_gallery/` | Geliştirme galerisi `/design` (Farben, Typografie, Abstände, Chamfer & Glow, Buttons, Karten, Media Frame, Labels & Status, Navigation); release'de kapalı (`design_gallery_access.dart`, `VITRUV_DESIGN_GALLERY` define) | MEVCUT |
| `lib/app.dart` | `themeMode: ThemeMode.dark`, `locale: Locale('de')` | MEVCUT |
| `lib/features/workout/countdown_panel.dart` | Sayaç: `theme.textTheme.displaySmall` + tabular rakam, `LinearProgressIndicator`, haptic, semantics duyuruları, reduced motion | KISMEN MEVCUT (bkz. boşluklar) |

**Website kimliğine yakınlık:** Yüksek. Renk çekirdeği (`#050505/#f2f2ee/#4d8dff/#5b9dff/#0e0e0e`),
fontlar, büyük harf + tracking, chamfer, glow ve hareket eğrisi public site ile aynı kaynaktan.

**Boşluklar:**
1. **Logo/app ikonu/launch screen** markasız (§1) — EKSIK.
2. **`spark` (#fc734d) app paletinde yok** — `referencePalette`'te var, `colorsDark`'ta rol yok → Dart'a üretilmiyor. EKSIK.
3. **Büyük sayaç tipografisi token'sız:** `countdown_panel.dart` `displaySmall` kullanıyor ama
   `AppTheme` `TextTheme`'de `displaySmall`'ı tanımlamıyor (`app_theme.dart:40-53` yalnız
   `displayLarge`…`labelSmall`'ın bir kısmı) → Material varsayılanı + `fontFamily: Barlow` (yaklaşık
   36/400) düşer; marka "Chakra Petch bold" sayaç değil. Ayrıca `timer`/`numeric` rolü `typeScale`'de yok. EKSIK.
4. **İkon seti** webde Lucide, app'te Material → görsel dil farkı. KISMEN MEVCUT.
5. **`.r-stick` tipi tek köşe chamfer** ve `.r-btn--glass` kenarlı kesik köşe çizgisi app'te yok
   (`ChamferCut` yalnız iki köşe). KISMEN MEVCUT.
6. **Eyebrow pill** (sitedeki 999px çerçeve + `spark` nokta, `public-reference.css:46-74`) app'te
   `Eyebrow` düz metin. KISMEN MEVCUT.
7. **Dil:** `lib/l10n/app_en.arb` (147 satır) de mevcut ve `supportedLocales` = AppLocalizations
   listesi; `locale` 'de' sabit. "Yalnız Almanca UI" hedefiyle tam uyumlu değil. KISMEN MEVCUT.
8. **Yönelim:** `ios/Runner/Info.plist:67-71` iPhone için landscape açık — antrenman sayacı için
   tasarım kararı gerekli. DOGRULANAMADI (ürün kararı).
9. **iOS build** Windows'tan doğrulanamaz (`CLAUDE.md` Mobile). DOGRULANAMADI.

---

## 6. Flutter uygulama planı (iPhone Training App)

İlke: **tek kaynak** `packages/design-tokens/src/tokens.ts` → `pnpm --filter @vitruv/design-tokens generate`
→ `vitruv_tokens.g.dart`. `.g.dart` elle düzenlenmez; `app_theme.dart`/widget'larda renk/ölçü literal'i yok.
Yeni logo veya yeni palet yok; yalnız mevcut değerlerin app'e taşınması.

### 6.1 Token adımları (tokens.ts — sahibinin onayıyla, ayrı sprint görevi)
- `ColorRole`'a opsiyonel `spark` (veya `accentSecondary`) rolü: dark `#fc734d` (= `referencePalette.dark.spark`),
  light `#b5401f`; tek değer kaynağı olarak `referencePalette`'e referans verilmeli (kopya hex değil).
  `contrastRequirements`'a `spark/bg`, `spark/surface` ≥ 4.5 eklenmeli.
- `typeScale`'e `timer` (veya `numeric`) rolü: Chakra Petch 700, uppercase yok, tabular, örn. 64→96
  fluid, lineHeight 1.0, tracking −0.01 (display ile aynı aile). Değerler sahibine sunulup onaylanmalı.
- Gerekirse `chamfer` için tek köşe varyantı (yalnız sol üst, `.r-stick`) — `shape`'e anahtar olarak.

### 6.2 ThemeData / ColorScheme eşlemesi (mevcut, korunmalı)
| Material slot | Token |
|---|---|
| `primary` / `onPrimary` | `accent #4d8dff` / `onAccent #050505` |
| `secondary` | `accentText #5b9dff` |
| `tertiary` (öneri) | `spark #fc734d` (token eklendikten sonra) |
| `surface` / `onSurface` / `onSurfaceVariant` | `bg #050505` / `fg #f2f2ee` / `fgMuted` |
| `surfaceContainer*` | `surface #0e0e0e`, `surfaceSunken #0a0a0a` |
| `outline` / `outlineVariant` | `borderStrong` / `border` |
| `error` | `#ff6b6b` |
| ThemeExtension | `VitruvTheme` (success/warning/fgSubtle/focusRing) |

`TextTheme`'e eksik slotlar (`displayMedium`, `displaySmall`, `labelLarge` vb.) token rolleriyle
doldurulmalı ki hiçbir widget Material varsayılanına düşmesin.

### 6.3 Metin teması
- Paketli OFL fontlar (Chakra Petch / Barlow Condensed / Barlow) — mevcut; yeni font eklenmez.
- Etiketler `role.apply()` ile uppercase + em tracking (button 0.20, eyebrow 0.22, caption 0.16).
- **Dynamic Type:** gövde metni tam `textScaler`; başlıklar `clamp(maxScaleFactor: 1.5)` (mevcut);
  sayaç rakamı `FittedBox`/sabit genişlik + tabular ile 2× metinde taşmadan ölçeklenmeli.

### 6.4 Bileşen kiti
- **VButton** = mevcut `VitruvButton`: chamfer sm (12), min 48 dp, primary glow (`VitruvEffects.glow`),
  basılıda `accentHover`. Ek: `stick` varyantı (tek köşe) ve `glass/outline` varyantı (köşe çizgili) —
  site parity.
- **Kart** = `VitruvCard` (chamfer md 14, `borderSubtle`, glow yalnız `glow: true`).
- **Eyebrow pill** = 999 radius, `rgba(glow,.45)` 1px kenar, 6px `spark` nokta, `accentText` metin.
- **Timer display**: tam ekran set/dinlenme sayacı — `timer` rolü, `fg` (bitti: `fgMuted`), ilerleme
  çubuğu `accent` üstünde `borderSubtle`; son 3 sn için `spark` vurgusu (yalnız renk, yanıp sönme yok;
  `maxFlashesPerSecond: 3`). Mevcut semantics/haptic/lifecycle mantığı (`countdown_panel.dart`) korunur.
- **İkon:** Lucide'ın Flutter paketi (ISC) değerlendirilebilir — lisans/bağımlılık kararı sahibinde;
  karar verilene kadar Material Icons, marka ikonlarıyla karıştırılmaz.

### 6.5 Platform kuralları
- **Dark-first:** `ThemeMode.dark` (mevcut); light ileride kullanıcı tercihi.
- **Yalnız Almanca UI:** tüm stringler `app_de.arb` (template) üzerinden; `app_en.arb`'nin tutulup
  tutulmayacağı sahibine sorulmalı; Almanca UI terimleri (Training, Satz, Pause, Weiter …) korunur.
- **Dokunma hedefi:** Apple HIG ≥ 44 pt; proje kuralı **48** (`VitruvLayout.tapTarget`) — 48 uygulanır
  (HIG'i de karşılar). Sayaç kontrol butonları `lg` (56) önerilir.
- **Safe area:** her ekran `SafeArea` (Dynamic Island / home indicator); alt nav `NavigationBar` zaten safe.
- **Reduced motion:** `MediaQuery.disableAnimationsOf` (mevcut) → süreler 0, glow animasyonu yok,
  glitch/flicker app'te yok (DESIGN-SYSTEM §13.6).
- **Kontrast:** yeni rol eklenince Dart `theme_test.dart` + `tokens.test.ts` genişletilir.
- **iOS doğrulama:** build/imza macOS + Xcode'da; Windows'tan sonuç iddia edilmez.

---

## 7. Özet tablo

| Alan | Konu | Durum |
|---|---|---|
| Logo | Site logosu `apps/web/public/brand/vitruv-logo-v2.png` (paketli, `BRAND_LOGO`) | MEVCUT |
| Logo | `kreis-logo-neu.png` (CLAUDE.md'de geçiyor) repoda | DOGRULANAMADI |
| Logo | CMS `seo.logo` alanı public layout'ta kullanımı | KISMEN MEVCUT |
| Logo | Koyu zeminde invert (`--r-logo-filter: invert(1)`) | MEVCUT |
| Logo | Vektör (SVG) logo | EKSIK |
| Logo | Flutter'da logo asset'i | EKSIK |
| Logo | Markalı iOS app ikonu / launch screen | DOGRULANAMADI (büyük olasılıkla varsayılan) |
| Renk | `referencePalette` dark/light (public) | MEVCUT |
| Renk | Canlı CMS tema değerleri (DB; `/mein-training` + auth) | DOGRULANAMADI |
| Renk | `VitruvColors.dark` ↔ site çekirdek renkleri eşleşmesi | MEVCUT |
| Renk | `spark #fc734d` app'te | EKSIK |
| Renk | Semantik success/warning/error (app) | MEVCUT |
| Renk | AA kontrast (ana çiftler) | MEVCUT |
| Tipografi | Chakra Petch / Barlow Condensed / Barlow — site + app aynı | MEVCUT |
| Tipografi | Flutter TTF + OFL lisans kaydı | MEVCUT |
| Tipografi | Jost / Bodoni Moda (app için gerekli değil) | — |
| Tipografi | Sayaç (timer) rolü / `displaySmall` token'lı | EKSIK |
| Tipografi | Barlow tabular rakam desteği | DOGRULANAMADI |
| Bileşen | Chamfer (iki köşe) buton/kart | MEVCUT |
| Bileşen | Tek köşe `.r-stick` / glass-outline köşe çizgisi | KISMEN MEVCUT |
| Bileşen | Eyebrow pill + spark nokta | KISMEN MEVCUT |
| Bileşen | Glow, spacing, radius, motion token'ları | MEVCUT |
| İkon | Lucide (web) ↔ Material (app) | KISMEN MEVCUT |
| Flutter | Tema, token üretimi, design gallery | MEVCUT |
| Platform | Yalnız Almanca UI (en.arb mevcut) | KISMEN MEVCUT |
| Platform | 48 dp hedef, reduced motion, Dynamic Type clamp, SafeArea | MEVCUT |
| Platform | iPhone yönelim kararı (landscape açık) | DOGRULANAMADI |
| Platform | iOS build doğrulaması (Windows) | DOGRULANAMADI |
