import React from 'react';

import type { PlaybackState } from '../../spotify/types.js';

export function NowPlaying({
  onReveal,
  playback,
}: {
  onReveal(): void;
  playback: PlaybackState | null;
}) {
  const current = playback?.current;
  if (!current || (playback?.currentIndex ?? -1) < 0) return null;
  return (
    <button
      className="now-playing"
      type="button"
      title="Reveal playing track"
      aria-label="Reveal playing track"
      onClick={onReveal}
    >
      <span id="now-title">{current.name ?? 'Unknown track'}</span>
      <span id="now-artist">
        {current.artists.length
          ? current.artists.join(', ')
          : 'Unknown artist'}
      </span>
    </button>
  );
}
