import React from 'react';

import type { PlaybackState } from '../../spotify/types.js';

const SPOTIFY_LOGO = './assets/spotify-logo-white.svg';

export function NowPlaying({
  onOpen,
  onReveal,
  playback,
}: {
  onOpen(url: string): void;
  onReveal(): void;
  playback: PlaybackState | null;
}) {
  const current = playback?.current;
  if (!current || (playback?.currentIndex ?? -1) < 0) return null;
  const spotifyUrl = current.spotifyUrl;
  return (
    <section className="now-playing" aria-label="Now playing">
      {current.artwork && spotifyUrl ? (
        <button
          className="artwork-link"
          type="button"
          title="Open track in Spotify"
          aria-label="Open track in Spotify"
          onClick={() => onOpen(spotifyUrl)}
        >
          <img
            className="now-artwork"
            src={current.artwork.url}
            alt={`Cover artwork for ${current.name ?? 'current track'}`}
          />
        </button>
      ) : null}
      <button
        className="now-details"
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
      {spotifyUrl ? (
        <button
          className="spotify-link"
          type="button"
          title="Open track in Spotify"
          aria-label="Open track in Spotify"
          onClick={() => onOpen(spotifyUrl)}
        >
          <img src={SPOTIFY_LOGO} alt="Spotify" />
        </button>
      ) : null}
    </section>
  );
}
