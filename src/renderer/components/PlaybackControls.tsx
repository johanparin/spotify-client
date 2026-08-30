import React from 'react';

import type { PlaybackState } from '../../spotify/types.js';
import { Icon } from './Icons.js';

export function PlaybackControls({
  onRepeat,
  onShuffle,
  onSkip,
  onToggle,
  playback,
}: {
  onRepeat(): void;
  onShuffle(): void;
  onSkip(direction: 'next' | 'previous'): void;
  onToggle(): void;
  playback: PlaybackState | null;
}) {
  const toggleAllowed = playback && (playback.isPlaying
    ? playback.actions.pausing
    : playback.actions.resuming);
  const toggleLabel = playback?.isPlaying ? 'Pause' : 'Play';
  return (
    <div className="playback-controls" aria-label="Playback controls">
      <button
        className={`icon-button${playback?.shuffle ? ' active' : ''}`}
        type="button"
        title={`Shuffle ${playback?.shuffle ? 'on' : 'off'}`}
        aria-label="Shuffle"
        aria-pressed={playback?.shuffle === true}
        disabled={!playback?.actions.togglingShuffle}
        onClick={onShuffle}
      ><Icon name="shuffle" /></button>
      <button
        id="previous"
        className="icon-button"
        type="button"
        title="Previous track ([)"
        aria-label="Previous track"
        disabled={!playback?.actions.skippingPrevious}
        onClick={() => onSkip('previous')}
      ><Icon name="previous" /></button>
      <button
        className="play-button"
        type="button"
        title={toggleLabel}
        aria-label={toggleLabel}
        disabled={!toggleAllowed}
        onClick={onToggle}
      ><Icon name={playback?.isPlaying ? 'pause' : 'play'} /></button>
      <button
        id="next"
        className="icon-button"
        type="button"
        title="Next track (])"
        aria-label="Next track"
        disabled={!playback?.actions.skippingNext}
        onClick={() => onSkip('next')}
      ><Icon name="next" /></button>
      <button
        className={`icon-button${
          playback && playback.repeat !== 'off' ? ' active' : ''
        }`}
        type="button"
        title={`Repeat ${playback?.repeat ?? 'off'}`}
        aria-label="Repeat"
        aria-pressed={Boolean(playback && playback.repeat !== 'off')}
        disabled={!playback?.actions.togglingRepeat}
        onClick={onRepeat}
      ><Icon name="repeat" /></button>
    </div>
  );
}
