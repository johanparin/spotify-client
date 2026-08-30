import assert from 'node:assert/strict';
import test from 'node:test';

import { startServer } from '../server.mjs';

test('UI server supports an ephemeral loopback port', async (context) => {
  const { server, url } = await startServer({ port: 0 });
  context.after(() => new Promise((resolve) => server.close(resolve)));

  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/);
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Spotify compact controller/);
});
