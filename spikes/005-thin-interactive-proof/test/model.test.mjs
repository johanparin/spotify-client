import assert from 'node:assert/strict';
import test from 'node:test';

import {
  moveSelection,
  normalizeNavigationKey,
  reconcileSelection,
  shouldAutoReveal,
} from '../public/model.mjs';

test('selection moves within list boundaries', () => {
  assert.equal(moveSelection(0, 'ArrowUp', 3), 0);
  assert.equal(moveSelection(0, 'ArrowDown', 3), 1);
  assert.equal(moveSelection(1, 'End', 3), 2);
  assert.equal(moveSelection(2, 'Home', 3), 0);
  assert.equal(moveSelection(0, 2, 3), 2);
});

test('C-n and C-p map to Emacs-style vertical movement', () => {
  assert.equal(normalizeNavigationKey({
    altKey: false,
    ctrlKey: true,
    key: 'n',
    metaKey: false,
  }), 'ArrowDown');
  assert.equal(normalizeNavigationKey({
    altKey: false,
    ctrlKey: true,
    key: 'p',
    metaKey: false,
  }), 'ArrowUp');
});

test('selection follows its URI across refreshed rows', () => {
  const items = [{ uri: 'second' }, { uri: 'first' }];
  assert.equal(reconcileSelection(items, 'first', 0), 1);
});

test('selection clamps when its track disappears', () => {
  assert.equal(reconcileSelection([{ uri: 'only' }], 'gone', 4), 0);
  assert.equal(reconcileSelection([], 'gone', 4), -1);
});

test('playing-row reveal follows only when old playback was visible', () => {
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
});

test('unchanged playback never triggers automatic reveal', () => {
  assert.equal(shouldAutoReveal({
    nextPlayingUri: 'same',
    previousPlayingUri: 'same',
    previousPlayingVisible: true,
  }), false);
});