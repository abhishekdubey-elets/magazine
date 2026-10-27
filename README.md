# Elets PressFlow AI

**From editorial content to publication-ready pages.**

An interactive product demo of an AI-assisted magazine production platform for Elets Technomedia.
It walks the full workflow — upload content → classify → prepare → generate pages → review & fix →
export — using *Tech Maha Impact — May 2026* as the sample publication. Page geometry, type sizes and
furniture follow the supplied print file (205 × 278 mm trim, 5 mm bleed, Roboto 9/12 pt body, section
running heads with edge tabs, dark folio tabs).

All people, organisations and figures in the sample content are fictional. Sample photography is
locally generated SVG artwork — no external services or API keys are needed.

## Project status — 27 October 2026

**Live:** https://pressflow-seven.vercel.app (Vercel project `pressflow`, team abhi-elets), deployed
from branch `feature/pressflow-demo` at commit `a1870ca`. It currently runs in **browser demo mode**
because no database or credentials are configured yet; the team backend and the InDesign print
pipeline are deployed but switched off until their environment variables are set.

### What is built

| Milestone | Commit | State |
| --- | --- | --- |
| Product demo: content library, AI preparation, Layout Studio, QA with fixes, Export Center, templates, settings, guided demo | `5393855` | Done, live |
| Create Like This: analyse a reference magazine PDF in the browser and build a similar issue | `5393855` | Done, live |
| Automated print pipeline on the Adobe InDesign API: build manifest, ExtendScript build script, S3 staging, PDF/X + INDD + IDML + page previews, preflight report | `256071a`, `2c82b41` | Built; needs Adobe + S3 credentials |
| Team backend: Postgres, Google Workspace sign-in, roles, shared workspace with conflict protection, audit trail, article history | `e3b4c79` | Built; needs `DATABASE_URL` + sign-in settings |
| Print-quality protection: server-stamped approvals, pre-build gates, untouched image originals, licensed-font checks, archived outputs, editor release sign-off | `e3b4c79` | Built; gates work without Adobe, builds need Adobe |
| Server AI (Claude) with stored proposals and accept/reject log | `e3b4c79` | Built; uses built-in rules until `ANTHROPIC_API_KEY` is set |
| Fix: Layout Studio crashed when the selected publication had no pages; screen-level error page | `a1870ca` | Done, live |
| Reference-to-Magazine Studio: design spec with confidence and evidence, editable/confirmable design system, six format templates, new-topic issue planner, constrained generation, issue QA (blocker/warning/info), bulk corrections with undo, parent pages/layers/named styles in InDesign, pilot time report, vitest suite | — | Built and tested locally; not yet committed or deployed |

**Principle kept throughout:** the browser is for preparing, proofing and approving; only Adobe
InDesign produces print files, and nothing reaches it unless the quality gates pass.

### How it has been verified

- Type check, ESLint (`src/`) and production build pass.
- 52 automated API checks against a local server-mode instance (PGlite database, local storage,
  development sign-in): sign-in and domains, every role restriction, edit conflicts, approval stamps
  and re-review after edits, article history, original-image upload and measurement, font parsing,
  every print gate, team administration and suspension, AI proposal logging, audit trail. All pass.
- Browser tests of first-run setup, approval in Layout Studio, edit-after-approval, Settings (fonts,
  team) and the demo mode on the live site.
- The InDesign build script was run against a simulated InDesign (`scripts/indesign-mock.mjs`):
  22 pages, 26 output files, no script errors; and again for a studio-generated issue (20 pages,
  6 parent pages, 4 layers, 68 paragraph styles, 24 output files, no warnings).
- `npm test` (vitest, 41 tests): design spec, planning, generation and text preservation, issue QA,
  bulk corrections, pilot maths, manifest structure, upload validation, content import, server rules
  and print gates (PGlite), job release rules and the script bundle.
- Browser run of the studio in demo mode: a synthetic 16-page reference analysed, design system
  confirmed, 8 articles planned on 16 pages, issue generated, QA report, bulk-correction preview,
  pilot report with a baseline; a generated page opened in Layout Studio.

**Not verified yet:** a real job on Adobe's servers (typesetting, preflight presets, fonts and image
placement inside InDesign), archiving real outputs to S3, Google sign-in against a real OAuth
client, a hosted Postgres database, and Claude responses. These need the accounts listed below.

### To switch on the full product

| Needed | Used for | Where |
| --- | --- | --- |
| Hosted Postgres (Neon, Supabase…) → `DATABASE_URL` | Team workspace | Vercel env |
| Google OAuth client → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; `AUTH_SECRET`, `APP_URL`, `AUTH_ALLOWED_DOMAINS`, `ADMIN_EMAILS` | Sign-in | Vercel env + Google Cloud |
| S3 bucket + IAM user → `S3_*`, bucket CORS rule | Originals, fonts, job files, archived outputs | AWS + Vercel env |
| Adobe Developer Console project with InDesign API → `ADOBE_CLIENT_ID`, `ADOBE_CLIENT_SECRET`, `ADOBE_SCOPES` | Print builds | Adobe + Vercel env |
| Licensed OTF/TTF files for the house fonts | No font substitution in print | Settings → Licensed fonts |
| Optional: `ANTHROPIC_API_KEY`, `CRON_SECRET` | AI suggestions; daily archive of unwatched builds | Vercel env |

Then redeploy, sign in as an admin, choose **Set up with the sample issue**, upload fonts, set roles,
and run **Export Center → Check print readiness** followed by a first print build. Details are in
[Team backend](#team-backend-server-mode) and
[Print production](#print-production-with-the-adobe-indesign-api).

### Known limitations and open items

- First real InDesign run will likely need tuning (font names as InDesign reports them, preset
  settings, image fitting); bump `SCRIPT_VERSION` after changing `build.jsx`.
- Proofs in the browser use web fonts (Roboto, Bebas Neue…); the printed result depends on the
  licensed fonts uploaded for InDesign.
- Edits made while offline are kept in the open tab and sent on reconnect; closing the tab while
  offline loses them (the app warns before leaving).
- Conflicts resolve as "the first save wins": the later editor's change is replaced by the server
  copy and they are told; there is no merge of simultaneous edits.
- Vercel Hobby runs the archive cron once a day; builds are otherwise finalised when someone has the
  Export Center open.
- The demo data and Create Like This analyses in demo mode live only in the browser (localStorage).
- `scripts/indesign-mock.mjs` has four ESLint style errors (test tooling only).
- The code is not yet in a hosted Git repository; deploys are made from this machine with the
  Vercel CLI.

### Suggested next steps

1. Create the accounts above and run the first real print build on a few pages; compare the
   InDesign PDF with the browser proof.
2. Upload the licensed house fonts and map them in Settings → InDesign integration.
3. Push the repository to GitHub and connect it to Vercel for preview deployments per branch.
4. Pilot with one issue and the editorial team; tune templates and gates from real use.

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
npm test                     # vitest unit and integration tests
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
| "AI" — classification, summary, pull quotes, headlines | Claude on the server when configured (server mode); otherwise deterministic local heuristics (labelled in the UI) |
| "AI" — image opportunities, layout recommendation, trim proposals | Deterministic local heuristics |
| Reference-to-Magazine Studio: design spec with confidence, format templates, issue planning, generation, issue QA, bulk corrections, pilot timings | Real, in-browser; InDesign build, print gates and release need server mode |
| Team workspace, sign-in, roles, approvals, audit trail | Real when `DATABASE_URL` is set (server mode); browser-only demo otherwise |
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
    reference/         analyze.ts (pdf.js measurement), derive.ts (templates from a page), spec.ts (design
                       specification with confidence), formats.ts (six format templates), plan.ts (issue
                       planner + generation), content-import.ts (text/Markdown/PDF → articles)
    issue-qa.ts        Issue-level QA report (blocker / warning / info)
    bulk-fixes.ts      Bulk corrections with preview and undo
    pilot.ts           Pilot timings and time-saved report
    store.ts           Zustand store with localStorage persistence and undo/redo
    roles.ts           Team roles and permissions (shared by app and server)
    sync/              Server-mode sync engine, collections, original-image upload
    indesign/          InDesign build manifest (types + builder)
  services/            Browser clients for InDesign jobs and server AI
  server/
    db/                Drizzle schema and connection (Postgres / PGlite)
    auth/              Google Workspace sign-in, sessions, role checks
    workspace/         Sync with version checks and editorial rules
    print/             Print gates, font library, InDesign job records and release
    indesign/          InDesign API pipeline and the ExtendScript build script
    assets/            Original-image measurement and previews
    ai/                Claude editorial suggestions
    storage/           S3 or local file storage
  middleware.ts        Sign-in required for every page in server mode
drizzle/               SQL migrations
```

## Content conventions

Article bodies are plain text with a blank line between paragraphs. Interviews use `Q:` / `A:` prefixes;
`## ` starts a sub-heading.

## Reference-to-Magazine Studio

Route `/reference-studio`. Learn the design system of an existing magazine, plan a new issue on a
different topic, generate every page from reusable templates, check it and build it in InDesign.

1. **Reference** — upload a magazine PDF (measured in the browser; scanned, mixed-size, blank and
   unreadable files are reported).
2. **Analysis** — every property is a finding with value, confidence, source (extracted / inferred /
   default / confirmed) and the pages that support it; a layout per editorial format with its model page.
3. **Design system** — review, correct and confirm the findings; the spec is versioned and saved with
   the reference for future issues; the six format templates (interview, feature article, government
   perspective, event report, news page, company profile) are rebuilt from it.
4. **Issue plan** — select or import content for the new topic; the planner allocates pages from
   measured capacity (continuation pages, news pages, reserved ads, table of contents); conflicts
   block generation until resolved; an editor approves the plan.
5. **Build** — pages are generated (never cutting or shrinking text), checked by the issue QA report
   (content, layout, print, visual; blocker / warning / info), corrected in bulk with preview and
   undo, and built in InDesign (server mode) with parent pages, layers and named styles.
6. **Pilot** — measured timings per stage, corrections, failures, manual baseline and
   `time saved = ((manual − automated) / manual) × 100`. A pilot passes only with real InDesign
   output, no unresolved failures and an editor's release.

Architecture, limits and the test list: [docs/reference-to-magazine.md](docs/reference-to-magazine.md).
Run the tests with `npm test`.

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
