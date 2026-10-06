# Visual harness

Headless-browser screenshot harness for `linear-planner`. Lives outside `src/`
so production code is never polluted with test scaffolding.

## What lives here

| File | Owner | Role |
|------|-------|------|
| `run.mjs`         | SII-124 | One-shot runner. Builds the app, boots `vite preview`, captures PNGs. |
| `viewports.mjs`   | SII-124 | Viewport contracts. SII-125 extends this file. |
| `fixture.mjs`     | SII-125 | Mock GraphQL fixtures (added in a later issue). |

## Run

```
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci
npm run visual
```

`npm run visual` resolves to `node scripts/visual/run.mjs`. It runs
`npm run build` once, starts `vite preview` on `127.0.0.1` (free port),
captures screenshots, then stops the preview server.

## Chrome

The script launches the system Google Chrome binary. It does not download
a Playwright browser.

- `VISUAL_CHROME_PATH` — when set, used as `executablePath`.
- Otherwise, the default is `/usr/bin/google-chrome` (Google Chrome 151
  is installed there on the workbox).

The runner is installed with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`; do
not run `npx playwright install`.

## Output

SII-124 captures only the landing-page sign-in screen:

```
screenshots/visual/current/landing/web/dark/sign-in.png
```

PNG must be > 5 KB and < 500 KB. The script exits non-zero on any
failure (preview did not boot, page error, console error, unexpected
`https://api.linear.app/graphql` request, or PNG outside the size range
is not enforced but a missing file is).

## CI

The `visual` job added in SII-127 runs `npm run visual:diff` on
`ubuntu-latest` and uploads `screenshots/visual/current/` and
`screenshots/visual/diff/` as the `visual-screenshots` artifact.
