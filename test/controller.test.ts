import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  ApiRequestOptions,
  ApiResponse,
} from '../src/spotify/api.js';
import { SpotifyApiError } from '../src/spotify/api.js';
import {
  chooseDevice,
  createController,
} from '../src/spotify/controller.js';
import type { DeviceSummary } from '../src/spotify/types.js';

interface Call {
  options?: ApiRequestOptions;
  path: string;
}

type Responder = (
  path: string,
  options?: ApiRequestOptions,
) => { data: unknown; elapsedMs?: number; status?: number } | Promise<{
  data: unknown;
  elapsedMs?: number;
  status?: number;
}>;

function mockRequest(responder: Responder) {
  const calls: Call[] = [];
  const request = async <T>(
    _token: string,
    path: string,
    options?: ApiRequestOptions,
  ): Promise<ApiResponse<T>> => {
    calls.push({ options, path });
    const result = await responder(path, options);
    return {
      data: result.data as T,
      elapsedMs: result.elapsedMs ?? 1,
      status: result.status ?? 200,
    };
  };
  return { calls, request };
}

function rawTrack(id: string, durationMs = 180_000) {
  return {
    artists: [{ name: 'Artist' }],
    duration_ms: durationMs,
    id,
    name: id,
    type: 'track',
    uri: `spotify:track:${id}`,
  };
}

function playback(
  id: string,
  contextUri: string | null = 'spotify:playlist:list',
) {
  return {
    actions: { disallows: {} },
    context: contextUri ? { uri: contextUri } : null,
    device: {
      id: 'active',
      is_active: true,
      is_restricted: false,
      name: 'MacBook',
      type: 'Computer',
    },
    is_playing: true,
    item: rawTrack(id),
    progress_ms: 1000,
    repeat_state: 'off',
    shuffle_state: false,
  };
}

function playlist(name: string, id: string, itemCount = 1) {
  return {
    collaborative: false,
    items: { total: itemCount },
    name,
    owner: { display_name: 'Owner' },
    uri: `spotify:playlist:${id}`,
  };
}

function device(
  id: string,
  name: string,
  active = false,
): DeviceSummary {
  return {
    id,
    isActive: active,
    isRestricted: false,
    name,
    type: 'Computer',
    volumePercent: 50,
  };
}

test('device choice prefers active, local, then one available device', () => {
  const remote = device('remote', 'Remote');
  const local = device('local', 'ThisMac');
  assert.equal(chooseDevice([remote, local], 'ThisMac.local'), local);
  assert.equal(
    chooseDevice([remote, device('a', 'Active', true)])?.id,
    'a',
  );
  assert.equal(chooseDevice([remote, local], 'OtherMac'), null);
  assert.equal(chooseDevice([remote], 'OtherMac'), remote);
  assert.equal(
    chooseDevice([{ ...remote, isRestricted: true }], 'Remote'),
    null,
  );
});

test('playback restrictions are normalized for the renderer', async () => {
  const mock = mockRequest((path) => {
    if (path.startsWith('/me/player?')) {
      return {
        data: {
          ...playback('a'),
          actions: {
            disallows: {
              seeking: true,
              skipping_next: true,
              toggling_shuffle: true,
            },
          },
        },
      };
    }
    if (path === '/playlists/list') {
      return { data: { items: { total: 1 }, name: 'List' } };
    }
    if (path.startsWith('/playlists/list/items')) {
      return { data: { items: [{ item: rawTrack('a') }], next: null } };
    }
    throw new Error(`Unexpected path ${path}`);
  });
  const controller = createController({
    request: mock.request,
    tokenProvider: async () => 'token',
  });
  assert.deepEqual((await controller.getState()).playback?.actions, {
    pausing: true,
    resuming: true,
    seeking: false,
    skippingNext: false,
    skippingPrevious: true,
    togglingRepeat: true,
    togglingShuffle: false,
  });
});

test('playlist listing paginates and caches for five minutes', async () => {
  let now = 0;
  const mock = mockRequest((path) => {
    if (path === '/me/playlists?limit=50') {
      return {
        data: {
          items: [playlist('First', 'first')],
          next: 'https://api.spotify.com/v1/me/playlists?offset=50',
        },
      };
    }
    return {
      data: { items: [playlist('Second', 'second')], next: null },
    };
  });
  const controller = createController({
    now: () => now,
    request: mock.request,
    tokenProvider: async () => 'token',
  });

  assert.equal((await controller.listPlaylists()).length, 2);
  assert.equal((await controller.listPlaylists()).length, 2);
  assert.equal(mock.calls.length, 2);
  now = 300_001;
  await controller.listPlaylists();
  assert.equal(mock.calls.length, 4);
});

test('playlist selection validates and URL-encodes device IDs', async () => {
  const mock = mockRequest((path) => {
    if (path === '/me/playlists?limit=50') {
      return {
        data: {
          items: [
            playlist('Playable', 'playable'),
            playlist('Empty', 'empty', 0),
          ],
          next: null,
        },
      };
    }
    if (path === '/me/player/devices') {
      return {
        data: {
          devices: [{
            id: 'device id',
            is_active: true,
            is_restricted: false,
            name: 'MacBook',
          }],
        },
      };
    }
    return { data: null, status: 204 };
  });
  const controller = createController({
    request: mock.request,
    tokenProvider: async () => 'token',
  });

  await controller.selectPlaylist('spotify:playlist:playable');
  assert.deepEqual(mock.calls.at(-1), {
    options: {
      body: { context_uri: 'spotify:playlist:playable' },
      method: 'PUT',
    },
    path: '/me/player/play?device_id=device%20id',
  });
  await assert.rejects(
    controller.selectPlaylist('spotify:playlist:empty'),
    /Playlist is empty/,
  );
  await assert.rejects(
    controller.selectPlaylist('spotify:playlist:missing'),
    /not in the available list/,
  );
});

test('context lists are cached until the context URI changes', async () => {
  let currentContext = 'one';
  const mock = mockRequest((path) => {
    if (path.startsWith('/me/player?')) {
      return { data: playback('a', `spotify:playlist:${currentContext}`) };
    }
    if (path === `/playlists/${currentContext}`) {
      return {
        data: {
          items: { total: 1 },
          name: `List ${currentContext}`,
        },
      };
    }
    if (path.startsWith(`/playlists/${currentContext}/items`)) {
      return { data: { items: [{ item: rawTrack('a') }], next: null } };
    }
    throw new Error(`Unexpected path ${path}`);
  });
  const controller = createController({
    request: mock.request,
    tokenProvider: async () => 'token',
  });

  await controller.getState();
  await controller.getState();
  assert.equal(
    mock.calls.filter((call) => call.path === '/playlists/one').length,
    1,
  );
  currentContext = 'two';
  const state = await controller.getState();
  assert.equal(state.context.name, 'List two');
  assert.equal(
    mock.calls.filter((call) => call.path === '/playlists/two').length,
    1,
  );
});

test('inaccessible context fallback refreshes by track', async () => {
  let current = 'a';
  let queueReads = 0;
  const mock = mockRequest((path) => {
    if (path.startsWith('/me/player?')) {
      return { data: playback(current) };
    }
    if (path === '/playlists/list') {
      return { data: { items: { total: 10 }, name: 'Followed' } };
    }
    if (path.startsWith('/playlists/list/items')) {
      throw new SpotifyApiError(403, 'GET', path, null);
    }
    if (path === '/me/player/queue') {
      queueReads += 1;
      return {
        data: { queue: [rawTrack(current), rawTrack(`${current}-next`)] },
      };
    }
    throw new Error(`Unexpected path ${path}`);
  });
  const controller = createController({
    request: mock.request,
    tokenProvider: async () => 'token',
  });

  const first = await controller.getState();
  assert.equal(first.context.name, 'Followed');
  assert.deepEqual(first.items.map((item) => item.id), ['a', 'a-next']);
  assert.deepEqual(first.list, {
    mode: 'current-plus-queue',
    reason: 'api-error:403',
  });
  await controller.getState();
  assert.equal(queueReads, 1);
  current = 'b';
  const changed = await controller.getState();
  assert.deepEqual(changed.items.map((item) => item.id), ['b', 'b-next']);
  assert.equal(queueReads, 2);
});

test('absent playback and contextless playback are explicit', async () => {
  let active = false;
  const mock = mockRequest((path) => {
    if (path.startsWith('/me/player?')) {
      return { data: active ? playback('a', null) : null };
    }
    if (path === '/me/player/queue') {
      return { data: { queue: [rawTrack('b')] } };
    }
    throw new Error(`Unexpected path ${path}`);
  });
  const controller = createController({
    request: mock.request,
    tokenProvider: async () => 'token',
  });

  const empty = await controller.getState();
  assert.equal(empty.playback, null);
  assert.equal(empty.list.reason, 'no-playback');
  active = true;
  const contextless = await controller.getState();
  assert.equal(contextless.canPlayRows, false);
  assert.equal(contextless.list.reason, 'missing-or-invalid-context-uri');
  await assert.rejects(controller.playRow(0), /no context URI/);
});

test('playRow validates indexes and preserves fallback context', async () => {
  const mock = mockRequest((path) => {
    if (path.startsWith('/me/player?')) return { data: playback('a') };
    if (path === '/playlists/list') {
      return { data: { items: { total: 2 }, name: 'Followed' } };
    }
    if (path.startsWith('/playlists/list/items')) {
      throw new SpotifyApiError(403, 'GET', path, null);
    }
    if (path === '/me/player/queue') {
      return { data: { queue: [rawTrack('b')] } };
    }
    return { data: null, status: 204 };
  });
  const controller = createController({
    request: mock.request,
    tokenProvider: async () => 'token',
  });

  await assert.rejects(controller.playRow(-1), /non-negative integer/);
  await assert.rejects(controller.playRow(0.5), /non-negative integer/);
  await controller.playRow(1);
  assert.deepEqual(mock.calls.at(-1), {
    options: {
      body: {
        context_uri: 'spotify:playlist:list',
        offset: { uri: 'spotify:track:b' },
      },
      method: 'PUT',
    },
    path: '/me/player/play',
  });
});

test('skip, shuffle, and repeat produce request shapes', async () => {
  const mock = mockRequest(() => ({ data: null, status: 204 }));
  const controller = createController({
    request: mock.request,
    tokenProvider: async () => 'token',
  });
  await controller.skip('previous');
  await controller.skip('next');
  await controller.setShuffle(true);
  await controller.setRepeat('track');
  assert.deepEqual(mock.calls, [
    { options: { method: 'POST' }, path: '/me/player/previous' },
    { options: { method: 'POST' }, path: '/me/player/next' },
    {
      options: { method: 'PUT' },
      path: '/me/player/shuffle?state=true',
    },
    {
      options: { method: 'PUT' },
      path: '/me/player/repeat?state=track',
    },
  ]);
  await assert.rejects(
    controller.setRepeat('bad' as 'off'),
    /Invalid repeat mode/,
  );
});

test('toggle chooses pause or play from current state', async () => {
  let playing = true;
  const mock = mockRequest((path) => {
    if (path.startsWith('/me/player?')) {
      return { data: { ...playback('a'), is_playing: playing } };
    }
    if (path === '/playlists/list') {
      return { data: { items: { total: 1 }, name: 'List' } };
    }
    if (path.startsWith('/playlists/list/items')) {
      return { data: { items: [{ item: rawTrack('a') }], next: null } };
    }
    return { data: null, status: 204 };
  });
  const controller = createController({
    request: mock.request,
    tokenProvider: async () => 'token',
  });

  assert.deepEqual(await controller.togglePlayback(), { isPlaying: false });
  assert.equal(mock.calls.at(-1)?.path, '/me/player/pause');
  playing = false;
  assert.deepEqual(await controller.togglePlayback(), { isPlaying: true });
  assert.equal(mock.calls.at(-1)?.path, '/me/player/play');
});

test('seek clamps and explicit device selection transfers', async () => {
  const mock = mockRequest((path) => {
    if (path.startsWith('/me/player?')) return { data: playback('a') };
    if (path === '/playlists/list') {
      return { data: { items: { total: 1 }, name: 'List' } };
    }
    if (path.startsWith('/playlists/list/items')) {
      return { data: { items: [{ item: rawTrack('a') }], next: null } };
    }
    if (path === '/me/player/devices') {
      return {
        data: {
          devices: [{
            id: 'target',
            is_active: false,
            is_restricted: false,
            name: 'Target',
          }],
        },
      };
    }
    return { data: null, status: 204 };
  });
  const controller = createController({
    request: mock.request,
    tokenProvider: async () => 'token',
  });

  await controller.seek(999_999);
  assert.deepEqual(mock.calls.at(-1), {
    options: { method: 'PUT' },
    path: '/me/player/seek?position_ms=180000',
  });
  await controller.selectDevice('target');
  assert.deepEqual(mock.calls.at(-1), {
    options: {
      body: { device_ids: ['target'] },
      method: 'PUT',
    },
    path: '/me/player',
  });
});
