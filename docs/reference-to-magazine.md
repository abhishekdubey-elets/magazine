# Reference-to-Magazine Studio — architecture, configuration, limits

Route: `/reference-studio` (navigation: *Design Studio*, under "1 · Reusable templates"). Six stages on one screen.


## AI recognition pass (stage 1–2)

`src/lib/reference/recognize.ts` (shared, pure) builds the request — per page a 420 px JPEG render
made during measurement (not stored), the measured text blocks (index, text start, size, bold, lines,
position in % of the trim) and the rules' guess — in batches of 8 pages, and merges the answers:

- page type adopted when confidence ≥ `AI_ADOPT_CONFIDENCE` (0.6) and the page was not corrected by
  an editor; the rules' type stays in `detectedType`; `page.ai` records type, confidence, section,
  reasons, `disagrees`, `adopted`;
- block roles land on `RefTextBlock.role`; `derive.ts` prefers them when choosing headline, kicker,
  deck, name/designation, caption, standfirst, pull quote and byline blocks (size sanity checks remain);
- section names fill `runningHead` only where none was measured; sections are rebuilt;
- `profile.ai` summarises provider, model, pages, disagreements and token usage.

`src/server/ai/reference.ts` calls OpenAI chat completions with image inputs (`detail: "low"`) and a
strict JSON schema, falling back to Claude with image blocks; `POST /api/ai/reference` validates
sizes (≤ 12 pages, JPEG data URLs ≤ 400 KB), requires `use-ai` in server mode and is throttled per
connection in demo mode (`AI_REFERENCE_DEMO=0` switches it off). Measurements are never sent to or
returned from the model as values to adopt. Tests: `tests/ai-reference.test.ts`.
To exercise the pass without a key: `node scripts/openai-mock.mjs 3999`, then run the app with
`OPENAI_API_KEY=test OPENAI_BASE_URL=http://localhost:3999/v1`; the mock answers from the measured
blocks (and flips one page to show the disagreement path).

## What it does

1. **Reference** — upload an existing magazine PDF. Measured in the browser with pdf.js (page boxes, every positioned text run with font and size, image placements from the content stream, colours from rendered pages, running heads). Mixed page sizes, blank pages, missing TrimBox and scanned files are detected and reported; encrypted or unreadable files produce an actionable error. No OCR is available.
2. **Analysis** — the design specification (`src/lib/reference/spec.ts`): every property is a *finding* with value, confidence (0–1), source (extracted / inferred / default / confirmed) and the reference pages supporting it. Covers geometry (trim, bleed, margins, columns, gutter, running heads and folios), typography (headline, deck, body, sub-heading, caption, pull quote, fonts in use), visual identity (palette, accent, logo placement, image aspect ratios, full-bleed share, density), editorial structure (sections, page types, running order) and a layout per editorial format with its model page. Page types can be corrected in the page map; the spec is rebuilt, keeping confirmed values.
3. **Design system** — editors review and correct findings (each change is recorded as *confirmed*, with the detected value kept), set print production settings, and confirm the spec. It is saved with the reference profile and versioned, so the next issue reuses it without re-analysing. The six format templates are rebuilt from the spec and can be saved to the Templates library.
4. **Issue plan** — pick Content Library articles for a new topic (or import `.txt` / `.md` / text-PDF documents, or write new ones). The planner (`src/lib/reference/plan.ts`) allocates pages from *measured* template capacity: continuation pages for long stories, news pages from short reports (a report too long for a lead gets its own page), reserved advertisements, required images, table of contents. Conflicts (not enough pages, text that cannot fit) are shown and block generation. An editor approves the plan; changing it resets the approval.
5. **Build** — generation (`generateIssue`) creates the publication, pages and templates; it refuses to import when a story still overflows. The stage shows page previews, the issue QA report, bulk corrections and the InDesign build controls.
6. **Pilot** — real timings per stage, corrections and failures, manual baseline, time saved.

## The six editorial formats

| Format | Content types | Geometry | House template |
| --- | --- | --- | --- |
| Interview | interview | measured from a reference interview page when possible | `tpl-interview-classic` |
| Feature article | feature, case-study, editorial | measured from an article / opener page | `tpl-feature-hero` |
| Government perspective | government-perspective, leadership-message | measured from a message page | `tpl-government-perspective` |
| Event report | event-report, news-report | measured from an article page | `tpl-event-report` |
| News page | news-report | always house layout (several stories) | `tpl-news-page` |
| Company profile | company-profile, case-study | always house layout (structured panels) | `tpl-company-profile` |

Templates are parameterised (frame geometry, bindings, style references), styled from the spec (`restyle` in `src/lib/reference/formats.ts`) and labelled *measured*, *adapted* or *inferred* in the UI.

**News pages** use `Page.storyIds` and `story.N.*` bindings (`src/lib/layout-engine.ts`): each brief is its own article fitted into its own frame; the lead story keeps the normal `articleId` bindings. The renderer, QA and InDesign manifest understand these bindings.

## InDesign output

`src/lib/indesign/build-manifest.ts` → `src/server/indesign/script/build.jsx` (version 1.1.0):

- **Parent pages** per section and furniture kind (`manifest.parents`), carrying the section tab, running head, folio with InDesign's automatic page number, issue label and tagline. Pages reference their parent; covers and advertisements have none.
- **Layers** Background / Images / Text / Furniture; every object has a name (shown in the Layers panel) and a label (PressFlow id) for tracing.
- **Named paragraph styles**: PF/Cover Title, Headline, Deck, Standfirst, Body, Body First, Body Question, Subheading, Caption, Pull Quote, Byline, Name, Designation, Kicker, Running Head, Page Number, … (variants get a numeric suffix).
- Threaded stories across continuation pages; news briefs as unthreaded frames with `reportOverset`.
- The build report now records parents, layers and style counts.

The server lifecycle is unchanged (`src/server/print/*`): gates → job → archive → release. A new gate, **Issue plan approved**, blocks print builds of a planned issue whose plan was not approved by an editor or still has unresolved conflicts.

## Quality assurance

`src/lib/issue-qa.ts` runs the per-page browser preflight plus issue-level checks and classifies findings **blocker / warning / info**:

- Content: every planned article present, every paragraph placed or reported overset (text accounting), no duplicate stories, reserved placements intact, pull quotes verbatim.
- Layout: overset (blocker), overlaps, blank pages, continuation chains, trim mismatch, readability (body < 8 pt, display lines shrunk > 30 %).
- Print: page size vs spec, bleed, PDF/X preset, effective resolution at placed size, missing originals, server gates (when run), InDesign's report (page count, overset, fonts, images, preflight) when a build exists.
- Visual (deterministic — no vision model): sparse/crowded pages, unbalanced columns, weak headline hierarchy, inconsistent image fitting.

Blockers stop release. What is checked elsewhere (server gates, InDesign preflight) is listed under *Checked elsewhere*.

## Bulk corrections

`src/lib/bulk-fixes.ts`: reapply paragraph styles, reapply grid & margins, fill image frames, reflow overset stories onto continuation pages, regenerate pages (clear overrides), replace templates. Each shows scope and per-page effect before applying; results are undoable from the studio; approved pages that change go back to review. Article text, photographs and fonts are never changed.

## Pilot

`src/lib/pilot.ts`: timings from the real steps (analysis duration, design review and planning, generation, InDesign build from the job report, QA review, corrections), manual baseline entered by the team, `time saved (%) = ((manual − automated) / manual) × 100`. The pilot passes only with a real InDesign output, no unresolved failures, an editor's release and a recorded baseline — browser previews never pass.

## Configuration

No new environment variables. Server mode (`DATABASE_URL`, sign-in, S3, Adobe) is required for InDesign builds, print gates, release and archived outputs; the studio runs the analysis, design system, planning, generation and browser QA in demo mode too and says so.

## Known limitations

- Measurement comes from the PDF: original master pages, paragraph-style names, linked-asset relationships and bleed (without a BleedBox) are not recoverable and are marked as estimates to confirm.
- Scanned or outlined PDFs yield page size, images and colours only; no OCR.
- Mixed page sizes (gatefolds) are detected but not reproduced.
- Word (.docx) import is not bundled; use text, Markdown or a text PDF, or paste into the editor.
- Visual inspection is rule-based; awkward line breaks and widows are judged on InDesign's page previews.
- The browser text engine estimates fitting with web fonts; InDesign's composition decides, and its report is what the release checks.
- Not yet exercised against Adobe's servers (no credentials in this environment): the ExtendScript ran against the simulated InDesign in `scripts/indesign-mock.mjs` only.

## Tests

`npm test` (vitest): design spec and confidence handling, saving/reusing a profile, format templates, planning and overrides, generation and text preservation, issue QA (content accounting, duplicates, reserved placements, page size, InDesign report), bulk corrections and undo, pilot maths, manifest structure (parents, layers, styles, briefs), upload validation and content import, server rules (roles, approval stamps and invalidation, fingerprints, workspace isolation, print gates incl. the plan gate), job release rules and the script bundle. `DUMP_MANIFEST_DIR=<dir> npm test -- tests/tools` writes a manifest for the InDesign mock.
