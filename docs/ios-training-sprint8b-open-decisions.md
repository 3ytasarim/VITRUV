# iOS Training — Sprint 8B: Open Owner Decisions

Status 2026-11-23. None of these were decided by the implementation; nothing was guessed.
"Blocks TestFlight" = an internal TestFlight build cannot be produced/uploaded without it.

| # | Decision | Current state | Recommendation | Blocks TestFlight | Blocks App Store |
|---|---|---|---|---|---|
| D1 | **Bundle ID** | `com.vitruv.vitruvMobile` (provisional) | reverse-DNS of the owner's verified domain; final before the first upload (cannot change later) | yes | yes |
| D2 | **Apple Team / account** | unknown; no `DEVELOPMENT_TEAM` | owner's organisation account (D-U-N-S) if VITRUV is a company, so the seller name is the brand | yes | yes |
| D3 | **Production API URL** | unknown; release build refuses to start without a valid https origin | dedicated API host under the canonical domain (`https://<API_HOST>`) | yes (app would not start) | yes |
| D4 | **Privacy policy URL** | German draft `docs/legal/datenschutzerklaerung-app-entwurf.md`, placeholders open, not published (website page removed in d19cf33) | legal review → publish on the website (canonical host) → URL into App Store Connect | no (internal) | yes |
| D5 | **Account deletion policy** | design + API contract + 0026 proposal (`ios-training-sprint8b-account-deletion.md`); nothing built | in-app deletion *request* for 1.0; define retention/anonymisation; then implement + migrate 0026 via the runbook | no | **review risk** (5.1.1(v)) |
| D6 | **Export compliance** | `ITSAppUsesNonExemptEncryption` not set; standard HTTPS (BoringSSL in Flutter) + Keychain, no custom crypto | likely exempt → owner/legal confirms, then `false` + test update | at upload (questionnaire) | yes |
| D7 | **iPad** | iPhone only (`TARGETED_DEVICE_FAMILY=1`), iPad compatibility mode | keep iPhone-only for 1.0; native iPad later | no | no |
| D8 | **Apple Watch scope** | interface only, flag OFF, no target | not in 1.0; separate sprint on a Mac (`<bundle id>.watchkitapp`) | no | no |
| D9 | **Minimum app version** | mechanism ready, nothing configured (no value invented) | 1.0: leave unset; set only when a later build must be forced and is live in the store | no | no |
| D10 | **Neon rehearsal** | not done (no approval, no Neon access in this sprint) | approve a rehearsal on a production branch before the real 0022–0025 run (runbook §1 step 6) | no | indirectly (API needs 0022–0025) |

## Also open (from earlier sprints, unchanged)

- Privacy-policy legal facts: controller, legal bases, Art. 9 classification of training data,
  subprocessors and regions, retention periods, supervisory authority.
- `MEDIA_URL_SIGNING_KEY` generation and the stage-2 media operator script approval.
- Canonical `PUBLIC_SITE_URL` host (apex vs `www`) for the nginx redirect.
- Demo account creation on the review environment (operator, not automated).
- Real devices: a Mac with Xcode and at least one iPhone for the device plan A–F.
