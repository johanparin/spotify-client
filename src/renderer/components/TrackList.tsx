import React, { type RefObject } from 'react';

import type { ViewState } from '../../spotify/types.js';

function duration(milliseconds: number | null): string {
  if (milliseconds === null || !Number.isFinite(milliseconds)) return '';
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:` +
    String(seconds % 60).padStart(2, '0');
}

export function TrackList({
  listRef,
  onPlay,
  onSelect,
  selectedIndex,
  view,
}: {
  listRef: RefObject<HTMLOListElement | null>;
  onPlay(index: number): void;
  onSelect(index: number): void;
  selectedIndex: number;
  view: ViewState;
}) {
  return (
    <ol
      ref={listRef}
      id="tracks"
      tabIndex={0}
      aria-label="Tracks"
      role="listbox"
    >
      {view.items.map((item, index) => {
        const playing = index === view.playback?.currentIndex;
        const selected = index === selectedIndex;
        return (
          <li
            key={item.uri ?? item.id ?? index}
            className={[
              'track',
              selected ? 'selected' : '',
              playing ? 'playing' : '',
            ].filter(Boolean).join(' ')}
            role="option"
            aria-selected={selected}
            onClick={() => onSelect(index)}
            onDoubleClick={(event) => {
              event.preventDefault();
              onSelect(index);
              onPlay(index);
            }}
          >
            <span className="number">{playing ? '▶' : index + 1}</span>
            <span className="title">
              {item.name ?? 'Unknown track'}
              {item.artists.length > 0 && (
                <span className="artist">
                  {' — '}{item.artists.join(', ')}
                </span>
              )}
            </span>
            <span className="duration">{duration(item.durationMs)}</span>
          </li>
        );
      })}
    </ol>
  );
}
