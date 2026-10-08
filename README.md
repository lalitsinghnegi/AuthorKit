# AuthorKit

A CSS package generator for content authoring teams. An admin sets up a project (brand, CSS prefix, breakpoints, folder scaffold, Figma links), and AuthorKit generates a downloadable zip containing responsive, BEM-named CSS and a developer style guide.

See [`CLAUDE.md`](./CLAUDE.md) for goals and conventions, and [`docs/BUILD_PROMPTS.md`](./docs/BUILD_PROMPTS.md) for the build plan.

## Requirements

- Node.js 20.9+ (developed on Node 24)

## Setup

```bash
npm install
cp .env.example .env   # then set ENCRYPTION_KEY (command is in the file)
npm run dev            # http://localhost:3000
```

## Scripts

| Command             | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Start the dev server                           |
| `npm run build`     | Production build                               |
| `npm start`         | Serve the production build                     |
| `npm test`          | Run tests once (`npm run test:watch` to watch) |
| `npm run lint`      | ESLint                                         |
| `npm run typecheck` | Generate route types and run `tsc --noEmit`    |
| `npm run format`    | Format with Prettier                           |

## Storage

There is no database. Project configuration is saved as JSON files under `DATA_DIR` (default `./data`, git-ignored). Generated CSS and zips are built on demand and never stored.

```
data/
  settings.json                  # encrypted Figma token (Prompt 7)
  projects/<id>/project.json     # brand, prefix, breakpoints, scaffold, Figma links
  projects/<id>/tokens.json      # design tokens
  scaffold-templates/<id>.json   # scaffold presets
```

Projects can be exported and imported as a single JSON file from the Projects screen.

## Connecting Figma

1. Set `ENCRYPTION_KEY` in `.env`, then restart the app. To generate a key:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
2. In Figma, create a personal access token: Settings → Security → Personal access tokens, with read access to files.
3. In AuthorKit, open **Settings**, paste the token and choose **Save & test**. Figma checks it first.

The token is encrypted on the server and is never shown again or sent to the browser.

If `ENCRYPTION_KEY` changes, the saved token can no longer be decrypted, so save it again.

Then add frame links per project under **Figma**, and match frames to components under **Components**.

Optional: set `ANTHROPIC_API_KEY` in `.env` to let Claude suggest components for frames whose names are ambiguous. Only frame names, paths and sizes are sent, and suggestions always need your confirmation.

## Generating a package

Open a project → **Generate** to preview every file, then **Download zip**. `GET /api/projects/<id>/package` returns the same zip. Generation is deterministic: an unchanged project always produces identical bytes.

## Testing in a real browser

`npm test` includes a headless-browser test that opens a generated package (sample page and style guide) from `file://`. It uses your installed Google Chrome, or the browser at `CHROME_PATH`, and is skipped with a warning when none is found.

## Health check

`GET /api/health` returns `{"status":"ok","storage":"ok"}` when the data folder is writable, and returns `503` otherwise.

## Layout

```
src/
  app/
    @actions/         # left-panel actions per screen (parallel route)
    api/health/       # health check
    projects/ templates/ settings/
  components/AppShell # two-pane shell: left action panel + right work area
  lib/model/          # zod schemas: Project, BreakpointSet, ScaffoldTemplate, FigmaLink, DesignToken, Settings
  lib/storage/        # repositories: atomic JSON file storage (zod-validated)
  lib/breakpoints/    # breakpoint validation and media queries
  lib/scaffold/       # scaffold tree operations, validation, presets
  lib/templates/      # CSS template rendering, manifests, cascade, lint config
  lib/generator/      # package generation (entry file, README, zip)
  templates/          # Handlebars CSS templates, partials, manifests, default tokens
```
