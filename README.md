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
```
