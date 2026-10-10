// Visual harness runner — SII-124 ships the landing-page sign-in capture.
// SII-125 extends this file with a 40-PNG matrix; SII-126 calls it from
// the diff script.
//
// This file owns:
//   - Chrome launch (executablePath, --no-sandbox, --disable-dev-shm-usage)
//   - Clock install (2026-10-05T07:00:00.000Z, before any page script)
//   - The Europe/Paris timezone
//   - The 1440x900 web context with deviceScaleFactor 1, isMobile false
//   - Failing on a page error, a console error, or any graphql request
//
// It does NOT own `vite preview` (vite starts a child process) or `npm run build`.

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { findViewport, VIEWPORTS } from './viewports.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
process.chdir(ROOT);

const CAPTURE_ROOT = `${ROOT}/screenshots/visual/current`;
const DEFAULT_CHROME_PATH = '/usr/bin/google-chrome';
const CLOCK_INSTANT = '2026-10-05T07:00:00.000Z';
const PREVIEW_BOOT_TIMEOUT_MS = 30_000;

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

/** Pre-allocate a free port on 127.0.0.1. Vite preview takes the port afterwards. */
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

/** Start vite preview on a known port; resolve once the listen URL is logged. */
function startPreview(port) {
  return new Promise((resolve, reject) => {
    const preview = spawn(
      'npm',
      ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
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
      if (!resolved && /Local:\s+http:\/\/127\.0\.0\.1:\d+\//.test(combined)) {
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
    const web = findViewport('web');
    const context = await browser.newContext({
      viewport: { width: web.width, height: web.height },
      deviceScaleFactor: web.deviceScaleFactor,
      isMobile: web.isMobile,
      timezoneId: 'Europe/Paris',
      colorScheme: 'dark',
    });

    const errors = [];
    context.on('page', (page) => {
      page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
      });
      page.on('request', (req) => {
        const target = req.url();
        if (target.startsWith('https://api.linear.app/graphql')) {
          errors.push(`unexpected graphql request: ${target}`);
        }
      });
    });

    const page = await context.newPage();

    // Install Playwright's clock at the contract instant. This patches Date,
    // setTimeout, setInterval, performance.now() and requestAnimationFrame
    // so the app sees a frozen 2026-10-05T07:00:00.000Z from the very first
    // page-script tick (Monday 09:00 Europe/Paris, before the 13:30 half-day
    // cut in src/workingDays.ts).
    await page.clock.install({ time: new Date(CLOCK_INSTANT) });

    log(`opening ${url}`);
    await page.goto(url, { waitUntil: 'load' });

    log('waiting for Sign in with Linear button');
    await page.getByRole('button', { name: 'Sign in with Linear' }).waitFor({ state: 'visible', timeout: 15_000 });

    const outPath = `${CAPTURE_ROOT}/landing/web/dark/sign-in.png`;
    await mkdir(dirname(outPath), { recursive: true });
    await page.screenshot({ path: outPath });
    log(`wrote ${outPath}`);

    if (errors.length > 0) {
      for (const e of errors) log('error:', e);
      fail(`captured ${errors.length} error(s) during landing capture`);
    }

    log('captured 1 of 1 expected PNGs in this issue');
    log(`viewports registered: ${VIEWPORTS.map((v) => v.name).join(', ')}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[visual] capture failed:', err);
    exitCode = 1;
  } finally {
    await browser.close().catch(() => undefined);
    proc.kill('SIGTERM');
  }

  if (exitCode !== 0) process.exit(exitCode);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[visual] fatal:', err);
  process.exit(1);
});
