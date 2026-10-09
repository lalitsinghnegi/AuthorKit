# AuthorKit

A CSS package generator for content authoring teams. An admin sets up a project (brand, CSS prefix, breakpoints, folder scaffold, Figma links), and AuthorKit generates a downloadable zip containing responsive, BEM-named CSS and a developer style guide.

See [`CLAUDE.md`](./CLAUDE.md) for goals and conventions, [`docs/BUILD_PROMPTS.md`](./docs/BUILD_PROMPTS.md) for the build plan, and [`docs/SECURITY.md`](./docs/SECURITY.md) for the security checklist.

## Requirements

- Node.js 20.9+ (developed on Node 24)

## Setup

```bash
npm install
cp .env.example .env   # then set ENCRYPTION_KEY and SESSION_SECRET (commands are in the file)
npm run dev            # http://localhost:3000
```

### First sign-in

On first start, with no users yet, the server log shows a one-time **setup code**. Open `/setup`, enter the code, and create the first admin account. After that, admins add people under **Settings → Users**:

- **Admin:** changes everything (projects, Figma, tokens, presets, users).
- **Viewer:** browses projects, previews packages and the style guide, and downloads zips.

Everyone can change their own password on the **Account** page. **Settings → Audit log** shows who changed what. Changing `SESSION_SECRET` signs everyone out.

## Scripts

| Command                 | What it does                                            |
| ----------------------- | ------------------------------------------------------- |
| `npm run dev`           | Start the dev server                                    |
| `npm run build`         | Production build                                        |
| `npm start`             | Serve the production build                              |
| `npm test`              | Run tests once (`npm run test:watch` to watch)          |
| `npm run test:coverage` | Tests with a coverage summary                           |
| `npm run test:app`      | Production build, then browser tests of the running app |
| `npm run lint`          | ESLint                                                  |
| `npm run typecheck`     | Generate route types and run `tsc --noEmit`             |
| `npm run format`        | Format with Prettier                                    |

## Storage

There is no database. Project configuration is saved as JSON files under `DATA_DIR` (default `./data`, git-ignored). Generated CSS and zips are built on demand and never stored.

```
data/
  settings.json                  # encrypted Figma token, AI component patterns
  users.json                     # users and password hashes
  audit.log                      # who changed what (JSON lines)
  projects/<id>/project.json     # brand, prefix, breakpoints, scaffold, Figma links
  projects/<id>/tokens.json      # design tokens
  projects/<id>/responsive.json  # per-breakpoint values measured from Figma
  scaffold-templates/<id>.json   # scaffold presets
```

Projects can be exported and imported as a single JSON file from the Projects screen.

## Connecting Figma

1. Set `ENCRYPTION_KEY` in `.env`, then restart the app. To generate a key:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
2. In Figma, create a personal access token: Settings → Security → Personal access tokens. Give it these **read-only** scopes:
   - **Current user: Read** (used to check the token)
   - **File content: Read** (frames, layers, previews)
   - **Library content: Read** (styles)
   - **File variables: Read** is optional; it needs an Enterprise plan, and styles are used without it.

   A token without these scopes is refused with "missing a permission"; create a new one, since scopes can't be added later.

3. In AuthorKit, open **Settings**, paste the token and choose **Save & test**. Figma checks it first.

The token is encrypted on the server and is never shown again or sent to the browser.

If `ENCRYPTION_KEY` changes, the saved token can no longer be decrypted, so save it again.

Then add frame links per project under **Figma**, and match frames to components under **Components**.

Optional: set `ANTHROPIC_API_KEY` in `.env` to let Claude suggest components for frames whose names are ambiguous. Only frame names, paths and sizes are sent, and suggestions always need your confirmation.

## Generating a package

Open a project → **Generate** to preview every file, then **Download zip**. `GET /api/projects/<id>/package` returns the same zip. Generation is deterministic: an unchanged project always produces identical bytes.

## Testing in a real browser

`npm test` includes a headless-browser test that opens a generated package (sample page and style guide) from `file://`. It uses your installed Google Chrome, or the browser at `CHROME_PATH`, and is skipped with a warning when none is found.

`npm run test:app` builds the app, starts it against a temporary data folder and checks every screen in Chrome: security headers, no console or CSP errors, no serious accessibility violations (axe-core, WCAG 2.1 AA) and read-only screens for viewers.

## Security and operations

The full risk checklist is in [`docs/SECURITY.md`](./docs/SECURITY.md). In short:

- **Deploy behind an HTTPS reverse proxy** that overwrites `X-Forwarded-For`. HSTS and the `Secure` cookie flag are only sent in production.
- **Limits** (in memory, per server process, so run a single instance):
  - sign-in: 5 failures per email and IP, or 20 per email from any IP, lock for 15 minutes
  - Figma calls: 30 per user per minute; AI suggestions: 10 per user per 10 minutes
  - package builds: 2 at a time and 2 per user; identical builds are shared for 60 seconds; others wait up to 10 seconds, then get "busy" (HTTP 429 from the API)
  - uploads: project import 2 MB, preset import 1 MB; scaffolds up to 32 levels and 2000 entries
- **Headers:** a Content Security Policy on every page (scripts from this origin only), no framing, `nosniff`, a strict referrer policy. The generated style guide has a stricter policy of its own.
- **Logs:** server errors are written as JSON lines to stderr with secrets redacted. Error screens show a **reference**; search the log for that `digest` to find the details.
- **Backups:** `data/` holds users, the encrypted Figma token, projects and the audit log. Back it up and keep it readable only by the app's user.

## Health check

`GET /api/health` returns `{"status":"ok","storage":"ok"}` when the data folder is writable, and returns `503` otherwise.

## Layout

```
src/
  app/
    (app)/            # signed-in screens: projects, templates, settings, account
    (app)/@actions/   # left-panel actions per screen (parallel route)
    (auth)/           # /login and /setup
    api/              # health, package zip, style guide, project and preset export
  components/AppShell # two-pane shell: left action panel + right work area
  proxy.ts            # session check for every page and API
  lib/model/          # zod schemas and input limits
  lib/storage/        # repositories: atomic JSON file storage (zod-validated)
  lib/auth/ lib/audit # passwords, sessions, login throttle, audit log
  lib/security/       # HTTP headers, per-user request budgets
  lib/breakpoints/    # breakpoint validation and media queries
  lib/scaffold/       # scaffold tree operations, validation, presets
  lib/figma/          # URL parser, API client (Figma host only)
  lib/tokens/ lib/mapping/ lib/responsive/  # extraction from Figma
  lib/llm/            # optional AI suggestions (Anthropic)
  lib/templates/      # CSS template rendering, manifests, cascade, lint config
  lib/generator/      # package generation, build limits, zip
  lib/quality/        # quality checks and automatic fixes
  lib/styleguide/     # developer style guide
  lib/devkit/         # VARIABLES.md, sample page, package.json
  lib/secrets/        # token encryption and the Secret wrapper
  lib/log.ts          # redacted server logging
  templates/          # Handlebars CSS templates, partials, manifests, default tokens, style guide assets
  test/               # mocks, fixtures, browser tests
```
