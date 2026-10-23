// Visual harness runner.
//
// SII-124 owns:
//   - Chrome launch (executablePath, --no-sandbox, --disable-dev-shm-usage)
//   - Clock install (2026-10-05T07:00:00.000Z, before any page script)
//   - The Europe/Paris timezone
//   - The `npm run visual` script in root package.json
//   - The .gitignore lines for screenshots/visual/{current,diff}/
//
// SII-125 extends this file with the 4-viewport matrix. SII-151 adds
// the overview surface (collapsed). SII-166 drops tree-global. Surfaces:
// landing, timeline, tree, settings, overview, across two themes.
// GraphQL route interception reads fixture.mjs.
//
// SII-126 calls this file from the diff script. SII-127 runs it from the
// GitHub Actions job.

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { VIEWPORTS } from './viewports.mjs';
import {
  ADHOC_PROJECT,
  PROJECT,
  SAVED_VIEWS,
  TEAM,
  STATES,
  ISSUES,
  MILESTONES,
  getHistoryForIssue,
} from './fixture.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
process.chdir(ROOT);

const CAPTURE_ROOT = `${ROOT}/screenshots/visual/current`;
const DEFAULT_CHROME_PATH = '/usr/bin/google-chrome';
const CLOCK_INSTANT = '2026-10-05T07:00:00.000Z';
// 2030-01-01T00:00:00.000Z. getAccessToken() refreshes when expiresAt is
// under five minutes ahead of Date.now(). The frozen clock is
// 2026-10-05T07:00:00.000Z (1791183600000). 1790000000000 is
// 2026-09-21T14:13:20.000Z, so it is already expired: refreshTokens() calls
// getClientId() before any network I/O, the visual build has no
// VITE_LINEAR_CLIENT_ID, the throw is caught in App, and clearTokens()
// drops the session. This value stays outside the refresh window.
const AUTH_EXPIRES_AT = 1893456000000;
const PREVIEW_BOOT_TIMEOUT_MS = 30_000;
const OAUTH_REFRESH_URL = 'https://api.linear.app/oauth/token';
const DATA_VIEW_PATH = '/proj-priskurven/';

const SURFACES = Object.freeze([
  Object.freeze({ view: 'landing',     state: 'sign-in',   needsAuth: false }),
  Object.freeze({ view: 'timeline',    state: 'populated', needsAuth: true  }),
  Object.freeze({ view: 'timeline',    state: 'filters',   needsAuth: true  }),
  Object.freeze({ view: 'timeline',    state: 'views',     needsAuth: true  }),
  Object.freeze({ view: 'tree',        state: 'populated', needsAuth: true  }),
  Object.freeze({ view: 'settings',    state: 'panel',     needsAuth: true  }),
  Object.freeze({ view: 'overview',    state: 'collapsed', needsAuth: true  }),
]);

const THEMES = Object.freeze(['dark', 'light']);

function log(...args) {
  // eslint-disable-next-line no-console
  console.log('[visual]', ...args);
}

function fail(message, code = 1) {
  // eslint-disable-next-line no-console
  console.error(`[visual] ${message}`);
  process.exit(code);
}

function runChild(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

function pickFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function startPreview(port) {
  return new Promise((resolve, reject) => {
    const preview = spawn(
      'npm',
      ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
      {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
        // GitHub Actions sets FORCE_COLOR, so Vite wraps "Local:" and the port
        // in ANSI and the listen regex never matches.
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      },
    );

    let combined = '';
    let resolved = false;
    const finishResolve = () => {
      if (resolved) return;
      resolved = true;
      resolve({ proc: preview });
    };
    const finishReject = (err) => {
      if (resolved) return;
      resolved = true;
      preview.kill('SIGTERM');
      reject(err);
    };

    const onChunk = (chunk) => {
      combined += chunk.toString();
      const plain = combined.replace(/\u001b\[[0-9;]*m/g, '');
      if (!resolved && /Local:\s+http:\/\/127\.0\.0\.1:\d+\//.test(plain)) {
        finishResolve();
      }
    };
    preview.stdout.on('data', onChunk);
    preview.stderr.on('data', onChunk);

    const timer = setTimeout(() => {
      finishReject(new Error(`vite preview did not print a listen URL in ${PREVIEW_BOOT_TIMEOUT_MS}ms. Combined output so far: ${combined}`));
    }, PREVIEW_BOOT_TIMEOUT_MS);

    preview.on('exit', (code) => {
      clearTimeout(timer);
      if (!resolved) {
        finishReject(new Error(`vite preview exited early with code ${code}. Combined output: ${combined}`));
      }
    });
    preview.on('error', (err) => {
      clearTimeout(timer);
      finishReject(err);
    });
  });
}

async function buildOnce() {
  log('building app');
  await runChild('npm', ['run', 'build']);
}

// ------- Mock GraphQL handler ------------------------------------------

// Match order matters: `projects(` must come before `issues(` because the
// projects query also contains `issues(first: 1)` as an emptiness probe.
function dispatchGraphQL(query, variables) {
  if (query.includes('history(first:')) return historyPage(variables);
  if (query.includes('projects(')) return projectPage();
  // OverviewTeamIssues also contains issues(first:. Match it first so the
  // project issues page stays the project(id) response.
  if (query.includes('OverviewTeamIssues')) return overviewTeamIssuesPage();
  if (query.includes('issues(first:')) return issuesPage();
  if (query.includes('projectMilestones')) return milestonesPage();
  if (query.includes('cycles(')) return cyclesPage();
  if (query.includes('states')) return statesPage();
  if (query.includes('project(id:') || query.includes('teams')) return projectTeamsPage();
  // Any other query is a spec defect — log and fail the run.
  log('unhandled GraphQL query:', query.slice(0, 200));
  throw new Error(`unhandled GraphQL query: ${query.slice(0, 200)}`);
}

function projectPage() {
  const team = { id: TEAM.id, name: TEAM.name, key: TEAM.key };
  return {
    projects: {
      nodes: [
        {
          id: PROJECT.id,
          name: PROJECT.name,
          teams: { nodes: [team] },
          issues: { nodes: [{ id: ISSUES[0].id }] },
        },
        {
          id: ADHOC_PROJECT.id,
          name: ADHOC_PROJECT.name,
          teams: { nodes: [team] },
          issues: { nodes: [{ id: ADHOC_PROJECT.issueId }] },
        },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  };
}

function issuesPage() {
  return {
    project: {
      issues: {
        nodes: ISSUES,
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  };
}

function overviewTeamIssuesPage() {
  return {
    team: {
      issues: {
        nodes: ISSUES,
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  };
}

function milestonesPage() {
  return {
    project: {
      projectMilestones: {
        nodes: MILESTONES.map((m) => ({ id: m.id, name: m.name, sortOrder: m.sortOrder })),
      },
    },
  };
}

function cyclesPage() {
  return {
    team: {
      cycles: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
    },
  };
}

function statesPage() {
  return {
    team: {
      states: {
        nodes: STATES.map((s) => ({ id: s.id, name: s.name, type: s.type, position: s.position, color: s.color })),
      },
    },
  };
}

function projectTeamsPage() {
  return {
    project: {
      teams: { nodes: [{ id: TEAM.id }] },
    },
  };
}

function historyPage(variables) {
  // Variables carry one id0, id1, ... per issue; the result must carry
  // matching i0, i1, ... keys in the same order.
  const data = {};
  let idx = 0;
  while (`id${idx}` in variables) {
    const issueId = variables[`id${idx}`];
    const nodes = getHistoryForIssue(issueId);
    data[`i${idx}`] = {
      id: issueId,
      history: { nodes },
      comments: { nodes: [] },
    };
    idx += 1;
  }
  return data;
}

async function registerGraphQLMock(context) {
  // Track OAuth refresh URL hits so we can fail the run if the token is
  // inside the five-minute refresh window. We do NOT register a route for
  // the OAuth URL — the spec wants the harness to *detect* an oauth hit
  // and fail, not pre-empt it. AUTH_EXPIRES_AT is 2030-01-01, past
  // CLOCK_INSTANT, so the refresh path is never taken.
  context._oauthHit = false;
  context.on('request', (req) => {
    if (req.url().startsWith(OAUTH_REFRESH_URL)) {
      log(`unexpected OAuth refresh URL hit: ${req.url()}`);
      context._oauthHit = true;
    }
  });

  await context.route('**/api/views', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === 'GET' && pathname === '/api/views') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SAVED_VIEWS),
      });
      return;
    }
    await route.fallback();
  });

  await context.route('https://api.linear.app/graphql', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') {
      await route.continue();
      return;
    }
    let body;
    try {
      body = JSON.parse(request.postData() ?? '{}');
    } catch {
      await route.continue();
      return;
    }
    const { query, variables } = body;
    log(`gql: ${(query ?? '').slice(0, 80).replace(/\s+/g, ' ')}`);
    let data;
    try {
      data = dispatchGraphQL(query ?? '', variables ?? {});
    } catch (err) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ errors: [{ message: String(err) }] }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data }),
    });
  });
}

// ------- Capture loop ---------------------------------------------------

async function waitForLoadingGone(page) {
  const start = Date.now();
  while (Date.now() - start < 15_000) {
    const visible = await page.getByText('Loading issues...').isVisible().catch(() => false);
    if (!visible) return;
    await page.waitForTimeout(100);
  }
  fail('app stayed on "Loading issues..." for over 15s');
}

async function assertNoErrorBanners(page) {
  for (const text of ['Failed to fetch issues', 'No issues found in this project.']) {
    if (await page.getByText(text).isVisible().catch(() => false)) {
      fail(`app displayed error: "${text}"`);
    }
  }
}

async function assertHeaderChrome(page) {
  if (await page.getByText('Select a project…').count() !== 0) {
    fail('header still has a project select');
  }
  if (await page.getByRole('button', { name: 'Tree (global)' }).count() !== 0) {
    fail('Tree (global) tab is still present');
  }
  const labels = await page.locator('button[aria-label="Overview"]').locator('xpath=..').locator('button').evaluateAll(
    (els) => els.map((el) => el.getAttribute('aria-label')),
  );
  if (labels[0] !== 'Overview') {
    fail(`first tab is ${labels[0] ?? 'missing'}, expected Overview`);
  }
}

async function captureSurface({ page, port, surface, theme, viewportName }) {
  const url = surface.needsAuth
    ? `http://127.0.0.1:${port}${DATA_VIEW_PATH}`
    : `http://127.0.0.1:${port}/`;

  log(`opening ${url} (${surface.view}/${viewportName}/${theme})`);
  await page.goto(url, { waitUntil: 'load' });

  if (surface.view === 'landing') {
    await page.getByRole('button', { name: 'Sign in with Linear' }).waitFor({ state: 'visible', timeout: 15_000 });
  } else if (surface.view === 'timeline') {
    await waitForLoadingGone(page);
    await assertNoErrorBanners(page);
    await page.getByText('SII-91').first().waitFor({ state: 'visible', timeout: 15_000 });
    await page.getByRole('button', { name: 'Timeline' }).waitFor({ state: 'visible', timeout: 15_000 });
    const undated = page.getByRole('region', { name: 'No due date' });
    await undated.waitFor({ state: 'visible', timeout: 15_000 });
    await undated.getByText('SII-101').waitFor({ state: 'visible', timeout: 15_000 });
    await undated.getByText('These issues are not placed on the timeline.').waitFor({ state: 'visible', timeout: 15_000 });
    if (await undated.getByText('SII-93').count() !== 0) {
      fail('in-progress SII-93 was listed under No due date');
    }
    const forecastCheckbox = page.getByRole('checkbox', { name: 'Capacity forecast' });
    const forecastChip = page.getByRole('button', { name: 'Forecast', exact: true });
    if (await forecastCheckbox.count()) {
      await forecastCheckbox.check();
    } else {
      await forecastChip.click();
    }
    await undated.getByText('Hatched bars on the timeline are a capacity forecast, not a deadline.').waitFor({ state: 'visible', timeout: 15_000 });
    if (await forecastCheckbox.count()) {
      await forecastCheckbox.uncheck();
    } else {
      await forecastChip.click();
    }
    await undated.getByText('These issues are not placed on the timeline.').waitFor({ state: 'visible', timeout: 15_000 });
    await assertHeaderChrome(page);
    if (surface.state === 'filters') {
      await page.getByRole('button', { name: 'Filters', exact: true }).click();
      await page.getByPlaceholder('Search filters...').waitFor({ state: 'visible', timeout: 15_000 });
      await page.getByRole('heading', { name: 'Filters' }).waitFor({ state: 'visible', timeout: 15_000 });
      await page.getByText('Project', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
    } else if (surface.state === 'views') {
      await page.getByRole('button', { name: 'Views' }).click();
      await page.getByText('Huskøb').waitFor({ state: 'visible', timeout: 15_000 });
    }
    if (surface.state === 'filters' || surface.state === 'views') {
      const documentScrolls = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      if (documentScrolls) fail('timeline document scrolls horizontally');
    }
  } else if (surface.view === 'tree') {
    await waitForLoadingGone(page);
    await assertNoErrorBanners(page);
    await page.getByText('SII-91').first().waitFor({ state: 'visible', timeout: 15_000 });
    await assertHeaderChrome(page);
    await page.getByRole('button', { name: 'Tree', exact: true }).click();
    await page.getByText('SII-91').first().waitFor({ state: 'visible', timeout: 15_000 });
  } else if (surface.view === 'settings') {
    await waitForLoadingGone(page);
    await assertNoErrorBanners(page);
    await page.getByText('SII-91').first().waitFor({ state: 'visible', timeout: 15_000 });
    await assertHeaderChrome(page);
    await page.getByLabel('Settings').click();
    await page.getByText('People in parallel').waitFor({ state: 'visible', timeout: 15_000 });
  } else if (surface.view === 'overview') {
    await waitForLoadingGone(page);
    await assertNoErrorBanners(page);
    await page.getByRole('button', { name: 'Overview', exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
    await assertHeaderChrome(page);
    await page.getByRole('button', { name: 'Overview' }).click();
    for (const heading of ['Overdue', 'Next', 'Soon', 'No date', 'Later']) {
      await page.getByRole('heading', { level: 2, name: heading }).waitFor({ state: 'visible', timeout: 15_000 });
    }
    const stack = page.getByRole('region', { name: 'Overview' });
    await stack.waitFor({ state: 'visible', timeout: 15_000 });
    const documentScrolls = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    const stackScrolls = await stack.evaluate((el) => el.scrollWidth > el.clientWidth);
    if (documentScrolls || stackScrolls) {
      fail('overview stack scrolls horizontally');
    }
  }

  const outPath = `${CAPTURE_ROOT}/${surface.view}/${viewportName}/${theme}/${surface.state}.png`;
  await mkdir(dirname(outPath), { recursive: true });
  await page.screenshot({ path: outPath, fullPage: surface.view === 'overview' });
  log(`wrote ${outPath}`);
}

// Auth bootstrap: install the mock auth token via addInitScript so it
// lands before any page script reads it. No Storage.prototype wrappers —
// those interfered with the source code's access to localStorage.
function installMockAuth(expiresAt) {
  try {
    localStorage.setItem('linear-planner-auth', JSON.stringify({
      accessToken: 'mock',
      refreshToken: 'mock',
      expiresAt,
    }));
  } catch (err) {
    // newPage() runs init scripts on about:blank. Chrome denies localStorage
    // there, and that SecurityError would fail the run. The next navigation
    // is the app document, and that one still receives the token.
    if (!err || err.name !== 'SecurityError') throw err;
  }
}

async function captureAll(browser, port) {
  const written = [];
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.deviceScaleFactor,
        isMobile: viewport.isMobile,
        timezoneId: 'Europe/Paris',
        colorScheme: theme,
        userAgent: viewport.userAgent ?? undefined,
      });

      const pageErrors = [];
      context.on('page', (page) => {
        page.on('pageerror', (err) => pageErrors.push(`pageerror: ${err.message}`));
        page.on('console', (msg) => {
          if (msg.type() === 'error') pageErrors.push(`console.error: ${msg.text()}`);
        });
      });

      await registerGraphQLMock(context);

      // Landing capture: no auth token. Auth-free page in the same context
      // (Playwright contexts are isolated; the auth is only set via
      // addInitScript on the next context).
      const landing = await context.newPage();
      await landing.clock.install({ time: new Date(CLOCK_INSTANT) });
      await captureSurface({ page: landing, port, surface: SURFACES[0], theme, viewportName: viewport.name });
      written.push(`${SURFACES[0].view}/${viewport.name}/${theme}/${SURFACES[0].state}.png`);
      await landing.close();

      // Authed context for the data + settings surfaces. Separate context
      // because addInitScript stacks, and we want a clean localStorage.
      const dataContext = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.deviceScaleFactor,
        isMobile: viewport.isMobile,
        timezoneId: 'Europe/Paris',
        colorScheme: theme,
        userAgent: viewport.userAgent ?? undefined,
      });
      await dataContext.addInitScript(installMockAuth, AUTH_EXPIRES_AT);

      const dataErrors = [];
      dataContext.on('page', (page) => {
        page.on('pageerror', (err) => dataErrors.push(`pageerror: ${err.message}`));
        page.on('console', (msg) => {
          if (msg.type() === 'error') dataErrors.push(`console.error: ${msg.text()}`);
        });
      });
      await registerGraphQLMock(dataContext);
      const dataPage = await dataContext.newPage();
      await dataPage.clock.install({ time: new Date(CLOCK_INSTANT) });

      for (const surface of SURFACES.slice(1)) {
        await captureSurface({ page: dataPage, port, surface, theme, viewportName: viewport.name });
        written.push(`${surface.view}/${viewport.name}/${theme}/${surface.state}.png`);
      }

      if (dataErrors.length > 0) {
        for (const e of dataErrors) log('error:', e);
        fail(`captured ${dataErrors.length} data-context error(s) during ${viewport.name}/${theme}`);
      }
      if (dataContext._oauthHit) {
        fail(`unexpected OAuth refresh URL was hit during ${viewport.name}/${theme}`);
      }
      await dataContext.close();

      if (pageErrors.length > 0) {
        for (const e of pageErrors) log('error:', e);
        fail(`captured ${pageErrors.length} landing-context error(s) during ${viewport.name}/${theme}`);
      }
      if (context._oauthHit) {
        fail(`unexpected OAuth refresh URL was hit during ${viewport.name}/${theme} (landing)`);
      }
      await context.close();
    }
  }
  return written;
}

async function main() {
  await buildOnce();

  const port = await pickFreePort();
  log(`starting vite preview on 127.0.0.1:${port}`);
  const { proc } = await startPreview(port);
  const url = `http://127.0.0.1:${port}/`;
  log(`preview up at ${url}`);

  const chromePath = process.env.VISUAL_CHROME_PATH || DEFAULT_CHROME_PATH;
  log(`launching chrome at ${chromePath}`);

  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  let exitCode = 0;
  try {
    const written = await captureAll(browser, port);
    log(`captured ${written.length} PNGs (expected ${VIEWPORTS.length * SURFACES.length * THEMES.length})`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[visual] capture failed:', err);
    exitCode = 1;
  } finally {
    await browser.close().catch(() => undefined);
    // npm does not forward SIGTERM to vite, and a live preview pipe keeps
    // this process from exiting after a successful capture.
    try {
      process.kill(-proc.pid, 'SIGTERM');
    } catch {
      proc.kill('SIGTERM');
    }
  }

  process.exit(exitCode);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[visual] fatal:', err);
  process.exit(1);
});
