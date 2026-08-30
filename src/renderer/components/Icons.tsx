import React from 'react';

export type IconName =
  'next' | 'pause' | 'play' | 'previous' | 'repeat' | 'shuffle';

export function Icon({ name }: { name: IconName }) {
  return (
    <svg aria-hidden="true">
      <use href={`#icon-${name}`} />
    </svg>
  );
}

export function IconDefinitions() {
  return (
    <svg className="icon-definitions" aria-hidden="true">
      <symbol id="icon-previous" viewBox="0 0 24 24">
        <path d="M5 4h3v16H5zM19 5v14L9 12z" />
      </symbol>
      <symbol id="icon-next" viewBox="0 0 24 24">
        <path d="M16 4h3v16h-3zM5 5v14l10-7z" />
      </symbol>
      <symbol id="icon-play" viewBox="0 0 24 24">
        <path d="M8 5l11 7-11 7z" />
      </symbol>
      <symbol id="icon-pause" viewBox="0 0 24 24">
        <path d="M7 5h4v14H7zM14 5h4v14h-4z" />
      </symbol>
      <symbol id="icon-shuffle" viewBox="0 0 24 24">
        <path
          d="M4 7h3c4 0 6 10 10 10h3M17 14l3 3-3 3M4 17h3c1.5 0 2.7-1.4 3.8-3M15 7h5M17 4l3 3-3 3"
        />
      </symbol>
      <symbol id="icon-repeat" viewBox="0 0 24 24">
        <path
          d="M17 5l3 3-3 3M20 8H8a4 4 0 0 0-4 4M7 19l-3-3 3-3M4 16h12a4 4 0 0 0 4-4"
        />
      </symbol>
    </svg>
  );
}
