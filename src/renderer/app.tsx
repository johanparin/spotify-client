import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';

import type { ViewState } from '../spotify/types.js';
import { Header } from './components/Header.js';
import { IconDefinitions } from './components/Icons.js';
import { NowPlaying } from './components/NowPlaying.js';
import { PlaybackControls } from './components/PlaybackControls.js';
import { PlaylistDialog } from './components/PlaylistDialog.js';
import { Progress } from './components/Progress.js';
import { TrackList } from './components/TrackList.js';
import {
  INITIAL_VIEW,
  useSpotifyController,
} from './hooks/useSpotifyController.js';
import {
  moveSelection,
  normalizeNavigationKey,
  reconcileSelection,
  shouldAutoReveal,
} from './model.js';

function App() {
  const tracksRef = useRef<HTMLOListElement>(null);
  const latestView = useRef<ViewState>(INITIAL_VIEW);
  const selectedIndexRef = useRef(-1);
  const previousPlayingUri = useRef<string | null>(null);
  const revealAfterRender = useRef(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [playlistOpen, setPlaylistOpen] = useState(false);

  function rowVisible(index: number): boolean {
    const tracks = tracksRef.current;
    const row = tracks?.children.item(index) as HTMLElement | null;
    if (!tracks || !row) return true;
    return row.offsetTop >= tracks.scrollTop &&
      row.offsetTop + row.offsetHeight <=
        tracks.scrollTop + tracks.clientHeight;
  }

  const beforeStateApply = useCallback((next: ViewState) => {
    const current = latestView.current;
    const oldSelectedUri = current.items[
      selectedIndexRef.current
    ]?.uri ?? null;
    const oldPlayingIndex = current.playback?.currentIndex ?? -1;
    const nextPlayingUri = next.playback?.current?.uri ?? null;
    revealAfterRender.current = shouldAutoReveal({
      nextPlayingUri,
      previousPlayingUri: previousPlayingUri.current,
      previousPlayingVisible: rowVisible(oldPlayingIndex),
    });
    previousPlayingUri.current = nextPlayingUri;
    const nextSelection = reconcileSelection(
      next.items,
      oldSelectedUri,
      selectedIndexRef.current < 0
        ? next.playback?.currentIndex ?? 0
        : selectedIndexRef.current,
    );
    selectedIndexRef.current = nextSelection;
    setSelectedIndex(nextSelection);
  }, []);

  const spotify = useSpotifyController(beforeStateApply);
  latestView.current = spotify.view;

  const revealPlaying = useCallback(() => {
    const index = latestView.current.playback?.currentIndex ?? -1;
    tracksRef.current?.children.item(index)?.scrollIntoView({
      block: 'nearest',
    });
  }, []);

  useLayoutEffect(() => {
    if (!revealAfterRender.current) return;
    revealAfterRender.current = false;
    revealPlaying();
  }, [revealPlaying, spotify.view]);

  const select = useCallback((indexOrKey: number | string) => {
    const next = moveSelection(
      selectedIndexRef.current,
      indexOrKey,
      latestView.current.items.length,
    );
    selectedIndexRef.current = next;
    setSelectedIndex(next);
    tracksRef.current?.children.item(next)?.scrollIntoView({
      block: 'nearest',
    });
  }, []);

  const play = useCallback((index: number) => {
    if (!latestView.current.canPlayRows || index < 0) return;
    void spotify.actions.playRow(index);
  }, [spotify.actions]);

  useEffect(() => {
    tracksRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const key = normalizeNavigationKey(event);
      if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) {
        event.preventDefault();
        select(key);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        play(selectedIndexRef.current);
      } else if (event.key === ' ') {
        event.preventDefault();
        void spotify.actions.togglePlayback();
      } else if (event.key === '[') {
        event.preventDefault();
        void spotify.actions.skip('previous');
      } else if (event.key === ']') {
        event.preventDefault();
        void spotify.actions.skip('next');
      } else if (event.key.toLocaleLowerCase() === 'f') {
        revealPlaying();
      } else if (event.key.toLocaleLowerCase() === 'p' &&
        !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        setPlaylistOpen(true);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [play, revealPlaying, select, spotify.actions]);

  const listText = !spotify.view.playback
    ? 'No playback'
    : spotify.view.list.mode === 'context'
      ? `${spotify.view.items.length} tracks`
      : `${spotify.view.items.length} tracks · Current + Queue · ` +
        (spotify.view.list.reason ?? 'fallback');

  return (
    <>
      <IconDefinitions />
      <main className="player" aria-label="Trackside music controller">
        <Header
          devices={spotify.devices}
          loadDevices={spotify.loadDevices}
          onAuthorize={() => void spotify.actions.authorize()}
          onChoosePlaylist={() => setPlaylistOpen(true)}
          onSelectDevice={(id) => void spotify.actions.selectDevice(id)}
          status={spotify.status}
          view={spotify.view}
        />
        <NowPlaying
          playback={spotify.view.playback}
          onReveal={revealPlaying}
        />
        <PlaybackControls
          playback={spotify.view.playback}
          onRepeat={() => void spotify.actions.setRepeat()}
          onShuffle={() => void spotify.actions.setShuffle()}
          onSkip={(direction) => void spotify.actions.skip(direction)}
          onToggle={() => void spotify.actions.togglePlayback()}
        />
        <Progress
          playback={spotify.view.playback}
          onSeek={(position) => void spotify.actions.seek(position)}
        />
        <div className="list-status">{listText}</div>
        <TrackList
          listRef={tracksRef}
          onPlay={play}
          onSelect={select}
          selectedIndex={selectedIndex}
          view={spotify.view}
        />
      </main>
      <PlaylistDialog
        currentUri={spotify.view.context.uri}
        loadPlaylists={spotify.loadPlaylists}
        onClose={() => setPlaylistOpen(false)}
        onSelect={spotify.actions.selectPlaylist}
        open={playlistOpen}
        playlists={spotify.playlists}
      />
    </>
  );
}

const root = document.querySelector('#root');
if (!root) throw new Error('Missing React root element.');
createRoot(root).render(<App />);
