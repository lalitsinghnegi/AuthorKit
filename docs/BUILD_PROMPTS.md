# CSS Package Generator: Claude Code Build Prompts

Save this in your repo as `docs/BUILD_PROMPTS.md`. Run the prompts in order, one at a time. After each one: run the tests, run the app, commit to git, then continue. Use `/clear` between phases.

## Master runner prompt (use this instead of pasting everything)

```
Read docs/BUILD_PROMPTS.md. We will work through it one numbered prompt at a time, in order. Start with Prompt 0. For each prompt: (1) show a short plan and wait for my OK, (2) implement it, (3) run the tests and the app, (4) summarise what works and what doesn't, (5) STOP and wait for me to say "next". Never start the next prompt on your own.
```

To resume later: "Read docs/BUILD_PROMPTS.md and tell me which prompts appear to be done based on the repo, then propose the next one."

## Ground rules

- Never commit real Figma tokens or any secrets. Tests use saved fixture files, not live Figma calls.
- Generated CSS must be predictable: pre-written templates filled with values, not free-form AI output.
- Checkpoints marked below are good places to stop and review before continuing.

---

## Phase A: Foundation

### Prompt 0: Project context (run `/init` first)

```
I'm building a web app called "AuthorKit" (a CSS package generator for a Martech content authoring team). Write these goals into CLAUDE.md along with our conventions:

1. An admin web app lets an admin create a project, design a folder-structure scaffold from a UI (a tree editor), choose which CSS files the project needs, and define the supported screen-size breakpoints for that project.
2. For every page and for global styles, the admin supplies a Figma design link. The app reads the Figma file via the Figma REST API and generates CSS from it.
3. The output is a downloadable zip package: the scaffolded folders plus CSS files such as global.css (headings, paragraphs, sup, anchors), header.css, footer.css, isi.css (important safety information and safety bar), modals.css, cta.css (primary, secondary, tertiary buttons), and accordion.css. Developers download it and use it locally to start a new project.
4. Generated CSS must include media queries and responsive design based on the breakpoints the admin defines (for example mobile max-width 767px, tablet 768px to 1023px, desktop min-width 1024px).
5. The preview of the generated CSS is also a living style guide for developers. For every component it shows the rendered HTML with the correct selector classes applied, a table of selectors, modifiers and states, and copyable code, so a developer can apply the same classes to the actual AEM component they are building. The style guide is generated from the same component manifest as the CSS so the two never drift apart.

Project identity and class naming: every project has a required brand name and a required CSS prefix, both set by the admin. The prefix is used in the naming convention of every class generated for that project, using BEM (for example .{prefix}-btn and .{prefix}-btn--primary), and also for CSS custom properties (for example --{prefix}-color-primary). Templates are brand-neutral and use a {{prefix}} placeholder; the brand name appears in file header comments, the README, the style guide, and the zip file name. This avoids collisions when several brands or frameworks load on the same page.

Architecture: pre-written CSS templates that use CSS custom properties are filled with values extracted from Figma. Output must be deterministic and testable. An LLM is optional and only for suggesting which Figma frame maps to which component; it never writes the final CSS directly.

Stack: Next.js + TypeScript (admin UI and API routes), SQLite with Prisma for dev, Vitest for tests, Handlebars for templates, stylelint + PostCSS for validating output, archiver for zips. Secrets only in .env; the Figma token must be stored encrypted server-side and never sent to the browser.
Don't write code yet. Show me the CLAUDE.md for approval.
```

### Prompt 1: Scaffold

```
Plan first, then scaffold the Next.js + TypeScript project with Prisma (SQLite), Vitest, ESLint, Prettier, a README with run instructions, .gitignore, and .env.example. Add a health-check API route and a basic layout with navigation (Projects, Templates, Settings). Make sure the app starts and tests run.
```

### Prompt 2: Data model

```
Design the data model and show me the schema before implementing. Entities: Project (name, description, approach: mobile-first or desktop-first), BreakpointSet (named ranges with min and max widths), ScaffoldTemplate (a JSON folder tree: folders and files, each file linked to a CSS template id), CssTemplate (id, name, file name, handlebars source, list of variables it uses), FigmaLink (project, page or global label, url, file key, node id, breakpoint it represents, component it maps to), DesignToken (name, type, value, source node, status: auto, accepted, overridden), GenerationRun (project, timestamp, settings snapshot, output file hashes). Add migrations and tests for the models.
```

## Phase B: Breakpoints and scaffold designer

### Prompt 3: Breakpoint configuration and validation

```
Build the breakpoint module as pure TypeScript with unit tests. The admin defines named breakpoints, each with an optional min-width and max-width in px. Add validation that detects overlaps (for example tablet max 1024px and desktop min 1024px both matching 1024px), gaps between ranges, min greater than max, and duplicate names, with clear error messages and an "auto-fix" suggestion. Add a function that produces the correct media query strings for either mobile-first (min-width only) or desktop-first (max-width only) output, and one for range-based output. Then build the admin UI form to edit breakpoints with live validation and a preview of the resulting media queries.
```

### Prompt 4: Scaffold designer

```
Build the scaffold designer UI: a tree editor where the admin can add, rename, move (drag and drop), and delete folders and files, and assign a CSS template to each file. Include presets (for example "basic", "component-based") and the ability to save, duplicate, import, and export scaffold templates as JSON. Validate names (no illegal characters, no duplicates in a folder) and show a live preview of the final folder tree. Add tests for the tree operations.
```

## Phase C: Templates and first generator (first demo)

### Prompt 5: Pre-written CSS template library

```
Create the CSS template library as Handlebars files with CSS custom properties: tokens.css (colors, typography, spacing, radius, shadows, z-index), global.css (headings h1 to h6, paragraphs, sup and sub, anchors, lists, base reset, focus-visible), header.css, footer.css, isi.css (important safety information block and a sticky safety bar with expand and collapse), modals.css (overlay, dialog, close button, focus trap hooks), cta.css (primary, secondary, tertiary buttons with hover, focus, disabled states), and accordion.css. Each template must: use only CSS variables for values, include clearly marked responsive hooks per breakpoint, respect prefers-reduced-motion, have accessible focus styles and sufficient contrast defaults, and have a header comment listing the variables it uses. Use BEM class names with a configurable prefix (default "ak-"). For every template, also create a component manifest (YAML or JSON) that describes the component: name, description, every selector and modifier class with a one-line purpose, states (hover, focus, disabled, expanded, and so on), one or more HTML usage examples with the classes applied, accessibility notes (roles, aria attributes, keyboard behavior), an optional HTL (AEM) snippet example, and the CSS variables it uses. Store default token values, and add tests that render every template with defaults and pass stylelint, and that validate every manifest against a schema.
```

### Prompt 6: Generator engine v1 (no Figma yet)

```
Build the generator engine: given a project (scaffold template, breakpoints, default tokens), render each assigned CSS template into the scaffold's folder structure, inject the generated media queries for the project's breakpoints, and produce a zip with a README for developers explaining the folder structure, how to import the CSS, and the breakpoints used. Add a "Generate" button, a file-tree preview with a CSS viewer, and a download button. Add tests, including snapshot tests of the generated output.
```

**Checkpoint: you now have a working package generator with default styles. Review it before adding Figma.**

## Phase D: Figma integration

### Prompt 7: Figma connection

```
Add Figma integration. Settings page: the admin enters a Figma personal access token, which is encrypted at rest server-side (never returned to the browser, never logged) and tested with a connectivity check. Build a URL parser that extracts the file key and node id from a Figma design URL and rejects any other host. Build a FigmaClient that calls the Figma REST API (file, specific nodes, styles, variables, and image renders) with caching, rate-limit handling, retries, and clear errors for expired token, no access, and file not found. Create a mock client and saved JSON fixtures for tests; tests must never call the real API. Add the Figma links section to the project UI where the admin adds links for each page, global styles, and component, and tags the breakpoint each frame represents.
```

### Prompt 8: Design token extraction

```
Build the token extractor: from the Figma file's styles and variables (and node fills and text styles when styles are missing), produce normalized design tokens: colors, font families, font sizes, weights, line heights, letter spacing, spacing, radius, borders, and shadows. Map Figma auto-layout gaps and paddings to a spacing scale. Store tokens with their source node. Build a review screen listing tokens with previews, where the admin can accept, override, rename, or exclude each one. Flag low-confidence values (for example colors used only once). Use fixtures for tests.
```

### Prompt 9: Component mapping

```
Build component mapping. For each Figma link, detect candidate component frames (header, footer, cta, modal, accordion, isi) using naming conventions (configurable patterns) and show the suggestions with a screenshot preview rendered from the Figma image API. The admin confirms or changes the mapping per frame. Add an optional suggestion step behind an LLMProvider interface (with a mock provider for tests) that proposes a mapping when names are ambiguous; it must only suggest, and the admin must confirm. Store the confirmed mapping on the FigmaLink.
```

### Prompt 10: Per-breakpoint extraction and media queries

```
For each component and page, when frames are linked for multiple breakpoints, extract the style values of mapped elements at each breakpoint (font size, spacing, padding, layout direction, visibility, widths) and compute the differences. Generate CSS with the base styles for the first breakpoint (according to the project's mobile-first or desktop-first setting) and media queries containing only the properties that change. Where only one frame is linked, generate fluid values with clamp() between the project's smallest and largest breakpoints and mark it as "estimated" in the report. Show a coverage report listing which components have frames for which breakpoints. Add tests with fixtures.
```

### Prompt 11: Filling templates with Figma values

```
Connect extraction to the generator: values from the accepted tokens and the per-breakpoint differences fill the CSS templates' variables and responsive hooks. Anything missing falls back to template defaults and is listed in a "defaults used" report. Add a "needs attention" list for conflicts (for example two different values for the same token). Regenerate the preview and the zip, and add snapshot tests for a complete Figma fixture project.
```

## Phase E: Quality and workflow

### Prompt 12: Output quality gates

```
Add quality checks to every generation: stylelint rules, PostCSS formatting, removal of duplicate rules, validation that every CSS variable used is defined, detection of unused variables, a media query order check (so mobile-first and desktop-first cascades work correctly), and a size report per file, and a consistency check that every class in the generated CSS is documented in the component manifest and every class in the manifest exists in the CSS. Block download if there are errors and show warnings. Add tests that deliberately break the output and confirm the checks catch it.
```

### Prompt 13: Developer style guide, preview, diff, and versions

```
Build the preview as a developer style guide, generated from the component manifests and the project's generated CSS (not hand-written, so they cannot drift). Layout: a sidebar listing components (typography, links, buttons, header, footer, ISI and safety bar, modals, accordion), a search box, and a main area. For each component show: (1) a live rendered example using the generated CSS, (2) the HTML code with the selector classes applied and a "copy" button, (3) a table of every selector and modifier class with its purpose, states, and the CSS file it lives in, (4) variants and states side by side (default, hover, focus, disabled, expanded), (5) accessibility notes, (6) an optional HTL snippet tab for AEM developers, and (7) the CSS variables it uses. Add a "click an element to see its classes" mode that highlights an element in the rendered example and shows its selector. Add a design tokens page with swatches for colors, a type scale, spacing, and radius, showing variable names and values. Add a viewport switcher for each project breakpoint, and a "copy class name" button everywhere a class is shown. Then add generation history with a diff view comparing two runs, and the ability to download an earlier run. Store the settings snapshot and file hashes with each run. Add tests that every manifest example renders and that every documented class exists in the generated CSS.
```

### Prompt 14: Developer package polish

```
Improve the downloadable package: include the developer style guide as a standalone static site (style-guide/index.html) that works offline by opening the file, with no server or build step, so developers can keep it open while building AEM components; a README with the folder structure, import order, and breakpoint table; a docs file listing every CSS variable per file; an index.css that imports everything in the right order; and a sample index.html demonstrating the components. Add an option to generate the package as an npm-style package with package.json. Validate that the sample page renders without errors in a headless browser test.
```

## Phase F: Access and hardening

### Prompt 15: Admin access and audit

```
Add admin authentication with roles (admin, viewer), session security, and an audit log of who changed settings, tokens, breakpoints, mappings, and generations. Viewers can preview and download but not change anything.
```

### Prompt 16: Hardening

```
Review the whole project for security and quality: input validation on every form and API, protection against path traversal when building the zip, SSRF protection (only allow the Figma API host), secret handling and logging hygiene, rate limiting, error handling, concurrency limits on generation, accessibility of the admin UI, and test coverage. Produce a checklist of risks, fix the high-priority ones, and update the README and docs.
```

---

## Handy prompts between steps

- After each step: `Run the tests and the app, then summarise what works and what doesn't.`
- When stuck: `Reproduce this error, explain the root cause, then fix it with the smallest change.`
- Before merging: `Review the diff as a strict code reviewer and list issues by severity.`
