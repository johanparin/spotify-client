import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

const projectRoot = path.resolve(import.meta.dirname, '..');

test('build emits the Electron and renderer artifacts', async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'spotify-build-'));

  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/build.mjs'], {
      cwd: projectRoot,
      env: { ...process.env, BUILD_OUT_DIR: outputRoot },
      stdio: 'pipe',
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`build exited ${code}: ${stderr}`));
    });
  });

  const artifacts = [
    'main/app.js',
    'preload/preload.cjs',
    'renderer/app.js',
    'renderer/index.html',
    'renderer/styles.css',
  ];
  await Promise.all(
    artifacts.map((artifact) => stat(path.join(outputRoot, artifact))),
  );

  const html = await readFile(
    path.join(outputRoot, 'renderer/index.html'),
    'utf8',
  );
  assert.match(html, /\.\/app\.js/);
  assert.match(html, /\.\/styles\.css/);
  assert.match(html, /<title>Trackside<\/title>/);
});
