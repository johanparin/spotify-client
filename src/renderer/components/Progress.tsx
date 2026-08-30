import React, { useEffect, useState } from 'react';

import type { PlaybackState } from '../../spotify/types.js';
import { clampProgress } from '../model.js';

function duration(milliseconds: number | null): string {
  if (milliseconds === null || !Number.isFinite(milliseconds)) return '0:00';
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:` +
    String(seconds % 60).padStart(2, '0');
}

export function Progress({
  onSeek,
  playback,
}: {
  onSeek(positionMs: number): void;
  playback: PlaybackState | null;
}) {
  const durationMs = playback?.current?.durationMs ?? null;
  const remotePosition = clampProgress(playback?.progressMs ?? 0, durationMs);
  const [position, setPosition] = useState(remotePosition);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) setPosition(remotePosition);
  }, [dragging, remotePosition]);

  const percentage = durationMs && durationMs > 0
    ? position / durationMs * 100
    : 0;
  return (
    <div className="progress">
      <span>{duration(position)}</span>
      <input
        id="seek"
        type="range"
        min="0"
        max={durationMs ?? 0}
        value={position}
        step="1000"
        aria-label="Playback position"
        disabled={!playback?.actions.seeking || durationMs === null}
        style={{ '--seek-progress': `${percentage}%` } as React.CSSProperties}
        onPointerDown={() => setDragging(true)}
        onChange={(event) => {
          setPosition(Number(event.currentTarget.value));
        }}
        onPointerUp={(event) => {
          setDragging(false);
          onSeek(Number(event.currentTarget.value));
        }}
        onKeyUp={(event) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
            onSeek(Number(event.currentTarget.value));
          }
        }}
      />
      <span>{duration(durationMs)}</span>
    </div>
  );
}
