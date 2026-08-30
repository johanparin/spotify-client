import assert from 'node:assert/strict';
import test from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { NowPlaying } from '../src/renderer/components/NowPlaying.js';
import {
  PlaybackControls,
} from '../src/renderer/components/PlaybackControls.js';
import type { PlaybackState } from '../src/spotify/types.js';

const playback: PlaybackState = {
  actions: {
    pausing: true,
    resuming: true,
    seeking: true,
    skippingNext: true,
    skippingPrevious: true,
    togglingRepeat: true,
    togglingShuffle: true,
  },
  current: {
    artists: ['Artist'],
    discNumber: null,
    durationMs: 180_000,
    id: 'track',
    isLocal: false,
    isPlayable: true,
    name: 'Track',
    trackNumber: null,
    type: 'track',
    uri: 'spotify:track:track',
  },
  currentIndex: 0,
  device: null,
  isPlaying: true,
  progressMs: 10_000,
  repeat: 'off',
  shuffle: false,
};

test('now-playing renders track and artist on separate rows', () => {
  const html = renderToStaticMarkup(createElement(NowPlaying, {
    onReveal() {},
    playback,
  }));
  assert.match(html, /id="now-title">Track/);
  assert.match(html, /id="now-artist">Artist/);
  assert.match(html, /aria-label="Reveal playing track"/);
});

test('playback controls use icon labels without shortcut text', () => {
  const html = renderToStaticMarkup(createElement(PlaybackControls, {
    onRepeat() {},
    onShuffle() {},
    onSkip() {},
    onToggle() {},
    playback,
  }));
  assert.match(html, /aria-label="Pause"/);
  assert.match(html, /aria-label="Previous track"/);
  assert.match(html, /aria-label="Next track"/);
  assert.doesNotMatch(html, /Space ·|>Shuffle off<|>Repeat off</);
});
