import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fallbackItems,
  findCurrentIndex,
  normalizeItem,
  parseSpotifyUri,
} from '../src/spotify/context.js';
import type { NormalizedTrack } from '../src/spotify/types.js';

function track(id: string): NormalizedTrack {
  return {
    artists: [],
    discNumber: null,
    durationMs: null,
    id,
    isLocal: false,
    isPlayable: true,
    name: id,
    trackNumber: null,
    type: 'track',
    uri: `spotify:track:${id}`,
  };
}

test('parseSpotifyUri accepts a three-part Spotify URI', () => {
  assert.deepEqual(parseSpotifyUri('spotify:playlist:abc123'), {
    id: 'abc123',
    type: 'playlist',
  });
});

test('parseSpotifyUri rejects missing and malformed values', () => {
  assert.equal(parseSpotifyUri(null), null);
  assert.equal(parseSpotifyUri('https://open.spotify.com/playlist/a'), null);
  assert.equal(parseSpotifyUri('spotify:playlist:abc:extra'), null);
  assert.equal(parseSpotifyUri('spotify::abc'), null);
});

test('normalizeItem keeps renderer-safe track fields', () => {
  assert.deepEqual(normalizeItem({
    artists: [{ name: 'Artist' }, null, { name: 7 }],
    duration_ms: 1234,
    id: 'track-id',
    ignored: 'value',
    name: 'Track',
    track_number: 2,
    type: 'track',
    uri: 'spotify:track:track-id',
  } as Record<string, unknown>), {
    artists: ['Artist'],
    discNumber: null,
    durationMs: 1234,
    id: 'track-id',
    isLocal: false,
    isPlayable: null,
    name: 'Track',
    trackNumber: 2,
    type: 'track',
    uri: 'spotify:track:track-id',
  });
});

test('normalizeItem rejects nullable and unsupported items', () => {
  assert.equal(normalizeItem(null), null);
  assert.equal(normalizeItem({ type: 'episode' }), null);
  assert.equal(normalizeItem({ type: 'advertisement' }), null);
});

test('findCurrentIndex prefers URI and falls back to ID', () => {
  const items = [track('a'), track('b')];
  assert.equal(findCurrentIndex(items, { id: null, uri: items[1].uri }), 1);
  assert.equal(findCurrentIndex(items, { id: 'a', uri: null }), 0);
  assert.equal(findCurrentIndex(items, { id: 'missing', uri: null }), -1);
});

test('fallbackItems places current before the queue', () => {
  const current = track('current');
  const next = track('next');
  assert.deepEqual(fallbackItems(current, [next]), [current, next]);
  assert.deepEqual(fallbackItems(null, [next]), [next]);
});

test('fallback removes only a repeated first queue item', () => {
  const current = track('current');
  const laterRepeat = { ...current };
  assert.deepEqual(
    fallbackItems(current, [current, null, track('next'), laterRepeat]),
    [current, track('next'), laterRepeat],
  );
});
