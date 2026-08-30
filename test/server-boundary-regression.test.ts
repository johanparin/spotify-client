import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(import.meta.dirname, '..');

test('product startup has no loopback application server', async () => {
  const productFiles = [
    'src/main/app.ts',
    'src/main/ipc.ts',
    'src/preload/preload.ts',
  ];
  const contents = await Promise.all(productFiles.map((file) => {
    return readFile(path.join(projectRoot, file), 'utf8');
  }));
  const source = contents.join('\n');
  assert.doesNotMatch(source, /node:http|createServer|\.listen\s*\(/);
  assert.doesNotMatch(source, /\/api\//);
  assert.doesNotMatch(source, /startServer|loadURL/);
  assert.match(source, /loadFile/);
});
