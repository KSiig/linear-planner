# Visual harness

Headless-browser screenshot harness for `linear-planner`. Lives outside `src/`
so production code is never polluted with test scaffolding.

## What lives here

| File | Owner | Role |
|------|-------|------|
| `run.mjs`         | SII-124 (scaffold) / SII-125 (extension) | Runner. Builds, boots `vite preview`, captures PNGs. |
| `viewports.mjs`   | SII-124 (web) / SII-125 (3 mobile) | Viewport contracts. |
| `fixture.mjs`     | SII-125 | Mock GraphQL fixtures (Acme Launch example). |

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
  expiresAt: 1790000000000,
}));
```

`expiresAt` is far enough in the future that `getAccessToken()` never
triggers a refresh. If the OAuth refresh URL is ever called, the harness
fails the run (it does not pre-empt the request — it detects and fails).

## Adding a viewport, view, or fixture field

- **Add a viewport** — append an entry to `viewports.mjs`'s `VIEWPORTS`
  array. Numbers are part of the contract.
- **Add a view** — append a `{ view, state, needsAuth }` entry to
  `run.mjs`'s `SURFACES` array, and a `captureSurface` branch that does
  whatever the new surface needs (open URL, click tab, wait for text).
- **Add a fixture field** — extend the relevant object in `fixture.mjs`.
  The route handler passes the data through verbatim, so any field the
  app's GraphQL query selects must exist in the response.

## CI

The `visual` job added in SII-127 runs `npm run visual:diff` on
`ubuntu-latest` and uploads `screenshots/visual/current/` and
`screenshots/visual/diff/` as the `visual-screenshots` artifact.
