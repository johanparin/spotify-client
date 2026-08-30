import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const outputRoot = path.resolve(
  projectRoot,
  process.env.ICON_OUT_DIR ?? 'dist',
);
const source = path.join(
  projectRoot,
  'assets/trackside-icon-master.png',
);
const iconset = path.join(outputRoot, 'Trackside.iconset');
const output = path.join(outputRoot, 'trackside.icns');

const sizes = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
];

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(
      result.stderr.trim() || `${path.basename(command)} failed.`,
    );
  }
}

await mkdir(outputRoot, { recursive: true });
await rm(iconset, { force: true, recursive: true });
await mkdir(iconset);

for (const [name, size] of sizes) {
  run('/usr/bin/sips', [
    '-z',
    String(size),
    String(size),
    source,
    '--out',
    path.join(iconset, String(name)),
  ]);
}

run('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', output]);
await rm(iconset, { force: true, recursive: true });
console.log(`Created ${path.relative(projectRoot, output)}`);
