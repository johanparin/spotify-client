import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  DeviceSummary,
  PlaybackState,
  PlaylistSummary,
  ViewState,
} from '../../spotify/types.js';
import {
  clampProgress,
  nextRepeatMode,
  optimisticTransition,
} from '../model.js';

export const INITIAL_VIEW: ViewState = {
  canPlayRows: false,
  capturedAt: '',
  context: { name: null, uri: null },
  items: [],
  list: { mode: 'current-plus-queue', reason: 'loading' },
  playback: null,
  stale: false,
};

type BeforeStateApply = (next: ViewState) => void;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Spotify action failed.';
}

export function useSpotifyController(beforeStateApply: BeforeStateApply) {
  const [view, setView] = useState(INITIAL_VIEW);
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [status, setStatus] = useState({
    message: 'Connecting',
    state: 'ok' as 'error' | 'ok',
  });
  const beforeApplyRef = useRef(beforeStateApply);
  const requestPending = useRef(false);
  const viewRef = useRef(view);
  beforeApplyRef.current = beforeStateApply;
  viewRef.current = view;

  const showError = useCallback((error: unknown) => {
    setStatus({ message: errorMessage(error), state: 'error' });
  }, []);

  const refresh = useCallback(async () => {
    if (requestPending.current) return;
    requestPending.current = true;
    try {
      const next = await window.spotifyController.getState();
      beforeApplyRef.current(next);
      viewRef.current = next;
      setView(next);
      setStatus({
        message: next.stale ? 'State may be stale' : 'Connected',
        state: 'ok',
      });
    } catch (error) {
      showError(error);
    } finally {
      requestPending.current = false;
    }
  }, [showError]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const runAction = useCallback(async (action: () => Promise<unknown>) => {
    try {
      await action();
      await refresh();
    } catch (error) {
      showError(error);
    }
  }, [refresh, showError]);

  const runOptimistic = useCallback(async (
    update: (playback: PlaybackState) => PlaybackState,
    action: () => Promise<unknown>,
  ) => {
    const current = viewRef.current;
    if (!current.playback) return;
    const transition = optimisticTransition(current.playback, update);
    const optimistic = { ...current, playback: transition.next };
    viewRef.current = optimistic;
    setView(optimistic);
    try {
      await action();
      await refresh();
    } catch (error) {
      const rollback = { ...current, playback: transition.rollback };
      viewRef.current = rollback;
      setView(rollback);
      showError(error);
    }
  }, [refresh, showError]);

  const loadDevices = useCallback(async () => {
    try {
      setDevices(await window.spotifyController.listDevices());
    } catch (error) {
      showError(error);
    }
  }, [showError]);

  const loadPlaylists = useCallback(async () => {
    try {
      const result = await window.spotifyController.listPlaylists();
      setPlaylists(result);
      return result;
    } catch (error) {
      showError(error);
      throw error;
    }
  }, [showError]);

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  const actions = {
    playRow: (index: number) => runAction(
      () => window.spotifyController.playRow(index),
    ),
    selectDevice: (deviceId: string) => runOptimistic(
      (playback) => ({
        ...playback,
        device: devices.find((item) => item.id === deviceId) ??
          playback.device,
      }),
      () => window.spotifyController.selectDevice(deviceId),
    ).then(loadDevices),
    selectPlaylist: async (uri: string) => {
      await window.spotifyController.selectPlaylist(uri);
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      await refresh();
    },
    seek: (positionMs: number) => {
      const duration = viewRef.current.playback?.current?.durationMs ?? null;
      const position = clampProgress(positionMs, duration);
      return runOptimistic(
        (playback) => ({ ...playback, progressMs: position }),
        () => window.spotifyController.seek(position),
      );
    },
    setRepeat: () => {
      const playback = viewRef.current.playback;
      if (!playback) return Promise.resolve();
      const mode = nextRepeatMode(playback.repeat);
      return runOptimistic(
        (value) => ({ ...value, repeat: mode }),
        () => window.spotifyController.setRepeat(mode),
      );
    },
    setShuffle: () => {
      const enabled = !viewRef.current.playback?.shuffle;
      return runOptimistic(
        (playback) => ({ ...playback, shuffle: enabled }),
        () => window.spotifyController.setShuffle(enabled),
      );
    },
    skip: (direction: 'next' | 'previous') => runAction(
      () => window.spotifyController.skip(direction),
    ),
    togglePlayback: () => runOptimistic(
      (playback) => ({ ...playback, isPlaying: !playback.isPlaying }),
      () => window.spotifyController.togglePlayback(),
    ),
  };

  return {
    actions,
    devices,
    loadDevices,
    loadPlaylists,
    playlists,
    showError,
    status,
    view,
  };
}
