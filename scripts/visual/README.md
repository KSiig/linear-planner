# Visual harness

Headless-browser screenshot harness for `linear-planner`. Lives outside `src/`
so production code is never polluted with test scaffolding.

## What lives here

| File | Owner | Role |
|------|-------|------|
| `run.mjs`         | SII-124 (scaffold) / SII-125 (extension) | Runner. Builds, boots `vite preview`, captures PNGs. |
| `viewports.mjs`   | SII-124 (web) / SII-125 (3 mobile) | Viewport contracts. |
| `fixture.mjs`     | SII-125 | Mock GraphQL fixtures (Acme Launch example). |
| `diff.mjs`        | SII-126 | Pixel-diff against `screenshots/visual/baseline/`. |

## Run

```
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci
npm run visual
```

`npm run visual` resolves to `node scripts/visual/run.mjs`. It runs
`npm run build` once, starts `vite preview` on `127.0.0.1` (free port),
captures screenshots, then stops the preview server.

## Commands

| Command | What it does |
| -- | -- |
| `npm run visual` | Build the app, boot `vite preview`, and capture every PNG in the matrix. The capture root is `screenshots/visual/current/<view>/<viewport>/<theme>/<state>.png`. |
| `npm run visual:diff` | Refresh the capture, then diff each PNG against `screenshots/visual/baseline/`. Writes red-tinted diff PNGs under `screenshots/visual/diff/` for failing pairs and prints a markdown summary table. Exits 0 when every pair passes. |
| `npm run visual:update-baseline` | Refresh the capture and copy the result over `screenshots/visual/baseline/`. Review the diff before committing. |

## Chrome

The script launches the system Google Chrome binary. It does not download
a Playwright browser.

- `VISUAL_CHROME_PATH` — when set, used as `executablePath`.
- Otherwise, the default is `/usr/bin/google-chrome` (Google Chrome 151
  is installed there on the workbox).

The runner is installed with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`; do
not run `npx playwright install`.

## Viewports

| Name | Width | Height | DPR | Mobile |
|------|-------|--------|-----|--------|
| web           | 1440 | 900  | 1     | false |
| ipad          | 820  | 1180 | 2     | true  |
| iphone-13-pro | 390  | 844  | 3     | true  |
| galaxy-a52s   | 412  | 915  | 2.625 | true  |

## Surfaces × themes

Five surfaces (landing / timeline / tree / tree-global / settings) across
two themes (dark / light), at every viewport. SII-125 produces 4 × 5 × 2 =
40 PNGs:

```
screenshots/visual/current/<view>/<viewport>/<theme>/<state>.png
```

## Mock data

`fixture.mjs` exports the Acme Launch example project (12 issues, 2
milestones, 4 workflow states, 2 assignees, 3 blocks relations). The
GraphQL route handler in `run.mjs` dispatches on substrings of the
request's `body.query` to return the matching fixture.

`addInitScript` writes a fake auth token into `localStorage` before any
page script runs:

```js
localStorage.setItem('linear-planner-auth', JSON.stringify({
  accessToken: 'mock',
  refreshToken: 'mock',
  expiresAt: 1893456000000, // 2030-01-01T00:00:00.000Z
}));
```

`getAccessToken()` refreshes when `expiresAt` is less than five minutes
ahead of `Date.now()`. The harness clock is `2026-10-05T07:00:00.000Z`,
so `1893456000000` stays outside that window. `1790000000000` is
`2026-09-21T14:13:20.000Z`. At the harness clock that token is already
expired. The refresh reads `VITE_LINEAR_CLIENT_ID` before it sends a
request. The visual build does not set that variable, the read throws,
and the app clears `linear-planner-auth`. The page then shows
"Connect to Linear" and never calls GraphQL. If the OAuth refresh URL
is called, the harness fails the run (it does not pre-empt the request —
it detects and fails).

## Environment variables

| Variable | Default | Notes |
| -- | -- | -- |
| `VISUAL_CHROME_PATH` | `/usr/bin/google-chrome` on the workbox | Path to the Chrome binary. The CI runner uses the `google-chrome` on `PATH`. |
| `VISUAL_THRESHOLD_PCT` | `0.5` | Percent of pixels that may differ before a row is marked FAIL. `0` fails on any pixel difference. Only consumed by `visual:diff`; do not pass it through to `pixelmatch` — the `threshold` option stays at its default. |
| `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` | unset | Set to `1` during install so Playwright does not download a browser. The harness uses system Chrome. |

## How the diff works

`scripts/visual/diff.mjs`:

1. Runs `npm run visual`.
2. Walks `screenshots/visual/current/` for every `*.png` and matches it against `screenshots/visual/baseline/` at the same relative path.
3. Decodes each pair with `pngjs` and compares with `pixelmatch`. Mismatched pixels are drawn red into `screenshots/visual/diff/`.
4. A missing baseline, a different width/height, or an unreadable file counts as a fail and still prints a row.
5. Prints a per-file table: view, viewport, theme, state, pass/fail, mismatched pixel count, percent. Exits 0 when every row passes.

The diff compares two runs on one machine. It does not claim that the workbox
matches GitHub-hosted Chrome.

## Adding a viewport, view, or fixture field

- **Add a viewport** — append an entry to `viewports.mjs`'s `VIEWPORTS`
  array. Numbers are part of the contract.
- **Add a view** — append a `{ view, state, needsAuth }` entry to
  `run.mjs`'s `SURFACES` array, and a `captureSurface` branch that does
  whatever the new surface needs (open URL, click tab, wait for text).
- **Add a fixture field** — extend the relevant object in `fixture.mjs`.
  The route handler passes the data through verbatim, so any field the
  app's GraphQL query selects must exist in the response.

## CI — `visual` job (SII-127)

The `visual` job runs beside `test` (no `needs:`). It runs on every pull
request and on every push to `main`. The job uses the existing workflow
permissions (`contents: read`) and Node 22.

It does not gate the `deploy` job — `deploy` still `needs: test` only.

### Steps

1. `actions/checkout@v4`
2. `actions/setup-node@v4` with `node-version: "22"` and `cache: npm`
3. `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci` — Playwright must not
   download a browser; the runner ships Google Chrome
4. Locate Google Chrome and export it as `VISUAL_CHROME_PATH`. If
   `/usr/bin/google-chrome` exists, that path wins. Otherwise the
   `google-chrome` binary on `PATH` is used. The path is set via the
   `find-chrome` step output, not pinned to a version.
5. `npm run visual:diff` — this command builds the app, runs the
   capture, compares against the committed `screenshots/visual/baseline/`
   tree, prints one markdown table row per screenshot, and exits
   non-zero when any row fails the pixel gate.
6. Append the per-screenshot table to `$GITHUB_STEP_SUMMARY`.
7. Upload the `visual-screenshots` artifact
   (`screenshots/visual/current/` and `screenshots/visual/diff/`) with
   `actions/upload-artifact@v4`, retention 14 days, `if: always()`.

The PNGs themselves are not embedded in the summary — only the table is.
The PNGs live in the artifact.

### Mismatch policy

A pixel mismatch against the baseline is **not** a build failure. The
job stays green. The fail row appears in the step summary table and in
the `visual-screenshots` artifact, and a developer reads the diff to
decide whether to update the baseline or fix the regression.

A harness error is a build failure. Harness errors are:

- The app build fails (TypeScript, Vite).
- `vite preview` does not start.
- Chrome fails to launch or crashes.
- A page error, a console error, or an uncaught script error.
- An unexpected request to `https://api.linear.app/graphql`.
- `npm run visual:diff` does not print the per-screenshot table at all.

The job detects the last case by grepping the command output for a
line that contains the four column names `view`, `viewport`, `state`,
and `pass`. If that line is missing, the job fails with a clear
harness-error annotation. If it is present — even when individual rows
are `fail` — the job exits 0 and the table goes into the step summary.

### Baseline updates

`npm run visual:update-baseline` (owned by SII-126) overwrites
`screenshots/visual/baseline/`. A person reviews the diff in the
`visual-screenshots` artifact before committing the new baseline. The
`visual` job never updates the baseline.

## Out of scope

- Real Linear data. The harness is mock-only.
- App-side `data-testid` attributes. Only added if a render-wait step proves
  flaky.