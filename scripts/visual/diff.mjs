#!/usr/bin/env node
// Same-machine pixel diff against the committed baseline.
// Run npm run visual first (or rely on this script's own capture step),
// then compare screenshots/visual/current/ against screenshots/visual/baseline/.
//
// Exits 0 when every compared pair is within the threshold. Exits non-zero
// otherwise. Writes red-tinted diff PNGs to screenshots/visual/diff/ for any
// pair that fails. Prints a markdown table summarising the run.

import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const CURRENT_DIR = join(REPO_ROOT, 'screenshots', 'visual', 'current');
const BASELINE_DIR = join(REPO_ROOT, 'screenshots', 'visual', 'baseline');
const DIFF_DIR = join(REPO_ROOT, 'screenshots', 'visual', 'diff');

const THRESHOLD_PCT = Number.parseFloat(process.env.VISUAL_THRESHOLD_PCT ?? '0.5');

const RED = { r: 255, g: 0, b: 0, alpha: 255 };

/** Recursively list every file under `dir` and yield its path relative to `dir`. */
async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === 'ENOENT') return;
    throw err;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

function decodePng(buffer) {
  return new Promise((resolve, reject) => {
    new PNG().parse(buffer, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

async function readPng(path) {
  const buf = await readFile(path);
  return decodePng(buf);
}

async function listPngs(root) {
  const out = [];
  for await (const abs of walk(root)) {
    if (abs.toLowerCase().endsWith('.png')) {
      out.push(relative(root, abs));
    }
  }
  out.sort();
  return out;
}

function relPathFromCurrent(relativePath) {
  // Capture paths look like <view>/<viewport>/<theme>/<state>.png. We use the
  // same path under baseline/ and diff/.
  return relativePath.split(sep).join('/');
}

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

async function diffPair(relPath) {
  const baselineRel = relPathFromCurrent(relPath);
  const currentAbs = join(CURRENT_DIR, relPath);
  const baselineAbs = join(BASELINE_DIR, baselineRel);
  const diffAbs = join(DIFF_DIR, baselineRel);

  const row = {
    relPath,
    status: 'fail',
    mismatched: null,
    total: null,
    percent: null,
    reason: '',
  };

  let baselineBuf;
  try {
    baselineBuf = await readFile(baselineAbs);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      row.reason = 'missing baseline';
      return row;
    }
    throw err;
  }

  const [currentImg, baselineImg] = await Promise.all([
    readPng(currentAbs).catch((err) => {
      row.reason = `current unreadable: ${err.message}`;
      return null;
    }),
    readPng(baselineAbs).catch((err) => {
      row.reason = `baseline unreadable: ${err.message}`;
      return null;
    }),
  ]);
  if (!currentImg || !baselineImg) return row;

  if (currentImg.width !== baselineImg.width || currentImg.height !== baselineImg.height) {
    row.reason = `size mismatch ${baselineImg.width}x${baselineImg.height} vs ${currentImg.width}x${currentImg.height}`;
    return row;
  }

  const width = currentImg.width;
  const height = currentImg.height;
  const diffImg = new PNG({ width, height });
  const mismatched = pixelmatch(
    currentImg.data,
    baselineImg.data,
    diffImg.data,
    width,
    height,
    { diffColor: [RED.r, RED.g, RED.b] },
  );
  const total = width * height;
  const percent = total === 0 ? 0 : (mismatched / total) * 100;
  const limit = THRESHOLD_PCT;
  const pass = percent <= limit;
  row.status = pass ? 'pass' : 'fail';
  row.mismatched = mismatched;
  row.total = total;
  row.percent = Number(percent.toFixed(4));
  if (!pass) {
    await ensureDir(dirname(diffAbs));
    await writeFile(diffAbs, PNG.sync.write(diffImg));
  }
  return row;
}

function parsePath(relPath) {
  // <view>/<viewport>/<theme>/<state>.png
  const parts = relPath.replace(/\.png$/i, '').split('/');
  if (parts.length !== 4) return { view: relPath, viewport: '', theme: '', state: '' };
  return { view: parts[0], viewport: parts[1], theme: parts[2], state: parts[3] };
}

function renderTable(rows) {
  const head = '| view | viewport | theme | state | status | mismatched | % |';
  const sep = '| -- | -- | -- | -- | -- | -- | -- |';
  const lines = [head, sep];
  for (const r of rows) {
    const { view, viewport, theme, state } = parsePath(r.relPath);
    const status = r.status === 'pass' ? 'PASS' : `FAIL${r.reason ? ` (${r.reason})` : ''}`;
    const mismatched = r.mismatched == null ? '-' : String(r.mismatched);
    const pct = r.percent == null ? '-' : r.percent.toFixed(4);
    lines.push(`| ${view} | ${viewport} | ${theme} | ${state} | ${status} | ${mismatched} | ${pct} |`);
  }
  return lines.join('\n');
}

async function main() {
  // The capture itself is owned by scripts/visual/run.mjs. We delegate the
  // "produce a fresh current/ tree" step by spawning it as a child process so
  // the diff script remains the single source of truth for the gate.
  if (process.env.VISUAL_DIFF_SKIP_CAPTURE !== '1') {
    const { spawn } = await import('node:child_process');
    const capture = spawn('npm', ['run', 'visual'], { stdio: 'inherit' });
    const code = await new Promise((resolve) => capture.on('close', resolve));
    if (code !== 0) {
      console.error(`capture step exited ${code}; aborting diff`);
      process.exit(code);
    }
  }

  // Ensure the baseline directory exists; a missing tree is a hard fail.
  try {
    const st = await stat(BASELINE_DIR);
    if (!st.isDirectory()) {
      console.error(`baseline path is not a directory: ${BASELINE_DIR}`);
      process.exit(2);
    }
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      console.error(`baseline directory not found: ${BASELINE_DIR}`);
      console.error('run `npm run visual:update-baseline` first to create it.');
      process.exit(2);
    }
    throw err;
  }

  const currentFiles = await listPngs(CURRENT_DIR);
  if (currentFiles.length === 0) {
    console.error(`no PNGs under ${CURRENT_DIR}; nothing to diff.`);
    process.exit(2);
  }

  const rows = [];
  for (const rel of currentFiles) rows.push(await diffPair(rel));
  rows.sort((a, b) => a.relPath.localeCompare(b.relPath));

  const table = renderTable(rows);
  console.log(table);

  const failed = rows.filter((r) => r.status !== 'pass');
  const summary = `${rows.length - failed.length}/${rows.length} passed (threshold ${THRESHOLD_PCT}%)`;
  if (failed.length > 0) {
    console.error(`\n${summary} — ${failed.length} failure(s)`);
    process.exit(1);
  }
  console.log(`\n${summary}`);
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(2);
});
