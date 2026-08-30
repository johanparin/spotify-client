import React, { useEffect, useMemo, useRef, useState } from 'react';

import type { PlaylistSummary } from '../../spotify/types.js';
import {
  filterByText,
  moveSelection,
  normalizeNavigationKey,
} from '../model.js';

export function PlaylistDialog({
  currentUri,
  loadPlaylists,
  onClose,
  onSelect,
  open,
  playlists,
}: {
  currentUri: string | null;
  loadPlaylists(): Promise<PlaylistSummary[]>;
  onClose(): void;
  onSelect(uri: string): Promise<void>;
  open: boolean;
  playlists: PlaylistSummary[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [help, setHelp] = useState('Type to filter · C-n/C-p or ↑/↓');
  const visible = useMemo(
    () => filterByText(playlists, query),
    [playlists, query],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!open) {
      if (dialog.open) dialog.close();
      return;
    }
    dialog.showModal();
    setQuery('');
    setHelp('Loading playlists…');
    void loadPlaylists().then((items) => {
      const current = items.findIndex((item) => item.uri === currentUri);
      setSelectedIndex(current >= 0 ? current : 0);
      setHelp('Type to filter · C-n/C-p or ↑/↓');
    }).catch((error: unknown) => {
      setHelp(error instanceof Error
        ? error.message
        : 'Could not load playlists.');
    });
  }, [currentUri, loadPlaylists, open]);

  async function choose(index: number) {
    const playlist = visible[index];
    if (!playlist) return;
    if (playlist.itemCount === 0) {
      setHelp('This playlist is empty.');
      return;
    }
    setHelp(`Opening ${playlist.name}…`);
    try {
      await onSelect(playlist.uri);
      onClose();
    } catch (error) {
      setHelp(error instanceof Error
        ? error.message
        : 'Could not open playlist.');
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onKeyDown={(event) => {
        event.stopPropagation();
        const key = normalizeNavigationKey(event);
        if (key === 'ArrowDown' || key === 'ArrowUp') {
          event.preventDefault();
          setSelectedIndex((index) => {
            return moveSelection(index, key, visible.length);
          });
        } else if (key === 'Enter') {
          event.preventDefault();
          void choose(selectedIndex);
        }
      }}
    >
      <form method="dialog" className="playlist-picker">
        <header>
          <h2>Playlists</h2>
          <button value="cancel" aria-label="Close">Esc</button>
        </header>
        <input
          id="playlist-search"
          autoFocus
          type="search"
          placeholder="Filter playlists"
          autoComplete="off"
          aria-label="Filter playlists"
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            setSelectedIndex(0);
          }}
        />
        <ol id="playlists" aria-label="Available playlists">
          {visible.map((playlist, index) => (
            <li
              key={playlist.uri}
              className={[
                'playlist',
                index === selectedIndex ? 'selected' : '',
                playlist.uri === currentUri ? 'current' : '',
                playlist.itemCount === 0 ? 'empty' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => {
                setSelectedIndex(index);
                void choose(index);
              }}
            >
              <span>{playlist.name}</span>
              <span className="playlist-owner">
                {playlist.owner ?? 'Unknown'} ·{' '}
                {playlist.itemCount ?? '?'} tracks
              </span>
            </li>
          ))}
        </ol>
        <p id="playlist-help" role="status">{help}</p>
      </form>
    </dialog>
  );
}
