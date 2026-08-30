import assert from 'node:assert/strict';
import test from 'node:test';

import { chooseDevice, createController } from '../controller.mjs';

function playlist(name, uri, itemCount = 1) {
  return {
    collaborative: false,
    items: { total: itemCount },
    name,
    owner: { display_name: 'Owner' },
    uri,
  };
}

test('device selection prefers active, then local, and never guesses', () => {
  const remote = {
    id: 'remote',
    is_active: false,
    is_restricted: false,
    name: 'Remote computer',
  };
  const local = {
    id: 'local',
    is_active: false,
    is_restricted: false,
    name: 'ThisMac',
  };
  const active = { ...local, is_active: true };
  assert.equal(chooseDevice([remote, local], 'ThisMac.local'), local);
  assert.equal(chooseDevice([remote, active]), active);
  assert.equal(chooseDevice([remote, local], 'OtherMac'), null);
});

test('playlist listing follows pagination and caches the result', async () => {
  const calls = [];
  const request = async (_token, path) => {
    calls.push(path);
    if (path === '/me/playlists?limit=50') {
      return {
        data: {
          items: [playlist('First', 'spotify:playlist:first')],
          next: 'https://api.spotify.com/v1/me/playlists?offset=50',
        },
      };
    }
    return {
      data: {
        items: [playlist('Second', 'spotify:playlist:second')],
        next: null,
      },
    };
  };
  const controller = createController(async () => 'token', request);

  assert.equal((await controller.playlists()).length, 2);
  assert.equal((await controller.playlists()).length, 2);
  assert.equal(calls.length, 2);
});

test('playlist selection starts only an available non-empty context', async () => {
  const calls = [];
  const request = async (_token, path, options) => {
    calls.push({ options, path });
    if (path === '/me/playlists?limit=50') {
      return {
        data: {
          items: [
            playlist('Playable', 'spotify:playlist:playable'),
            playlist('Empty', 'spotify:playlist:empty', 0),
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
            is_active: false,
            is_restricted: false,
            name: 'MacBook',
          }],
        },
      };
    }
    return { data: null, status: 204 };
  };
  const controller = createController(async () => 'token', request);

  await controller.selectPlaylist('spotify:playlist:playable');
  assert.deepEqual(calls.at(-1), {
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
    controller.selectPlaylist('spotify:playlist:unknown'),
    /not in the available list/,
  );
});
