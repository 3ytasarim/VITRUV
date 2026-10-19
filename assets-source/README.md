# assets-source — original source & reference material

Read-only archive of everything the project owner supplied. **Originals are never edited, moved,
renamed or overwritten.** Production code never imports from here.

Physical layout (as supplied — intentionally not reorganized):

| Folder        | Content                                                                         |
| ------------- | ------------------------------------------------------------------------------- |
| `prototypes/` | Design prototypes (`*.dc.html`) — visual/interaction reference only             |
| `documents/`  | Supplied documents (nutrition plan template, mobile design PDF)                 |
| `media/`      | Mixed media: logos, icons, backgrounds, photos, screenshots, video, PDFs, notes |

The logical classification of every file (Branding, Icons, Backgrounds, Website Images,
Situation Images, Videos, Other) lives in [`docs/SOURCE-INVENTORY.md`](../docs/SOURCE-INVENTORY.md).

## Rules

- Classify files in the inventory — do not create sub-folders or rename files to classify them.
- Prototype HTML is reference material: extract tokens, layout ideas and behaviour into proper
  components — never paste monolithic prototype markup into `apps/web`.
- Editorial website images/videos reach production by being **uploaded through the Admin CMS**
  (object storage + `media_assets`) after licence and quality checks — not by copying them into
  `apps/web/public`. System assets (logo mark, UI icons) are prepared deliberately into the app's
  asset directory.
- **Not versioned in Git.** This folder contains personal data, business documents, third-party
  screenshots, unlicensed fonts/stock and sensitive unrelated material. Everything
  except this README is git-ignored. Keep the originals in the shared project drive.
