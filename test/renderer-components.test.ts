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
    artwork: {
      height: 300,
      url: 'https://i.scdn.co/image/cover',
      width: 300,
    },
    artists: ['Artist'],
    discNumber: null,
    durationMs: 180_000,
    id: 'track',
    isLocal: false,
    isPlayable: true,
    name: 'Track',
    spotifyUrl: 'https://open.spotify.com/track/track',
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
    onOpen() {},
    onReveal() {},
    playback,
  }));
  assert.match(html, /id="now-title">Track/);
  assert.match(html, /id="now-artist">Artist/);
  assert.match(html, /aria-label="Reveal playing track"/);
  assert.match(html, /src="https:\/\/i\.scdn\.co\/image\/cover"/);
  assert.match(html, /aria-label="Open track in Spotify"/);
  assert.match(html, /alt="Spotify"/);
  assert.match(html, /spotify-logo-white\.svg/);
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
