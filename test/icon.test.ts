import assert from 'node:assert/strict';
import { mkdtemp, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

const projectRoot = path.resolve(import.meta.dirname, '..');

test('icon build creates a macOS icns file', async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'trackside-icon-'));
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/build-icon.mjs'], {
      cwd: projectRoot,
      env: { ...process.env, ICON_OUT_DIR: outputRoot },
      stdio: 'pipe',
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`icon build exited ${code}: ${stderr}`));
    });
  });

  const result = await stat(path.join(outputRoot, 'trackside.icns'));
  assert.ok(result.size > 10_000);
});
