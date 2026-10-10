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
- **Site access** (reading the project's public site) goes through a single `SiteReader`, limited to the site URL's host and public addresses. No other outbound requests exist.
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
  - **Units:** colours as hex, or `rgb(… / a%)` when transparent. All sizes in px (font sizes, spacing, radius, borders, shadows); never rem, in extraction, defaults or templates. Line height unitless. Letter spacing in em.
- **Names:** tokens are named after template tokens where possible (`naming.ts`), so they fill the CSS. Anything else gets a slug name and is `mapped: false`.
  - **Spacing** snaps to the 8-step scale (4–64px), radius to sm/md/lg/pill, and shadows to sm/md/lg by blur.
  - **Conflicting values** for one name: the most trusted, then most used, wins. The others become `-alt` tokens.
- **Only high-confidence tokens are kept.** `extractTokens` drops every low-confidence token (the template default is used instead) and adds a note with the count; `extractAllTokens` returns everything, rated, for tests.
- **Low confidence** = any reason in `meta.reasons`:
  - a value used once and not saved as a style
  - far (more than 25%) from its scale step
  - an unmapped name
  - one of several conflicting values
  - failing contrast
- **Re-extraction:** `mergeTokens(existing, extracted)` keeps the admin's decisions, matched by `meta.sourceKey`, as in its doc comment. Undecided low-confidence tokens from earlier extractions are dropped. Hand-made tokens (no `meta`) are never touched.
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
  - **One breakpoint measured:** sizes marked `scales` (type, spacing) become px `clamp()` between `fluidRange` (smallest breakpoint start → largest breakpoint start, 320px if there's no min). A large-screen frame is the top of the range and the other end is `FLUID_RATIO` (0.75). Radius and keywords stay fixed. Marked `fluid`.
- **Storage:** results are saved to `data/projects/<id>/responsive.json` (`ResponsiveFile`). `renderResponsiveCss` previews them with `cascade()`: base for the first breakpoint, then only the changes per media query.
- **Template variables that change by breakpoint** are declared through `{{vars "<component>" "<suffix>"}}` with defaults in `tokens.json` → `components`. A variant that must not be undone by breakpoint overrides sets the property directly (`padding-inline: 0` on tertiary buttons, `max-width` on interstitial modals) rather than overriding the shared variable.

## Figma values in the output

- **`resolveDesignValues`** (`src/lib/templates/sources.ts`) decides every template value per breakpoint and builds the `GenerationReport`. `buildTemplateContext` / `buildTemplateContextWithReport` use it, and without Figma inputs the output is byte-identical to the defaults.
- **Priority:**
  - **tokens:** responsive typography > accepted or overridden token (every breakpoint; drops the built-in large-screen override) > default (+ large-screen default)
  - **component variables:** responsive value > default (+ large-screen default)
  - **not used:** tokens with status `auto` or `excluded`
- **Only template tokens are written.** An accepted token whose name is not a template token is left out of the package and reported in `attention`; the Tokens screen marks it "not used".
- **Report contents:**
  - `rows` give the source of every template token and component variable; the defaults-used list comes from these
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
  - unused component variables (unused tokens are grouped into one note)
  - query widths that aren't project breakpoints
  - literal design values
  - files over 50 KB, or a package over 250 KB
- **Size report:** bytes, gzip size, rules and declarations per file.
- **Stylelint is a `serverExternalPackages` entry** in `next.config.ts`; bundling it breaks its config resolution.
- **Tests:** `src/lib/quality/quality.test.ts` breaks the output on purpose, one defect per test. Add a case there for every new check.

## Developer style guide

- **`generateStyleGuide(project, files)`** (`src/lib/styleguide/generate.ts`, server-only) returns static files under `style-guide/`:
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

## Developer package extras

- **Order inside `buildPackage`:** generate → quality fixes and checks → `addDeveloperExtras` (from the checked files) → zip.
- **Extras added (file source `devkit` or `styleguide`):**
  - `VARIABLES.md` (`renderVariablesDoc`): per CSS file, what it defines (base and per-breakpoint values) and what it uses
  - the sample `index.html` (`renderSamplePage`): built from manifest examples, links only the entry file, starts the modal closed, uses placeholder images, and wires every documented hook in plain JavaScript (`sampleScript`)
  - `package.json` (`renderPackageJson`), only when `project.npm.enabled`; always `"private": true`
  - `style-guide/`
- **Root names generated by AuthorKit** come from `generatedRootEntries(project)`: entry, `README.md`, `VARIABLES.md`, `index.html`, `package.json` when npm is on, and `style-guide/`. `reservedRootNames` derives from it, and the scaffold designer shows these as locked rows.
- **npm option checks:** `project.npm` holds `NpmName` (npm rules, optional `@scope/`, at most 214 characters) and `SemVer`. It is edited in the "Package options" card on the Generate screen.
- **Browser test:** `src/test/browser/package.browser.test.ts` writes the Figma test project to a temporary folder and drives Chrome (`playwright-core`, `CHROME_PATH` or the default install paths) over `file://`. It checks for no console, page or request errors; brand colours; type sizes per viewport; the header drawer and inline nav; the accordion, modal and ISI bar hooks; and style guide inspect and search. It is skipped when no Chrome is found.

## Access control and audit

- **Roles:** `admin` changes everything. `viewer` browses projects, previews packages, opens the style guide and downloads zips. Settings, Users and Audit log are admin-only (`<AdminPage>`).
- **Users:** stored in `data/users.json` (`src/lib/storage/users.ts`).
  - Passwords are scrypt hashes (`src/lib/auth/password.ts`, N=2^15, per-user salt, constant-time compare), at least 12 characters, and not the email.
  - There must always be one active admin, and admins can't demote, disable or delete themselves.
  - A role, status or password change bumps `sessionVersion`.
- **First admin:** with no users, the server prints a one-time setup code (`src/lib/auth/setup.ts`, also from `instrumentation.ts`), and `/setup` creates the first admin. Once a user exists, `/setup` is a 404. There is no public sign-up.
- **Sessions:** an `ak_session` cookie holding `{ userId, version, expiresAt }`, signed with HMAC-SHA256 and `SESSION_SECRET` (at least 32 bytes) (`src/lib/auth/token.ts`).
  - Flags: HttpOnly, SameSite=Lax, Secure in production; valid for 8 hours.
  - Login is throttled: 5 failures per email and IP lock it for 15 minutes (in memory).
  - Login errors are the same for unknown emails, wrong passwords and disabled users.
- **Enforcement, in layers:**
  1. `src/proxy.ts` checks the signature, expiry and that the user is still enabled with the same session version (`activeSession.ts`, which reads `users.json`). Pages redirect to `/login?next=…`; APIs return 401.
  2. **Every server action starts with `checkAdmin()`** (or `requireAdmin()` for redirecting actions, or `checkSignedIn()` for the two read-only ones), before reading input. Return `auth.denied` when `!auth.user`.
  3. Route handlers call `apiUser()`.
  4. `src/test/allServerActions.test.ts` imports every `"use server"` file and fails if any action works for a viewer or a signed-out caller, or changes `data/`. New actions are covered automatically. Truly public actions go in its allow-list.
- **Viewer UI:** wrap editors in `<EditGate>`, which shows a "View only" note, a disabled `<fieldset>` and `ReadOnlyProvider`, so `<PanelActions>` disables portaled buttons too. Hide admin-only panel actions with `<AdminOnly>`. `ScaffoldEditor` uses its own `readOnly`. Both read the session, so they render inside `<Suspense>`.
- **Session reads** call `connection()` (the expiry check reads the clock), so they never run in a prerender.
- **Audit log:** `data/audit.log`, one JSON line per event (`src/lib/audit/log.ts`), rotated to `audit-<time>.log` past 5 MB.
  - Every changing action records `{ ts, actor, action, target, details }` with a short summary. So do sign-in, sign-out, failed sign-in (email only) and package downloads.
  - Never log tokens, passwords or values that may hold secrets.
  - Shown newest first at Settings → Audit log, with filters and 50 entries per page.
- **Tests:** `src/test/session.ts` provides `withSignedIn(role)`, `signInAs`, `addTestUser` and the cookie and header `jar` behind the global `next/headers` mock in `vitest.setup.ts`. Action and route tests sign in first.

## Hardening

- **Checklist:** `docs/SECURITY.md` lists every risk and its state. Update it when you add an input, a route, an external call or a limit.
- **Package builds:** pages and routes call `buildForUser(project, userId)` (`src/lib/generator/limit.ts`), never `buildPackage` directly. It shares identical builds for 60 s, runs at most 2 at once and 2 per user, and throws `BusyError` (show `<BusyNote>` on pages, return 429 from routes).
- **External calls:** every action that calls Figma, the AI provider or the site spends a per-user budget first (`spend(FIGMA_BUDGET | AI_BUDGET | SITE_BUDGET, user.id)` from `src/lib/security/rateLimit.ts`), right after the auth check.
- **Login throttle** (`src/lib/auth/rateLimit.ts`): per email + IP (5) and per email from any IP (20), 15 minutes, capped at 10 000 entries.
- **Input limits:** every array and string in a schema has a `max`. Recursive input (scaffold trees) goes through `treeShapeProblem` before the recursive schema. Server-action bodies are limited to 3 MB in `next.config.ts`.
- **Headers:** `src/lib/security/headers.ts` (applied in `next.config.ts`). The style guide route sets `STYLE_GUIDE_CSP` itself. New inline scripts or third-party hosts need a CSP change.
- **Logging:** use `logError` / `logWarn` from `src/lib/log.ts`, never `console`, so secrets are redacted. `onRequestError` in `instrumentation.ts` logs unexpected errors with the digest that `error.tsx` shows.
- **Accessibility:** `npm run test:app` runs axe-core on every screen; a new screen must have no serious or critical violations.
- **In-memory state** (throttles, budgets, build cache) lives on `globalThis` and is cleared in `vitest.setup.ts` after each test.

## Site structure (reading the published site)

- **Purpose:** find which classes the published (AEM) site uses for each template part, confirm them, and generate CSS that targets the real markup.
- **Inputs:** `project.siteUrl` (overview) plus up to 20 `project.sitePages` paths on the same site (`SitePath`: starts with `/`, never `//`).
- **Reading:** `SiteReader` (`src/lib/site/fetch.ts`, server-only) through `getSiteReader()` (`src/lib/site/server.ts`, mocked in tests).
  - http(s) on ports 80/443, same host as the site URL, no credentials.
  - `safeLookup` refuses a name unless **every** address is public (`isPublicAddress`, `address.ts`), and the connection uses that address (no DNS rebinding).
  - Redirects followed by hand: at most 3, same host, re-checked. 15 s timeout, 5 MB cap before and after decompression, HTML only, 5-minute cache.
  - Failures are `SiteError` with fixed text; a failed page is reported, not fatal.
- **Analysis:** `analyzeSite(pages, partsFromManifests(getManifests()))` (`analyze.ts`) is pure and deterministic. Parts are each manifest's block, element and modifier classes. Class names are split BEM-style (noise such as `cmp-` and `js-` dropped) and scored with vocabularies per block, element and variant:
  - **high:** component and part both match, or the class is named only after the component (`.cmp-accordion__button`, `.cmp-isi-tray`)
  - **medium:** the part matches inside the component (ancestor class, or `<header>`/`<footer>`/dialog landmarks), a longer name mentions the component, or a variant names it
  - classes with a modifier are never suggested for blocks or elements (they're states); ties prefer `cmp-` classes, then use count, then name
- **Storage:** `data/projects/<id>/site.json` (`SiteFile`): pages, suggestions with short samples, the most used classes and notes. Never whole pages.
- **Limits:** `SITE_BUDGET` (10 reads per user per 10 minutes).
- **Mapping (`project.siteSelectors`):** `{ enabled, mappings }`; each `SelectorMapping` is `confirmed` (with one class, `SiteSelector`) or `ignored` (keep the template class), and only elements may be `scoped` (limited to their block's site class). Undecided parts aren't stored. `SelectorEditor` prefills from the latest suggestions and keeps only explicit edits in state.
- **Rules (`validateMappings`, `src/lib/selectors/map.ts`):** parts must exist in the manifests, each at most once; a site class can't be a template class; scoped elements need their block confirmed; two parts may share a site class only when their full selectors differ (both scoped to different blocks). `saveSiteSelectorsAction` refuses problems; `checkProject` reports them as errors (blocking generation) when the switch is on.
- **Generation:** `classMapFor(project)` (null when off or nothing is confirmed) is applied in one place each:
  - `generatePackage`: templated CSS through `mapCss` (PostCSS selector rewrite; a scoped element gets its block's site class as an ancestor unless the selector already has it), plus a "Site selectors" table in the README
  - `buildPackage`: `mapManifests` (site classes in selectors, examples, states, HTL; `scope` on scoped selectors) feeds the class check, the lint allow-list (`outputStylelintConfig(prefix, siteClasses)`), the sample page, its script (`sampleScript(prefix, classOf)`) and the style guide
  - custom properties always keep the prefix; `mapText` never touches them
  - with the switch off the output is byte-identical (tested)
- **Tests:** fixtures in `src/test/fixtures/site/` (AEM Core Components markup). Extend them, never the network. `src/test/siteSelectorsProject.ts` builds the Figma test project with every high-confidence suggestion confirmed; `siteSelectors.test.ts` and `siteSelectors.browser.test.ts` check the package passes every quality check and works in Chrome.

## Storage (keep it simple)

- **No database.** Project configuration is stored as JSON files on disk:
  - `data/projects/<project-id>/project.json` holds the brand, prefix, optional site URL (`SiteUrl`: http(s), no credentials) and extra site pages, approach, breakpoints, scaffold tree, CSS file selection, Figma links, mappings and accepted tokens.
  - `data/users.json` holds users (scrypt hashes, never passwords), and `data/audit.log` holds the audit trail.
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

- Secrets live only in `.env` (never committed): `ENCRYPTION_KEY`, `SESSION_SECRET` and the optional `ANTHROPIC_API_KEY`. `.env.example` documents required keys with placeholder values.
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
  - Failures raise `FigmaError` with a code and fixed, safe text. A 403 mentioning scopes is `missing_scope`; any other 403 on `/v1/me` is `invalid_token`. Figma's own reason is logged with `logWarn("figma_error")`, never shown.
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
- **Brand entry stylesheet (replaces Prompt 14's `index.css`; the root `index.html` is the sample page):** every package has `<brand-slug>.css` at its root folder, for example `acme-health/acme-health.css`.
  - It is generated automatically and contains only `@import url("…")` lines, relative to the root, for every other CSS file.
  - Import order is fixed: tokens → global → cta → accordion → header → footer → isi → modals. Files with no template follow, in tree order.
  - It is not part of the stored scaffold tree. The scaffold designer shows it as a locked "auto" row.
  - A user file with the same name at the root is a validation error.
- **Prompt 15:** the audit log is an append-only `data/audit.log` (JSON lines), and users live in `data/users.json`. There is no database, and no SSO for now.

## Commands

```bash
npm run dev          # dev server on http://localhost:3000
npm test             # Vitest, single run (npm run test:watch for watch mode)
npm run test:coverage  # Vitest with a coverage summary
npm run test:app     # production build, then browser tests of the running app (needs Chrome)
npm run lint         # ESLint
npm run typecheck    # generate Next route types, then tsc --noEmit
npm run format       # Prettier
npm run build        # production build
```

## Next.js notes

- This is **Next.js 16** with `cacheComponents` enabled. APIs differ from older versions, so check `node_modules/next/dist/docs/` before using a Next API (see `AGENTS.md`).
- Route handlers that touch the filesystem call `await connection()` so they run at request time.
- Client components that call `usePathname` sit inside `<Suspense>`, which dynamic routes such as `/projects/[id]` require under cacheComponents.
- **Route groups:** signed-in screens live in `src/app/(app)/` (two-pane shell and account box). `/login` and `/setup` live in `src/app/(auth)/` (a centered card, no shell).
- **Panel actions:** each screen adds its left-panel actions with a parallel route, `src/app/(app)/@actions/<route>/page.tsx`. Every route needs one, even an empty one. Otherwise, during client-side navigation, the slot keeps showing the previous screen's actions.
- **Interactive panel actions:** when panel buttons need a client editor's state (Save, Fix all), the editor renders them with `<PanelActions>` (`src/components/AppShell/PanelActions.tsx`, a React portal into the panel). The route's `@actions` page then supplies only the static parts, such as `<ProjectNav>`. Portaled actions are client-only and don't appear in the server HTML.
- **Project menu:** add new project sub-screens to the `items` list in `ProjectNav.tsx`, and give each one an `@actions/projects/[id]/<screen>/page.tsx`.
- `notFound()` inside a `<Suspense>` boundary renders the not-found UI but keeps HTTP 200, because streaming has already started. Next.js adds `noindex`. This is expected.
- Server actions live next to their route (e.g. `src/app/(app)/projects/actions.ts`) and start with the admin check (see Access control). They validate with zod, return field errors for `useActionState`, and `redirect()` on success.
- Paths built from `DATA_DIR` use `/*turbopackIgnore: true*/` so the build doesn't bundle runtime data.
