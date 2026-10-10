#!/usr/bin/env node
// Refresh screenshots/visual/baseline/ from a fresh capture.
//
// The README states a person reviews the resulting tree before committing it,
// so this script never stages or commits the baseline — it just overwrites the
// working tree.

import { spawn } from 'node:child_process';
import { cp, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const CURRENT_DIR = join(REPO_ROOT, 'screenshots', 'visual', 'current');
const BASELINE_DIR = join(REPO_ROOT, 'screenshots', 'visual', 'baseline');

async function exists(path) {
  try {
    const st = await stat(path);
    return st.isDirectory();
  } catch (err) {
    if (err && err.code === 'ENOENT') return false;
    throw err;
  }
}

async function main() {
  if (!(await exists(CURRENT_DIR))) {
    console.error(`no capture found at ${CURRENT_DIR}; run \`npm run visual\` first.`);
    process.exit(1);
  }

  // Refresh the capture so the baseline reflects the current code, not a stale
  // tree. CI and PR authors want the baseline to be derivable from main.
  const capture = spawn('npm', ['run', 'visual'], { stdio: 'inherit' });
  const code = await new Promise((resolve) => capture.on('close', resolve));
  if (code !== 0) {
    console.error(`capture step exited ${code}; baseline not updated.`);
    process.exit(code);
  }

  if (await exists(BASELINE_DIR)) {
    await rm(BASELINE_DIR, { recursive: true, force: true });
  }
  await cp(CURRENT_DIR, BASELINE_DIR, { recursive: true });
  console.log(`baseline refreshed at ${BASELINE_DIR}`);
  console.log('review the diff before committing the baseline tree.');
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(2);
});
