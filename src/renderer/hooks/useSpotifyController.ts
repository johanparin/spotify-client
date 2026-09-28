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
import { PollScheduler } from '../polling.js';

export const INITIAL_VIEW: ViewState = {
  canPlayRows: false,
  capturedAt: '',
  condition: 'no-playback',
  context: { name: null, uri: null },
  items: [],
  list: { mode: 'current-plus-queue', reason: 'loading' },
  playback: null,
  stale: false,
};

type BeforeStateApply = (next: ViewState) => void;

type StatusState = 'error' | 'ok' | 'throttled';

function retryDescription(retryAt?: string): string {
  if (!retryAt) return '';
  const date = new Date(retryAt);
  if (!Number.isFinite(date.getTime())) return '';
  return ` · retry after ${date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export function stateStatus(view: ViewState): {
  message: string;
  state: StatusState;
} {
  if (view.condition === 'quota-exceeded') {
    return {
      message: `Spotify quota reached${retryDescription(view.retryAt)}`,
      state: 'throttled',
    };
  }
  if (view.condition === 'throttled') {
    return {
      message: `Spotify rate limit${retryDescription(view.retryAt)}`,
      state: 'throttled',
    };
  }
  if (view.stale) {
    return { message: 'Offline · showing saved state', state: 'error' };
  }
  const messages = {
    advertisement: 'Advertisement',
    'authorization-required': 'Spotify authorization is required',
    'inaccessible-context': 'Context unavailable · showing queue',
    'no-device': 'No playback device',
    'no-playback': 'No active playback',
    offline: 'Offline · showing saved state',
    'quota-exceeded': 'Spotify quota reached',
    ready: 'Connected',
    'restricted-device': 'Restricted playback device',
    throttled: 'Spotify is catching up',
    'unsupported-item': 'Unsupported Spotify item',
  } as const;
  return { message: messages[view.condition], state: 'ok' };
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : 'Spotify action failed.';
  return /429|rate limit/i.test(message)
    ? 'Spotify is temporarily rate limiting requests.'
    : message;
}

export function nextPollDelay(view: ViewState, now = Date.now()): number {
  if ((view.condition === 'quota-exceeded' ||
    view.condition === 'throttled') && view.retryAt) {
    return Math.max(1_000, Date.parse(view.retryAt) - now);
  }
  return view.playback?.isPlaying ? 5_000 : 15_000;
}

export function useSpotifyController(beforeStateApply: BeforeStateApply) {
  const [view, setView] = useState(INITIAL_VIEW);
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [status, setStatus] = useState({
    message: 'Connecting',
    state: 'ok' as StatusState,
  });
  const beforeApplyRef = useRef(beforeStateApply);
  const schedulerRef = useRef<PollScheduler<ViewState> | null>(null);
  const viewRef = useRef(view);
  beforeApplyRef.current = beforeStateApply;
  viewRef.current = view;

  const showError = useCallback((error: unknown) => {
    const message = errorMessage(error);
    const throttled = /429|rate limit/i.test(message);
    setStatus({
      message: throttled ? 'Spotify is catching up' : message,
      state: throttled ? 'throttled' : 'error',
    });
  }, []);

  if (schedulerRef.current === null) {
    schedulerRef.current = new PollScheduler({
      clearTimer: (timer) => window.clearTimeout(timer),
      isVisible: () => document.visibilityState === 'visible',
      hiddenDelayMs: 60_000,
      nextDelayMs: (next) => nextPollDelay(next),
      onError: showError,
      onResult: (next) => {
        beforeApplyRef.current(next);
        viewRef.current = next;
        setView(next);
        setStatus(stateStatus(next));
        if (next.condition === 'authorization-required') {
          schedulerRef.current?.stop();
        }
      },
      poll: () => window.spotifyController.getState(),
      setTimer: (callback, delay) => window.setTimeout(callback, delay),
    });
  }

  useEffect(() => {
    const scheduler = schedulerRef.current;
    const visibilityChanged = () => scheduler?.visibilityChanged();
    scheduler?.start();
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      document.removeEventListener('visibilitychange', visibilityChanged);
      scheduler?.stop();
    };
  }, []);

  const runAction = useCallback(async (action: () => Promise<unknown>) => {
    schedulerRef.current?.invalidate();
    try {
      await action();
      schedulerRef.current?.refreshNow();
    } catch (error) {
      showError(error);
    }
  }, [showError]);

  const runOptimistic = useCallback(async (
    update: (playback: PlaybackState) => PlaybackState,
    action: () => Promise<unknown>,
  ) => {
    const current = viewRef.current;
    if (!current.playback) return;
    schedulerRef.current?.invalidate();
    const transition = optimisticTransition(current.playback, update);
    const optimistic = { ...current, playback: transition.next };
    viewRef.current = optimistic;
    setView(optimistic);
    try {
      await action();
      schedulerRef.current?.refreshNow();
    } catch (error) {
      const rollback = { ...current, playback: transition.rollback };
      viewRef.current = rollback;
      setView(rollback);
      showError(error);
    }
  }, [showError]);

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
    authorize: async () => {
      schedulerRef.current?.invalidate();
      try {
        await window.spotifyController.authorize();
        schedulerRef.current?.start();
        schedulerRef.current?.refreshNow();
        await loadDevices();
      } catch (error) {
        showError(error);
      }
    },
    playRow: (index: number) => runAction(
      () => window.spotifyController.playRow(index),
    ),
    openSpotifyUrl: async (url: string) => {
      try {
        await window.spotifyController.openSpotifyUrl(url);
      } catch (error) {
        showError(error);
      }
    },
    selectDevice: (deviceId: string) => runOptimistic(
      (playback) => ({
        ...playback,
        device: devices.find((item) => item.id === deviceId) ??
          playback.device,
      }),
      () => window.spotifyController.selectDevice(deviceId),
    ).then(loadDevices),
    selectPlaylist: async (uri: string) => {
      const current = viewRef.current;
      if (current.condition === 'quota-exceeded' ||
        current.condition === 'throttled') {
        throw new Error(stateStatus(current).message);
      }
      schedulerRef.current?.invalidate();
      try {
        await window.spotifyController.selectPlaylist(uri);
        await new Promise((resolve) => window.setTimeout(resolve, 350));
        schedulerRef.current?.refreshNow();
      } catch (error) {
        showError(error);
        schedulerRef.current?.refreshNow();
        throw new Error(errorMessage(error));
      }
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
