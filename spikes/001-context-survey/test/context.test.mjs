import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fallbackItems,
  findCurrentIndex,
  normalizeItem,
  parseSpotifyUri,
} from '../lib/context.mjs';

test('parseSpotifyUri accepts a three-part Spotify URI', () => {
  assert.deepEqual(parseSpotifyUri('spotify:playlist:abc123'), {
    type: 'playlist',
    id: 'abc123',
  });
});

test('parseSpotifyUri rejects missing and malformed values', () => {
  assert.equal(parseSpotifyUri(null), null);
  assert.equal(parseSpotifyUri('https://open.spotify.com/playlist/abc'), null);
  assert.equal(parseSpotifyUri('spotify:playlist:abc:extra'), null);
});

test('normalizeItem keeps only fields needed by the spike', () => {
  assert.deepEqual(normalizeItem({
    id: 'track-id',
    uri: 'spotify:track:track-id',
    type: 'track',
    name: 'Track',
    artists: [{ name: 'Artist' }],
    duration_ms: 1234,
    track_number: 2,
    ignored: 'value',
  }), {
    uri: 'spotify:track:track-id',
    id: 'track-id',
    type: 'track',
    name: 'Track',
    artists: ['Artist'],
    duration_ms: 1234,
    disc_number: null,
    track_number: 2,
    is_local: false,
    is_playable: null,
  });
});

test('findCurrentIndex prefers URI and falls back to ID', () => {
  const items = [
    { uri: 'spotify:track:a', id: 'a' },
    { uri: 'spotify:track:b', id: 'b' },
  ];
  assert.equal(findCurrentIndex(items, { uri: 'spotify:track:b' }), 1);
  assert.equal(findCurrentIndex(items, { id: 'a' }), 0);
  assert.equal(findCurrentIndex(items, { id: 'missing' }), -1);
});

test('fallbackItems places current playback before the queue', () => {
  const current = { uri: 'spotify:track:current' };
  const queue = [{ uri: 'spotify:track:next' }];
  assert.deepEqual(fallbackItems(current, queue), [current, ...queue]);
  assert.equal(fallbackItems(null, queue), queue);
});
