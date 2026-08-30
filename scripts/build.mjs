import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const outputRoot = path.resolve(
  projectRoot,
  process.env.BUILD_OUT_DIR ?? 'dist',
);

await rm(outputRoot, { force: true, recursive: true });
await Promise.all([
  mkdir(path.join(outputRoot, 'main'), { recursive: true }),
  mkdir(path.join(outputRoot, 'preload'), { recursive: true }),
  mkdir(path.join(outputRoot, 'renderer'), { recursive: true }),
]);

await Promise.all([
  build({
    bundle: true,
    entryPoints: [path.join(projectRoot, 'src/main/app.ts')],
    external: ['electron'],
    format: 'esm',
    outfile: path.join(outputRoot, 'main/app.js'),
    platform: 'node',
    sourcemap: true,
    target: 'node22',
  }),
  build({
    bundle: true,
    entryPoints: [path.join(projectRoot, 'src/preload/preload.ts')],
    external: ['electron'],
    format: 'cjs',
    outfile: path.join(outputRoot, 'preload/preload.cjs'),
    platform: 'node',
    sourcemap: true,
    target: 'node22',
  }),
  build({
    bundle: true,
    entryPoints: [path.join(projectRoot, 'src/renderer/app.tsx')],
    format: 'esm',
    outfile: path.join(outputRoot, 'renderer/app.js'),
    platform: 'browser',
    sourcemap: true,
    target: 'chrome142',
  }),
  cp(
    path.join(projectRoot, 'src/renderer/index.html'),
    path.join(outputRoot, 'renderer/index.html'),
  ),
  cp(
    path.join(projectRoot, 'src/renderer/styles.css'),
    path.join(outputRoot, 'renderer/styles.css'),
  ),
]);
