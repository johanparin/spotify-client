import assert from 'node:assert/strict';
import test from 'node:test';

import {
  IPC_CHANNELS,
  type IpcRegistrar,
  registerIpcHandlers,
} from '../src/main/ipc.js';
import type { SpotifyControllerApi } from '../src/spotify/types.js';

type Handler = (event: unknown, ...args: unknown[]) => unknown;

function harness() {
  const calls: { method: string; value?: unknown }[] = [];
  const handlers = new Map<string, Handler>();
  const ipc: IpcRegistrar = {
    handle: (channel, handler) => {
      handlers.set(channel, handler);
    },
    removeHandler: (channel) => {
      handlers.delete(channel);
    },
  };
  const controller = new Proxy({}, {
    get: (_target, property: string) => (...args: unknown[]) => {
      calls.push({ method: property, value: args[0] });
      return Promise.resolve({ method: property });
    },
  }) as SpotifyControllerApi;
  const dispose = registerIpcHandlers(ipc, controller);
  const invoke = (channel: string, ...args: unknown[]) => {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`Unknown IPC channel: ${channel}`);
    return handler({}, ...args);
  };
  return { calls, dispose, handlers, invoke };
}

test('IPC exposes exactly the controller allowlist', () => {
  const { handlers } = harness();
  assert.deepEqual(
    [...handlers.keys()].sort(),
    Object.values(IPC_CHANNELS).sort(),
  );
  assert.equal(handlers.has('spotify:fetch'), false);
  assert.equal(handlers.has('spotify:dispatch'), false);
});

test('IPC routes operations to individual controller methods', async () => {
  const { calls, invoke } = harness();
  await invoke(IPC_CHANNELS.getState);
  await invoke(IPC_CHANNELS.selectPlaylist, 'spotify:playlist:abc123');
  await invoke(IPC_CHANNELS.playRow, 2);
  await invoke(IPC_CHANNELS.seek, 1200);
  await invoke(IPC_CHANNELS.setRepeat, 'context');
  await invoke(IPC_CHANNELS.setShuffle, true);
  await invoke(IPC_CHANNELS.skip, 'previous');
  await invoke(IPC_CHANNELS.selectDevice, 'device id');
  await invoke(
    IPC_CHANNELS.openSpotifyUrl,
    'https://open.spotify.com/track/abc123',
  );
  assert.deepEqual(calls, [
    { method: 'getState', value: undefined },
    { method: 'selectPlaylist', value: 'spotify:playlist:abc123' },
    { method: 'playRow', value: 2 },
    { method: 'seek', value: 1200 },
    { method: 'setRepeat', value: 'context' },
    { method: 'setShuffle', value: true },
    { method: 'skip', value: 'previous' },
    { method: 'selectDevice', value: 'device id' },
    {
      method: 'openSpotifyUrl',
      value: 'https://open.spotify.com/track/abc123',
    },
  ]);
});

test('IPC rejects malformed playlist URIs and rows', () => {
  const { invoke } = harness();
  for (const uri of [null, '', 'spotify:album:abc', 'spotify:playlist:a/b']) {
    assert.throws(
      () => invoke(IPC_CHANNELS.selectPlaylist, uri),
      /Invalid Spotify playlist URI/,
    );
  }
  for (const row of [-1, 1.5, Number.NaN, '1', null]) {
    assert.throws(
      () => invoke(IPC_CHANNELS.playRow, row),
      /non-negative integer/,
    );
  }
});

test('IPC rejects malformed playback-control payloads', () => {
  const { invoke } = harness();
  for (const position of [-1, Number.NaN, Number.POSITIVE_INFINITY, '4']) {
    assert.throws(
      () => invoke(IPC_CHANNELS.seek, position),
      /non-negative number/,
    );
  }
  assert.throws(
    () => invoke(IPC_CHANNELS.setRepeat, 'all'),
    /Invalid repeat mode/,
  );
  assert.throws(
    () => invoke(IPC_CHANNELS.setShuffle, 1),
    /must be a boolean/,
  );
  assert.throws(
    () => invoke(IPC_CHANNELS.skip, 'forward'),
    /Invalid skip direction/,
  );
});

test('IPC rejects malformed device IDs and surplus payloads', () => {
  const { invoke } = harness();
  for (const id of ['', null, 'bad\nvalue', 'x'.repeat(257)]) {
    assert.throws(
      () => invoke(IPC_CHANNELS.selectDevice, id),
      /Invalid Spotify device ID/,
    );
  }
  assert.throws(
    () => invoke(IPC_CHANNELS.getState, 'unexpected'),
    /takes no payload/,
  );
  assert.throws(
    () => invoke(IPC_CHANNELS.playRow, 1, 'unexpected'),
    /takes no payload/,
  );
});

test('IPC permits only canonical Spotify track links', () => {
  const { invoke } = harness();
  for (const url of [
    null,
    'https://example.com/track/abc',
    'https://open.spotify.com/playlist/abc',
    'https://open.spotify.com/track/abc?si=value',
  ]) {
    assert.throws(
      () => invoke(IPC_CHANNELS.openSpotifyUrl, url),
      /Invalid Spotify track URL/,
    );
  }
});

test('disposing IPC removes every registered handler', () => {
  const { dispose, handlers } = harness();
  dispose();
  assert.equal(handlers.size, 0);
});
