# AuthorKit

AuthorKit is a CSS package generator for a Martech content authoring team. An admin configures a project, AuthorKit reads the project's Figma designs, and it produces a downloadable zip of scaffolded folders, responsive CSS, and a developer style guide that developers use to start a new (typically AEM) project.

The build is driven step by step from `docs/BUILD_PROMPTS.md`. Work on one numbered prompt at a time. Never start the next prompt without explicit approval.

## Product goals

1. **Admin web app.** An admin creates a project, designs a folder-structure scaffold in a tree editor, chooses which CSS files the project needs, and defines the project's supported screen-size breakpoints.
2. **Figma-driven CSS.** For every page and for global styles, the admin supplies a Figma design link. The app reads the file via the Figma REST API and generates CSS from it.
3. **Downloadable zip package.** It contains the scaffolded folders plus CSS files such as:
   - `global.css`: headings, paragraphs, `sup`, anchors
   - `header.css`, `footer.css`
   - `isi.css`: Important Safety Information block and the safety bar
   - `modals.css`
   - `cta.css`: primary, secondary and tertiary buttons
   - `accordion.css`
4. **Responsive output.** Generated CSS includes media queries built from the admin-defined breakpoints (for example mobile `max-width: 767px`, tablet `768px`–`1023px`, desktop `min-width: 1024px`).
5. **Living style guide.** The preview of the generated CSS doubles as a developer style guide. For every component it shows the rendered HTML with the correct classes, a table of selectors, modifiers and states, and copyable code, so developers can apply the same classes to their AEM components. The style guide is generated from the **same component manifest** as the CSS, so the two never drift apart.

## Admin UI layout

Every admin screen uses a two-pane layout:

- **Left: action panel.** A fixed-width sidebar for navigation (Projects, Templates, Settings) and the actions relevant to the current screen, such as Add breakpoint, Add folder or file, Generate, Download, or the component list in the style guide.
- **Right: work area.** The main content where the actual work happens, such as the breakpoint form and media query preview, the scaffold tree editor, token review, the CSS viewer, or the style guide.

Rules:

- The left panel is persistent across screens and collapsible.
- On narrow viewports it becomes a toggleable drawer.
- Each screen supplies its own context actions to the panel rather than placing primary actions inside the work area.
- The layout is a single shared shell component.

## Project identity and class naming

- Every project has a **required brand name** and a **required CSS prefix**, both set by the admin.
- All generated classes use BEM with the prefix: `.{prefix}-btn`, `.{prefix}-btn--primary`, `.{prefix}-accordion__panel`.
- All CSS custom properties use the prefix: `--{prefix}-color-primary`.
- Templates are brand-neutral and use a `{{prefix}}` placeholder. The default prefix is `ak`.
- The brand name appears only in file header comments, the README, the style guide, and the zip file name, never in templates.
- The purpose is to avoid collisions when several brands or frameworks load on the same page.

## Architecture

- **Deterministic generation.** Pre-written Handlebars CSS templates use CSS custom properties, and values extracted from Figma (or defaults) fill them. The same inputs must always produce byte-identical output.
- **Component manifests** (one per template) describe selectors, modifiers, states, HTML/HTL examples, accessibility notes, and the variables used. CSS, style guide and consistency checks all derive from them.
- **LLM is optional and advisory only.** It may suggest which Figma frame maps to which component, behind an `LLMProvider` interface with a mock for tests. It never writes CSS, and the admin must confirm every suggestion.
- **Figma access** goes through a single `FigmaClient` (caching, retries, rate-limit handling, typed errors). Only the Figma API host is allowed (SSRF protection).
- Core logic (breakpoints, scaffold tree operations, token extraction, generator, quality checks) lives in **pure TypeScript modules** independent of Next.js, so it is unit-testable.

## CSS templates

- **Templates:** `src/templates/css/<id>.css.hbs`, Handlebars with `strict` and `noEscape`. Shared partials (`fileHeader`, `responsive`) live in `src/templates/partials/`.
- **Manifests:** `src/templates/manifests/<id>.json`, validated by `ComponentManifest`.
- **Default values:** `src/templates/defaults/tokens.json`, including large-screen (≥ 1024px) overrides for tokens and component layout variables.
- **Rendering:** `renderTemplate(id, buildTemplateContext(...))` in `src/lib/templates/render.ts`. It reads files with `fs`, so import it only on the server. `@/lib/templates` (the index) is safe anywhere.
- **Responsive values:** per-breakpoint values go through `cascade()`. Base styles use the base breakpoint's values (smallest for mobile-first, largest for desktop-first). Each media query only holds what changed since the previous step, and every non-base breakpoint gets an `@authorkit-responsive` marker comment.
- **Rules the tests enforce:**
  - output passes stylelint (`outputStylelintConfig(prefix)`)
  - design properties only use `var()` (`literalDesignValues`)
  - the header variables, the manifest `variables` and the actual `var()` use are identical
  - manifest classes and CSS classes are identical
  - every used variable is defined
  - reduced-motion handling exists wherever there is a transition
  - default colours meet contrast
- **When you change a template,** update its manifest `variables` and `selectors` to match. The tests say exactly what differs.
- **Prettier** ignores `*.hbs`, because it would reformat Handlebars as HTML.

## Generator

- `generatePackage(project)` (`src/lib/generator/generate.ts`, server-only) builds the whole package in memory. It contains:
  - `<brand-slug>.css` (the entry file)
  - `README.md`
  - every scaffold file, in tree order: templated CSS, header-only CSS for `.css` files without a template, and empty files for other types
  - every folder, including empty ones
- Any error from `checkProject` blocks generation. That covers scaffold errors, breakpoint errors, and root names reserved by `reservedRootNames(project)`.
- `zipStream(pkg)` streams the zip with everything under `<root>/`. It re-checks every path with `assertSafePath` and gives every entry a fixed date (`ZIP_DATE`), so identical input gives identical bytes.
- `GET /api/projects/[id]/package` returns the zip. It returns 409 with `problems` when generation is blocked.
- Snapshot tests in `src/lib/generator/__snapshots__/` capture every generated file for both approaches. After an intended template change, update them with `npx vitest run -u` and review the diff.

## Design tokens (extraction)

- **`extractTokens(inputs)`** (`src/lib/tokens/extract.ts`) is pure: Figma nodes, styles and variables go in, `ExtractedToken[]` comes out.
  - **Source priority:** variables beat styles, which beat values scanned from layers.
  - **Units:** colours as hex, or `rgb(… / a%)` when transparent. Font sizes and spacing in rem (16px base). Line height unitless. Letter spacing in em. Radius, borders and shadows in px.
- **Names:** tokens are named after template tokens where possible (`naming.ts`), so they fill the CSS. Anything else gets a slug name and is `mapped: false`.
  - **Spacing** snaps to the 8-step scale (4–64px), radius to sm/md/lg/pill, and shadows to sm/md/lg by blur.
  - **Conflicting values** for one name: the most trusted, then most used, wins. The others become `-alt` tokens.
- **Low confidence** = any reason in `meta.reasons`:
  - a value used once and not saved as a style
  - far (more than 25%) from its scale step
  - an unmapped name
  - one of several conflicting values
  - failing contrast
- **Re-extraction:** `mergeTokens(existing, extracted)` keeps the admin's decisions, matched by `meta.sourceKey`, as in its doc comment. Hand-made tokens (no `meta`) are never touched.
- **Saving:** `saveTokensAction` only changes `name`, `value` and `status`. It re-validates every value with `validateTokenValue`, which refuses `; { } < > \` and comments, because values go into CSS. A value different from Figma's is always saved as `overridden`.

## Component mapping and AI

- **Data:** frames inside each linked node are mapped to components and stored on the link as `FigmaLink.mappings` (`FrameMapping`).
- **Finding frames:** `candidateFrames` lists the linked node and frame-like children and grandchildren. `suggestFromPatterns` matches whole-word keywords from Settings, with `DEFAULT_PATTERNS` used for anything not overridden. A tie or no match is low confidence and counts as ambiguous.
- **Re-detection:** `mergeMappings` keeps confirmed and ignored frames, keeps AI suggestions over pattern misses, and marks frames that have disappeared as missing.
- **AI is optional and only suggests.**
  - It sits behind the `LLMProvider` interface. `AnthropicProvider` (`@anthropic-ai/sdk`) is used only when `ANTHROPIC_API_KEY` is set; `getLLMProvider()` returns null otherwise.
  - Request: model `claude-opus-5-5`, effort `low`, structured output via a JSON schema, and `fallbacks: "default"` with beta `server-side-fallback-2026-07-01`.
  - It sends frame names, paths, child names and sizes only. The system prompt treats names as data.
  - Output passes `validateSuggestions`: schema-checked, unknown node ids dropped, reasons trimmed. Results are saved as `suggested` with source `ai` and never confirmed automatically.
  - Errors become `LLMError` with fixed messages.
- **Tests** use `MockLLMProvider` (`src/test/llm.ts`), or inject `fetch` into `AnthropicProvider` (with `maxRetries: 0`).
- **Previews:** Figma image links expire, so they are never stored. They are filtered by `isAllowedImageUrl` (Figma's S3 bucket and `*.figma.com`, https only) on both server and client.

## Responsive values (per breakpoint)

- **What's measured:** `SPECS` (`src/lib/responsive/specs.ts`) read each component's responsive variables from one mapped frame.
  - Paddings, gaps, sizes, the first text size, and corner radius.
  - The header's drawer or inline layout, detected from a visible menu/hamburger child or a nav child.
  - `readTypography` reads `font-size-h1…h6` and `font-size-base` from frames mapped to `global`.
- **Frames used:** `collectFrameRefs(project)` takes every confirmed mapping (`global` → typography) plus a component link's own frame.
- **`computeEntry` rules:**
  - Only one frame per breakpoint is used; extras are reported as conflicts.
  - Untagged links are treated as the base breakpoint.
  - **Two or more breakpoints measured:** uncovered breakpoints copy the nearest measured one (a tie goes to the smaller), marked `inferred`.
  - **One breakpoint measured:** rem sizes become `clamp()` between `fluidRange` (smallest breakpoint start → largest breakpoint start, 320px if there's no min). A large-screen frame is the top of the range and the other end is `FLUID_RATIO` (0.75). px values and keywords stay fixed. Marked `fluid`.
- **Storage:** results are saved to `data/projects/<id>/responsive.json` (`ResponsiveFile`). `renderResponsiveCss` previews them with `cascade()`: base for the first breakpoint, then only the changes per media query.
- **Template variables that change by breakpoint** are declared through `{{vars "<component>" "<suffix>"}}` with defaults in `tokens.json` → `components`. A variant that must not be undone by breakpoint overrides sets the property directly (`padding-inline: 0` on tertiary buttons, `max-width` on interstitial modals) rather than overriding the shared variable.

## Figma values in the output

- **`resolveDesignValues`** (`src/lib/templates/sources.ts`) decides every template value per breakpoint and builds the `GenerationReport`. `buildTemplateContext` / `buildTemplateContextWithReport` use it, and without Figma inputs the output is byte-identical to the defaults.
- **Priority:**
  - **tokens:** responsive typography > accepted or overridden token (every breakpoint; drops the built-in large-screen override) > default (+ large-screen default)
  - **component variables:** responsive value > default (+ large-screen default)
  - **not used:** tokens with status `auto` or `excluded`
- **Extra tokens:** accepted tokens with non-template names are written to `tokens.css` after the template tokens as "Extra values from Figma".
- **Report contents:**
  - `rows` give the source of every template token and component variable; the defaults-used list comes from these
  - `extras` lists the extra tokens
  - `attention` holds warnings with the screen to fix them on: token vs responsive conflicts, multi-valued or missing tokens, invalid values, tokens waiting for review, contrast on the final colours, and responsive notes
- **Loading inputs:** `generatePackage(project, { tokens, responsive })`. The zip route and the Generate page load them with `loadGenerationInputs(projectId)`.
- **Colours from Figma use short hex** when possible (`#fff`), as the output lint rules require.
- **Test project:** `src/lib/generator/figma.test.ts` builds a full project through the real extraction code and snapshots every file and the report.

## Quality checks

- **`buildPackage(project, inputs)`** (`src/lib/generator/build.ts`) runs `generatePackage`, then `runQualityChecks` (`src/lib/quality/run.ts`). The zip route and the Generate page use it, never `generatePackage` alone.
- **Automatic fixes, applied first:**
  - `dedupeCss` removes exact duplicate rules (same scope) and duplicate declarations
  - `formatCss` (PostCSS) normalises layout only: 2-space indentation, `: `, one selector per line, a blank line between rules, kept single blank lines, and multi-line values re-indented
  - both are idempotent on template output, so the snapshots don't change
- **Errors (block the download; the route returns 409 with `quality`):**
  - any stylelint warning (`outputStylelintConfig`)
  - a `var()` with no definition in the package
  - media queries out of cascade order, or of the wrong kind for the approach
  - classes in a templated file not matching its manifest, in either direction
- **Warnings:**
  - a `var()` with a fallback but no definition
  - unused component variables (unused tokens are grouped into one note; extra values are skipped)
  - query widths that aren't project breakpoints
  - literal design values
  - files over 50 KB, or a package over 250 KB
- **Size report:** bytes, gzip size, rules and declarations per file.
- **Stylelint is a `serverExternalPackages` entry** in `next.config.ts`; bundling it breaks its config resolution.
- **Tests:** `src/lib/quality/quality.test.ts` breaks the output on purpose, one defect per test. Add a case there for every new check.

## Developer style guide

- **`generateStyleGuide(project, files, extras)`** (`src/lib/styleguide/generate.ts`, server-only) returns static files under `style-guide/`:
  - `index.html`, from `renderGuidePage` in `page.ts`
  - `styleguide.css` and `styleguide.js`, copied from `src/templates/styleguide/`; plain browser code, no build step, works from `file://`
  - `states.css`
- **Built from the package's checked files and the manifests,** never hand-written, so it can't drift from the package.
- **Live examples render in `srcdoc` iframes** (`loading="lazy"`) that link `../<entry>.css` and `states.css`. Global element styles therefore never touch the guide's own UI. Only `tokens.css`, which holds just `:root` variables, is linked by the guide page for token previews.
- **Examples are adjusted for the live view only;** the copyable code is unchanged:
  - `autofocus` becomes `data-sg-autofocus`, otherwise it steals focus and scrolls the guide on load
  - relative `<img src>` becomes a placeholder data URI, so missing files like `logo.svg` don't fail to load
- **Forced states:** `buildStatesCss` copies `:hover` / `:focus(-visible)` / `:active` rules as `[data-sg-state~=…]`. `styleguide.js` sets that attribute on the manifest state's `appliesTo` elements.
- **Escaping:** everything interpolated into the page goes through `esc()`; `srcdoc` documents are escaped as attribute values.
- **Serving in the app:** `GET /api/projects/[id]/styleguide/[...path]` serves the guide and the package from one virtual root (exact path match only), via `buildPackage`. The Style guide screen frames it.
- **Browser checks:** `playwright-core` (dev) drives the installed Chrome (`channel: "chrome"`). Prompt 14 adds the automated headless test.
- **Test project:** `src/test/figmaProject.ts` builds the full Figma test project used by several tests.

## Storage (keep it simple)

- **No database.** Project configuration is stored as JSON files on disk:
  - `data/projects/<project-id>/project.json` holds the brand, prefix, approach, breakpoints, scaffold tree, CSS file selection, Figma links, mappings and accepted tokens.
  - `data/scaffold-templates/*.json` holds the scaffold presets. Built-in presets (Basic, Component-based) live in code (`src/lib/scaffold/presets.ts`), can't be changed or deleted, and are merged into listings.
- **Generated output is never stored.** CSS, the style guide and the zip are rendered on demand in memory and streamed to the browser. There is no generation history, no stored zips and no run diffs.
- **Schemas** live in `src/lib/model/` (zod, one file per entity). Repositories in `src/lib/storage/` are the only code that reads or writes `data/`.
- **Atomic writes.** Write to a temp file, then rename. A single repository module (`src/lib/storage/`) owns all file access. Validate with zod on every read and write.
- **Import and export.** The admin can export and import `project.json`, which makes projects portable and easy to keep in git.
- **Not committed.** `data/` is git-ignored except for seeded presets.

## Stack

| Concern        | Choice                                               |
| -------------- | ---------------------------------------------------- |
| App + API      | Next.js (App Router) + TypeScript (strict)           |
| Persistence    | JSON files on disk (no database), validated with zod |
| Templates      | Handlebars                                           |
| CSS validation | stylelint + PostCSS                                  |
| Zip output     | archiver                                             |
| Tests          | Vitest                                               |
| Lint/format    | ESLint + Prettier                                    |

## Conventions

- **TypeScript strict mode**, with no `any` unless justified in a comment. Validate all external input (forms, API bodies, Figma responses) at the boundary.
- **Tests:** Vitest. Every pure module gets unit tests. Generator output gets snapshot tests. **Tests never call the real Figma API.** They use the mock client and saved JSON fixtures.
- **Templates** use only CSS variables for values, include marked responsive hooks per breakpoint, respect `prefers-reduced-motion`, ship accessible `:focus-visible` styles and sufficient-contrast defaults, and start with a header comment listing the variables they use.
- **Zip building** must guard against path traversal. File and folder names come from validated scaffold trees only.
- **Accessibility:** the admin UI and all generated component examples must be keyboard-usable with correct roles and ARIA attributes.
- **Commits:** small and focused, one per completed build prompt (or smaller).

## Secrets

- Secrets live only in `.env` (never committed). `.env.example` documents required keys with placeholder values.
- The Figma personal access token is **stored encrypted server-side** in `data/settings.json`, using AES-256-GCM with `ENCRYPTION_KEY` from `.env`. It is never sent to the browser, never logged, and never included in error messages.
- Never commit real Figma tokens, file keys tied to private designs, or other credentials. Fixtures must be sanitised.
- **Handling the token in code:**
  - Wrap it in `Secret` (`src/lib/secrets/secret.ts`), which prints `[redacted]` everywhere. Call `.reveal()` only to set the `X-Figma-Token` header.
  - `settings.json` stores the ciphertext, the Figma account (handle and email) and the save date. No part of the token is stored in plain text.

## Figma

- **URLs:** `parseFigmaUrl` (`src/lib/figma/url.ts`) only accepts `https://figma.com` or `https://www.figma.com` design, file, proto and board links. It converts `node-id=1-2` to `1:2` and uses the branch key for branch links. It is browser-safe; the server always re-parses.
- **API access:**
  - All calls go through `FigmaClient`. `HttpFigmaClient` only ever requests `https://api.figma.com` (fixed in code), validates file keys and node ids, and does not follow redirects.
  - It times out after 20 seconds and retries up to 3 times on 429 (honouring `Retry-After`, capped at 60 seconds) and 5xx.
  - It caches responses for 5 minutes per token hash. `/me` and image renders are never cached.
  - Failures raise `FigmaError` with a code and fixed, safe text.
- **Server access:** `getFigmaClient()` (`src/lib/figma/server.ts`) returns a client using the saved token, or throws `no_token`.
- **Tests never reach the network.**
  - `vitest.setup.ts` stubs `fetch` to throw.
  - Use `MockFigmaClient` (`src/test/figma/mockClient.ts`, backed by `src/test/fixtures/figma/*.json`), or inject `fetchImpl` into `HttpFigmaClient`.
  - Extend the fixtures, not the network, when later prompts need more Figma data.

## Workflow per build prompt

1. Show a short plan and wait for approval.
2. Implement.
3. Run tests and the app.
4. Summarise what works and what doesn't.
5. Stop and wait for "next".

## Deviations from docs/BUILD_PROMPTS.md

These decisions override the build prompts wherever they conflict:

- **Prompt 1:** no Prisma or SQLite. The health check reports that the `data/` folder can be written to instead of checking a database.
- **Prompt 2:** the "data model" is a set of zod schemas and TypeScript types for the JSON files, not database tables and migrations. `GenerationRun` is dropped.
- **Prompt 6, Prompt 11, Prompt 14:** the zip is built in memory and streamed to the browser. Nothing is written to disk.
- **Prompt 13:** generation history, the diff view between runs, and downloading earlier runs are dropped. The style guide, token page and viewport switcher stay.
- **global.css uses global element styles:** bare `h1`–`h6`, `p`, `a`, `sup`, `sub`, lists, a light `*` reset and `:focus-visible`. This was the admin's explicit choice, accepting that it can override other CSS on the page. Everything else is prefixed BEM classes; `.{prefix}-h1`…`-h6` are also provided for visual heading levels.
- **Brand entry stylesheet (replaces Prompt 14's `index.css`):** every package has `<brand-slug>.css` at its root folder, for example `acme-health/acme-health.css`.
  - It is generated automatically and contains only `@import url("…")` lines, relative to the root, for every other CSS file.
  - Import order is fixed: tokens → global → cta → accordion → header → footer → isi → modals. Files with no template follow, in tree order.
  - It is not part of the stored scaffold tree. The scaffold designer shows it as a locked "auto" row.
  - A user file with the same name at the root is a validation error.
- **Prompt 15:** the audit log (if kept) is an append-only `data/audit.log` (JSON lines).

## Commands

```bash
npm run dev          # dev server on http://localhost:3000
npm test             # Vitest, single run (npm run test:watch for watch mode)
npm run lint         # ESLint
npm run typecheck    # generate Next route types, then tsc --noEmit
npm run format       # Prettier
npm run build        # production build
```

## Next.js notes

- This is **Next.js 16** with `cacheComponents` enabled. APIs differ from older versions, so check `node_modules/next/dist/docs/` before using a Next API (see `AGENTS.md`).
- Route handlers that touch the filesystem call `await connection()` so they run at request time.
- Client components that call `usePathname` sit inside `<Suspense>`, which dynamic routes such as `/projects/[id]` require under cacheComponents.
- **Panel actions:** each screen adds its left-panel actions with a parallel route, `src/app/@actions/<route>/page.tsx`. Every route needs one, even an empty one. Otherwise, during client-side navigation, the slot keeps showing the previous screen's actions.
- **Interactive panel actions:** when panel buttons need a client editor's state (Save, Fix all), the editor renders them with `<PanelActions>` (`src/components/AppShell/PanelActions.tsx`, a React portal into the panel). The route's `@actions` page then supplies only the static parts, such as `<ProjectNav>`. Portaled actions are client-only and don't appear in the server HTML.
- **Project menu:** add new project sub-screens to the `items` list in `ProjectNav.tsx`, and give each one an `@actions/projects/[id]/<screen>/page.tsx`.
- `notFound()` inside a `<Suspense>` boundary renders the not-found UI but keeps HTTP 200, because streaming has already started. Next.js adds `noindex`. This is expected.
- Server actions live next to their route (e.g. `src/app/projects/actions.ts`). They validate with zod, return field errors for `useActionState`, and `redirect()` on success.
- Paths built from `DATA_DIR` use `/*turbopackIgnore: true*/` so the build doesn't bundle runtime data.
