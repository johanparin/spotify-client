import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clampProgress,
  filterByText,
  moveSelection,
  nextRepeatMode,
  normalizeNavigationKey,
  optimisticTransition,
  reconcileSelection,
  shouldAutoReveal,
} from '../src/renderer/model.js';
import {
  nextPollDelay,
  stateStatus,
} from '../src/renderer/hooks/useSpotifyController.js';
import type { ViewState } from '../src/spotify/types.js';

test('selection moves within list boundaries', () => {
  assert.equal(moveSelection(0, 'ArrowUp', 3), 0);
  assert.equal(moveSelection(0, 'ArrowDown', 3), 1);
  assert.equal(moveSelection(1, 'End', 3), 2);
  assert.equal(moveSelection(2, 'Home', 3), 0);
  assert.equal(moveSelection(0, 2, 3), 2);
  assert.equal(moveSelection(-1, 'ArrowDown', 3), 1);
});

test('empty lists have no selection', () => {
  assert.equal(moveSelection(0, 'ArrowDown', 0), -1);
  assert.equal(reconcileSelection([], null, 0), -1);
});

test('C-n and C-p require Control without Alt or Meta', () => {
  const base = { altKey: false, ctrlKey: true, metaKey: false };
  assert.equal(normalizeNavigationKey({ ...base, key: 'n' }), 'ArrowDown');
  assert.equal(normalizeNavigationKey({ ...base, key: 'P' }), 'ArrowUp');
  assert.equal(
    normalizeNavigationKey({ ...base, altKey: true, key: 'n' }),
    'n',
  );
  assert.equal(
    normalizeNavigationKey({ ...base, metaKey: true, key: 'p' }),
    'p',
  );
  assert.equal(normalizeNavigationKey({ ...base, key: 'x' }), 'x');
});

test('selection follows its URI across refreshed rows', () => {
  const items = [{ uri: 'second' }, { uri: 'first' }];
  assert.equal(reconcileSelection(items, 'first', 0), 1);
});

test('selection initializes and clamps when a track disappears', () => {
  assert.equal(reconcileSelection([{ uri: 'only' }], null, -1), 0);
  assert.equal(reconcileSelection([{ uri: 'only' }], 'gone', 4), 0);
});

test('playlist filtering matches names and owners locally', () => {
  const playlists = [
    { name: 'Morning Music', owner: 'Johan', uri: 'morning' },
    { name: 'Evening', owner: 'Friend', uri: 'evening' },
  ];
  assert.deepEqual(
    filterByText(playlists, '  jOhAn '),
    [playlists[0]],
  );
  assert.deepEqual(filterByText(playlists, 'even'), [playlists[1]]);
  assert.deepEqual(filterByText(playlists, ''), playlists);
});

test('playing row follows only when old playback was visible', () => {
  assert.equal(shouldAutoReveal({
    nextPlayingUri: 'new',
    previousPlayingUri: 'old',
    previousPlayingVisible: false,
  }), false);
  assert.equal(shouldAutoReveal({
    nextPlayingUri: 'new',
    previousPlayingUri: 'old',
    previousPlayingVisible: true,
  }), true);
  assert.equal(shouldAutoReveal({
    nextPlayingUri: 'new',
    previousPlayingUri: null,
    previousPlayingVisible: false,
  }), true);
});

test('unchanged or absent playback never reveals automatically', () => {
  assert.equal(shouldAutoReveal({
    nextPlayingUri: 'same',
    previousPlayingUri: 'same',
    previousPlayingVisible: true,
  }), false);
  assert.equal(shouldAutoReveal({
    nextPlayingUri: null,
    previousPlayingUri: 'old',
    previousPlayingVisible: true,
  }), false);
});

test('repeat cycles through off, context, track, and off', () => {
  assert.equal(nextRepeatMode('off'), 'context');
  assert.equal(nextRepeatMode('context'), 'track');
  assert.equal(nextRepeatMode('track'), 'off');
});

test('progress clamps to valid track positions', () => {
  assert.equal(clampProgress(500, 1000), 500);
  assert.equal(clampProgress(2000, 1000), 1000);
  assert.equal(clampProgress(-1, 1000), 0);
  assert.equal(clampProgress(Number.NaN, 1000), 0);
  assert.equal(clampProgress(500, null), 500);
});

test('optimistic transitions retain an exact rollback value', () => {
  const current = { repeat: 'off', shuffle: false };
  const transition = optimisticTransition(current, (value) => ({
    ...value,
    shuffle: true,
  }));
  assert.deepEqual(transition.next, { repeat: 'off', shuffle: true });
  assert.equal(transition.rollback, current);
});

test('quota state waits for Retry-After and explains recovery', () => {
  const retryAt = '2026-09-12T10:00:00.000Z';
  const view: ViewState = {
    canPlayRows: false,
    capturedAt: '2026-09-12T09:00:00.000Z',
    condition: 'quota-exceeded',
    context: { name: null, uri: null },
    items: [],
    list: { mode: 'current-plus-queue', reason: 'quota-exceeded' },
    playback: null,
    retryAt,
    stale: true,
  };
  assert.equal(
    nextPollDelay(view, Date.parse('2026-09-12T09:00:00.000Z')),
    3_600_000,
  );
  assert.match(stateStatus(view).message, /Spotify quota reached/);
  assert.match(stateStatus(view).message, /retry after/);
});
