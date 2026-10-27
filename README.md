# Elets PressFlow AI — demo

**From editorial content to publication-ready pages.**

An interactive product demo of an AI-assisted magazine production platform for Elets Technomedia.
It walks the full workflow — upload content → classify → prepare → generate pages → review & fix →
export — using *Tech Maha Impact — May 2026* as the sample publication. Page geometry, type sizes and
furniture follow the supplied print file (205 × 278 mm trim, 5 mm bleed, Roboto 9/12 pt body, section
running heads with edge tabs, dark folio tabs).

All people, organisations and figures in the sample content are fictional. Sample photography is
locally generated SVG artwork — no external services or API keys are needed.

## Run it

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open http://localhost:3000. Other commands:

```bash
npm run build && npm start   # production build
npm run lint                 # ESLint
npx tsc --noEmit             # type check
```

Demo state is saved in the browser (localStorage). Use **Reset demo data** in the sidebar to start over,
and **Guided demo** in the top bar for the eight-step stakeholder walkthrough.

## Create Like This

Upload a reference magazine PDF on **Create Like This**. Everything runs locally in the browser with
pdf.js — the file is never uploaded.

- **Measured from the PDF:** trim and bleed (TrimBox/BleedBox, including PDFs that keep page
  dictionaries in compressed object streams), every font and point size, body size and leading,
  justification, columns, gutter and margins, image placements, running heads (→ sections) and a
  colour palette from flat-colour areas of rendered pages.
- **Inferred with rules (labelled in the UI):** page type per page (cover, contents, message,
  interview, feature opener, article, infographic, advertisement) — correctable in the page map.
- **Created:** templates whose frame geometry is taken from a model page per type (headline, deck,
  standfirst, threaded body columns, photos, captions, name bands), plus house templates rescaled to the
  reference trim; then a new issue that follows the reference's running order, filled with
  best-fitting Content Library articles. Long stories continue onto following pages.
- Fonts are substituted with the closest available web font; the last two analyses are kept in
  browser storage.

## What is real vs. simulated

| Area | Status |
| --- | --- |
| Layout engine (templates → positioned frames, threaded text across frames and pages, overset detection) | Real, in-browser |
| Text fitting (canvas measurement with the actual page fonts) | Real |
| Quality assurance checks (overflow, missing images/headlines/authors/captions, resolution, frame fill, style overrides, margins, approval, imposition) | Real, computed from page data — a browser preflight, not an InDesign/PDF-X preflight |
| QA fixes (place image, add metadata/caption, switch template, add continuation page, reset style/geometry, approve) | Real |
| Exports: PDF proof (bleed + crop marks), web PDF, PNG page ZIP, JSON content package, InDesign handoff ZIP, print view (vector, via browser print) | Real downloadable files |
| Create Like This — measurement of a reference PDF (boxes, type, grid, images, colour, sections) | Real, in-browser (pdf.js) |
| Create Like This — page classification and style inference | Rule-based heuristics on measured data (labelled) |
| "AI" — classification, summary, pull quotes, headlines, image opportunities, layout recommendation, trim proposals | Simulated with deterministic local heuristics (labelled in the UI) |
| Layout generation progress | Simulated service latency around the real engine |
| Print-ready PDF/X, `.indd`, `.idml`, Adobe preflight | Real, via the Adobe InDesign API once configured (see below) |
| InDesign integration | Server pipeline in `src/server/indesign`; nothing is faked when it is not configured |

## Project structure

```
src/
  app/                 Routes: overview, publications, content, prepare, create, studio, qa, export, templates, settings, proof
  components/
    page/              PageRenderer (single renderer for canvas, thumbnails, proofs and exports), TemplateWireframe
    studio/            Layout Studio, properties panel, generate dialog
    qa/                QA fix runner and dialogs
    shell/             App shell, guided demo, toasts
  data/                Sample articles and seed publication/pages
  lib/
    types.ts           Central data model (mm / pt units)
    templates.ts       15 structured templates (frame geometry, style refs, content bindings)
    design-tokens.ts   House paragraph styles mapped to InDesign style names
    text-engine.ts     Paragraph parsing, measurement and threaded fitting
    layout-engine.ts   Template + article + page overrides → resolved elements
    qa-engine.ts       Preflight checks and fixes
    ai.ts              Local heuristics standing in for AI services
    exporter.ts        PDF / PNG / JSON / handoff package generation
    reference/         Create Like This: analyze.ts (pdf.js measurement), derive.ts (templates + issue)
    store.ts           Zustand store with localStorage persistence and undo/redo
  services/indesign.ts InDesign integration contract and manifest builder
```

## Content conventions

Article bodies are plain text with a blank line between paragraphs. Interviews use `Q:` / `A:` prefixes;
`## ` starts a sub-heading.

## Team backend (server mode)

Set `DATABASE_URL` and PressFlow switches from the single-browser demo to a shared team workspace.
Without it, everything keeps working as the browser demo.

**What the server adds**

- **Sign-in** with Google Workspace (OpenID Connect + PKCE). Only verified addresses on
  `AUTH_ALLOWED_DOMAINS` (and the Workspace `hd` claim) get in. `ADMIN_EMAILS` are always admins.
- **Roles, enforced on the server:** admin, editor, designer, contributor, viewer
  (`src/lib/roles.ts`). Only editors approve articles and pages and release issues to print.
- **Shared workspace** in Postgres (`src/server/db/schema.ts`). The app keeps working on its local
  copy; edits are pushed with the version they started from, so a stale edit is refused rather than
  overwriting a colleague (`src/lib/sync/engine.ts`, `src/server/workspace/sync.ts`). Teammates'
  changes are pulled every few seconds.
- **Audit trail** and article history: sign-ins, approvals, reopenings, releases, role changes,
  uploads (Settings → Team & roles).
- **Original images:** uploads go straight to storage untouched (no resizing or recompression). The
  server measures pixel size, colour space, ICC profile, EXIF rotation and a SHA-256 itself; the app
  only shows a preview. InDesign places the original.
- **Licensed fonts** (Settings → Licensed fonts): parsed with the names InDesign sees, including
  variable-font instances.
- **Server AI** (AI Content Preparation): Claude (`claude-opus-5-5`) when `ANTHROPIC_API_KEY` is set,
  otherwise the built-in rules. Every result is a stored proposal with the accept/reject decision
  logged; pull quotes must appear in the article word-for-word or they are dropped.

**Print-quality guarantees**

1. *What was approved is what prints.* Approval is stamped by the server with a fingerprint of the
   page, its article and its template. Any later change to the page sends it back to review; a
   change to the article or template blocks printing until it is approved again.
2. *Gates before a print build* (Export Center → **Check print readiness**, and again on submit;
   `src/server/print/gates.ts`), checked against the server's records:
   every page approved and unchanged · no blank pages · every font style present in the licensed
   library (no substitution) · originals for every image · effective resolution at placed size
   (blocks below `PRINT_MIN_PPI`, default 200; flags below `PRINT_TARGET_PPI`, default 300) · empty
   required image frames · bleed ≥ 3 mm · PDF/X preset. A blocked print build is never sent to Adobe.
   *Documents* builds (INDD/IDML) show the same findings as advice.
3. *Release sign-off.* When InDesign finishes, outputs are archived in your bucket (Adobe deletes
   them after 24 h). A print build is releasable only if InDesign reports no overset text, no
   missing fonts or images and zero preflight errors; an editor then releases or rejects it with a
   note.

**Setup**

1. Postgres (Neon, Supabase, RDS…): set `DATABASE_URL`. `vercel-build` runs the migrations
   (`npm run db:migrate`) before building.
2. Google Cloud → OAuth client (Web): redirect URI `https://<your-domain>/api/auth/callback/google`.
   Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_ALLOWED_DOMAINS`, `ADMIN_EMAILS`,
   `AUTH_SECRET` (32+ random characters) and `APP_URL`.
3. S3 bucket (the same one the InDesign pipeline uses). Add a CORS rule so the browser can upload
   originals and fonts directly and download originals:
   `[{"AllowedOrigins":["https://<your-domain>"],"AllowedMethods":["GET","PUT"],"AllowedHeaders":["content-type"],"MaxAgeSeconds":3600}]`
4. Optional: `ANTHROPIC_API_KEY` for AI suggestions, `CRON_SECRET` for the daily fallback that
   archives builds nobody was watching (`vercel.json`).
5. Sign in as an admin, click **Set up with the sample issue**, upload the licensed fonts, invite
   the team (they appear after their first sign-in) and set roles.

**Local development** without Docker or Google:

```bash
DATABASE_URL=pglite://.data/pglite AUTH_SECRET=change-me-to-32-or-more-characters AUTH_DEV_LOGIN=1 AUTH_ALLOWED_DOMAINS=elets.in ADMIN_EMAILS=you@elets.in npm run dev
```

PGlite (embedded Postgres) stores the database in `.data/`, files go to `.data/storage`, and the
sign-in page offers a password-less development login (localhost only, never on Vercel) with a role
picker. InDesign builds still need S3 and Adobe credentials.

## Print production with the Adobe InDesign API

Print-ready output is built by **Adobe InDesign in the cloud** (Firefly Services InDesign API), fully
automatically: Export Center → *Print-ready PDF via InDesign* or *InDesign documents*.

**Pipeline**

1. The browser converts the issue into a build manifest (`src/lib/indesign/build-manifest.ts`):
   document setup in points, named paragraph styles with font family/style, every page item
   (frames, images, shapes, gradients, furniture) and story threading order.
2. `POST /api/indesign/jobs` stages the manifest, images and the house fonts in S3 and starts the
   PressFlow custom script (`src/server/indesign/script/build.jsx`), registering it with Adobe on first
   use.
3. Inside InDesign the script builds the document, creates real paragraph styles, threads stories,
   places and crops images, shrinks display lines to fit with InDesign's own composer, runs an Adobe
   preflight profile and exports PDF/X (bleed + crop marks), INDD, IDML and JPEG page previews.
4. The app polls `GET /api/indesign/jobs/:id`; when done, Export Center shows the downloads (Adobe
   temporary storage, ~24 h), InDesign-rendered page previews and the build report (overset text,
   missing fonts, image problems, preflight results).

**Setup**

1. Adobe Developer Console: project with **InDesign API** and an OAuth Server-to-Server credential.
2. AWS S3 bucket plus an IAM user with read/write access to it. Upload your licensed OTF/TTF fonts to
   `<S3_PREFIX>/fonts/`.
3. Set the variables from `.env.example` (Vercel → Settings → Environment Variables, or `.env.local`)
   and redeploy.
4. In the app: Settings → InDesign integration → choose *Adobe InDesign API*, enter the access key
   (`PRESSFLOW_API_KEY`), map font families to your house fonts, click **Test connection**.

**Testing the script without Adobe**: export an *InDesign build package* from the Export Center,
unzip it, then run

```bash
node scripts/indesign-mock.mjs manifest.json links out
```

This runs `build.jsx` against a simulated InDesign object model (checks the script, its outputs and
report, and draws a schematic of every page item). Typesetting and overflow are only estimated there.
After changing `build.jsx`, bump `SCRIPT_VERSION` in `src/server/indesign/pipeline.ts` so Adobe
registers the new version.

## Further InDesign options

1. Stand up **InDesign Server** (or a UXP plugin bridge for desktop InDesign) behind a small HTTP service
   implementing `InDesignService` in `src/services/indesign.ts` (`buildDocument`, `preflight`, `exportDocument`).
2. Build the house **master spreads and paragraph styles** in an `.indt` template whose style names match
   `paragraphStyles[*].indesignName` (e.g. `Body/Justified`, `Head/L`).
3. Write the ExtendScript/UXP builder that reads the handoff `manifest.json`: create pages, place frames
   from `boundsPt`, thread story frames in `threadIndex` order, apply styles, relink images from `links/`.
4. Return InDesign preflight results into the QA screen and enable PDF/X and `.indd`/IDML export.

Validate step 3 against two or three real Tech Maha Impact spreads before widening scope.
