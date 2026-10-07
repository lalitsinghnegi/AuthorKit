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

## Storage (keep it simple)

- **No database.** Project configuration is stored as JSON files on disk:
  - `data/projects/<project-id>/project.json` holds the brand, prefix, approach, breakpoints, scaffold tree, CSS file selection, Figma links, mappings and accepted tokens.
  - `data/scaffold-templates/*.json` holds the scaffold presets.
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
