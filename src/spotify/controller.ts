import { hostname } from 'node:os';

import type {
  ApiRequestOptions,
  ApiResponse,
} from './api.js';
import { apiRequest, SpotifyApiError } from './api.js';
import {
  fallbackItems,
  findCurrentIndex,
  normalizeItem,
  parseSpotifyUri,
} from './context.js';
import type {
  ContextState,
  DeviceSummary,
  NormalizedTrack,
  PlaylistSummary,
  SpotifyItemInput,
  ViewState,
} from './types.js';

type TokenProvider = () => Promise<string>;
type AuthorizationProvider = () => Promise<string>;
type ExternalUrlOpener = (url: string) => Promise<void>;
type ApiRequester = <T = unknown>(
  token: string,
  path: string,
  options?: ApiRequestOptions,
) => Promise<ApiResponse<T>>;

interface RawDevice {
  id?: unknown;
  is_active?: unknown;
  is_restricted?: unknown;
  name?: unknown;
  type?: unknown;
  volume_percent?: unknown;
}

interface RawPlaylist {
  collaborative?: unknown;
  items?: { total?: unknown };
  name?: unknown;
  owner?: { display_name?: unknown; id?: unknown };
  uri?: unknown;
}

interface RawPlayback {
  actions?: { disallows?: Record<string, unknown> } | null;
  context?: { uri?: unknown; type?: unknown } | null;
  currently_playing_type?: unknown;
  device?: RawDevice | null;
  is_playing?: unknown;
  item?: SpotifyItemInput | null;
  progress_ms?: unknown;
  repeat_state?: unknown;
  shuffle_state?: unknown;
}

interface ControllerDependencies {
  authorizationProvider?: AuthorizationProvider;
  localHostname?: string;
  now?: () => number;
  openExternal?: ExternalUrlOpener;
  request?: ApiRequester;
  tokenProvider: TokenProvider;
}

const PLAYLIST_CACHE_MS = 5 * 60 * 1000;

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeDevice(value: RawDevice): DeviceSummary {
  return {
    id: stringValue(value.id),
    isActive: value.is_active === true,
    isRestricted: value.is_restricted === true,
    name: stringValue(value.name) ?? 'Unknown device',
    type: stringValue(value.type) ?? 'Unknown',
    volumePercent: numberValue(value.volume_percent),
  };
}

export function chooseDevice(
  devices: readonly DeviceSummary[],
  localName = hostname(),
): DeviceSummary | null {
  const available = devices.filter(
    (device) => device.id !== null && !device.isRestricted,
  );
  const normalizedName = localName.split('.')[0].toLocaleLowerCase();
  return available.find((device) => device.isActive) ??
    available.find((device) => {
      return device.name.toLocaleLowerCase() === normalizedName;
    }) ??
    (available.length === 1 ? available[0] : null);
}

function normalizePlaylist(value: RawPlaylist): PlaylistSummary | null {
  const name = stringValue(value.name);
  const uri = stringValue(value.uri);
  if (!name || !uri) return null;
  return {
    collaborative: value.collaborative === true,
    itemCount: numberValue(value.items?.total),
    name,
    owner: stringValue(value.owner?.display_name) ??
      stringValue(value.owner?.id),
    uri,
  };
}

function normalizeTracks(values: unknown): NormalizedTrack[] {
  if (!Array.isArray(values)) return [];
  return values.map((value) => normalizeItem(value as SpotifyItemInput))
    .filter((item): item is NormalizedTrack => item !== null);
}

function errorStatus(error: unknown): number | null {
  if (error instanceof SpotifyApiError) return error.status;
  if (typeof error === 'object' && error !== null && 'status' in error) {
    return numberValue(error.status);
  }
  return null;
}

function isTransientError(error: unknown): boolean {
  if (error instanceof SpotifyApiError) {
    return error.status === 429 || error.status >= 500;
  }
  return error instanceof Error &&
    /network|fetch|offline|connection/i.test(error.message);
}

async function loadContext(
  token: string,
  contextUri: string | null,
  request: ApiRequester,
): Promise<ContextState> {
  const parsed = parseSpotifyUri(contextUri);
  if (!parsed || !contextUri) {
    return {
      accessible: false,
      items: [],
      reason: 'missing-or-invalid-context-uri',
      timings: [],
    };
  }

  if (parsed.type === 'playlist') {
    const metadataResponse = await request<Record<string, unknown>>(
      token,
      `/playlists/${parsed.id}`,
    );
    const metadata = metadataResponse.data ?? {};
    const name = stringValue(metadata.name);
    const rawItems = metadata.items;
    const declaredItemCount = typeof rawItems === 'object' &&
      rawItems !== null && 'total' in rawItems
      ? numberValue(rawItems.total)
      : null;
    try {
      const items: NormalizedTrack[] = [];
      const timings = [];
      let next: string | null = `/playlists/${parsed.id}/items?limit=50&` +
        'additional_types=track';
      while (next) {
        const response = await request<{
          items?: { item?: SpotifyItemInput | null }[];
          next?: unknown;
        }>(token, next);
        items.push(...normalizeTracks(
          response.data?.items?.map((entry) => entry.item),
        ));
        timings.push({ elapsedMs: response.elapsedMs, path: next });
        next = stringValue(response.data?.next);
      }
      return {
        accessible: true,
        items,
        metadata: {
          declaredItemCount,
          name,
          type: 'playlist',
          uri: contextUri,
        },
        reason: null,
        timings,
      };
    } catch (error) {
      if (isTransientError(error)) throw error;
      return {
        accessible: false,
        items: [],
        metadata: {
          declaredItemCount,
          name,
          type: 'playlist',
          uri: contextUri,
        },
        reason: `api-error:${errorStatus(error) ?? 'unknown'}`,
        timings: [],
      };
    }
  }

  if (parsed.type === 'album') {
    const metadataResponse = await request<Record<string, unknown>>(
      token,
      `/albums/${parsed.id}`,
    );
    const metadata = metadataResponse.data ?? {};
    const items: NormalizedTrack[] = [];
    const timings = [];
    let next: string | null = `/albums/${parsed.id}/tracks?limit=50`;
    while (next) {
      const response = await request<{
        items?: SpotifyItemInput[];
        next?: unknown;
      }>(token, next);
      items.push(...normalizeTracks(response.data?.items));
      timings.push({ elapsedMs: response.elapsedMs, path: next });
      next = stringValue(response.data?.next);
    }
    return {
      accessible: true,
      items,
      metadata: {
        declaredItemCount: numberValue(metadata.total_tracks),
        name: stringValue(metadata.name),
        type: 'album',
        uri: contextUri,
      },
      reason: null,
      timings,
    };
  }

  return {
    accessible: false,
    items: [],
    reason: `unsupported-context-type:${parsed.type}`,
    timings: [],
  };
}

export function createController({
  authorizationProvider,
  localHostname = hostname(),
  now = Date.now,
  openExternal,
  request = apiRequest,
  tokenProvider,
}: ControllerDependencies) {
  let contextCache: {
    uri: string | null;
    value: ContextState;
  } | null = null;
  let playlistCache: {
    items: PlaylistSummary[];
    loadedAt: number;
  } | null = null;
  let queueCache: {
    items: NormalizedTrack[];
    key: string;
  } | null = null;
  let lastUsableState: ViewState | null = null;

  async function authorize(): Promise<void> {
    if (!authorizationProvider) {
      throw new Error('Spotify authorization is unavailable.');
    }
    await authorizationProvider();
    lastUsableState = null;
  }

  async function openSpotifyUrl(url: string): Promise<void> {
    if (!openExternal) {
      throw new Error('Opening Spotify is unavailable.');
    }
    if (!/^https:\/\/open\.spotify\.com\/track\/[A-Za-z0-9]+$/.test(url)) {
      throw new Error('Invalid Spotify track URL.');
    }
    await openExternal(url);
  }

  function staleState(error: unknown): ViewState | null {
    const condition = error instanceof SpotifyApiError &&
      error.status === 429
      ? 'throttled' as const
      : 'offline' as const;
    return lastUsableState
      ? { ...lastUsableState, condition, stale: true }
      : null;
  }

  async function listPlaylists(): Promise<PlaylistSummary[]> {
    if (playlistCache &&
      now() - playlistCache.loadedAt < PLAYLIST_CACHE_MS) {
      return playlistCache.items;
    }
    const token = await tokenProvider();
    const items: PlaylistSummary[] = [];
    let next: string | null = '/me/playlists?limit=50';
    while (next) {
      const response = await request<{
        items?: RawPlaylist[];
        next?: unknown;
      }>(token, next);
      const page = response.data?.items ?? [];
      items.push(...page.map(normalizePlaylist).filter(
        (item): item is PlaylistSummary => item !== null,
      ));
      next = stringValue(response.data?.next);
    }
    playlistCache = { items, loadedAt: now() };
    return items;
  }

  async function listDevices(): Promise<DeviceSummary[]> {
    const token = await tokenProvider();
    const response = await request<{ devices?: RawDevice[] }>(
      token,
      '/me/player/devices',
    );
    return (response.data?.devices ?? []).map(normalizeDevice);
  }

  async function loadQueue(
    token: string,
    current: NormalizedTrack | null,
    key: string,
  ): Promise<NormalizedTrack[]> {
    if (queueCache?.key === key) return queueCache.items;
    const response = await request<{ queue?: SpotifyItemInput[] }>(
      token,
      '/me/player/queue',
    );
    const items = fallbackItems(
      current,
      normalizeTracks(response.data?.queue),
    );
    queueCache = { items, key };
    return items;
  }

  async function loadState(): Promise<ViewState> {
    const token = await tokenProvider();
    const response = await request<RawPlayback>(token,
      '/me/player?additional_types=track,episode');
    const playback = response.data;
    if (!playback) {
      contextCache = null;
      queueCache = null;
      return {
        canPlayRows: false,
        capturedAt: new Date(now()).toISOString(),
        condition: 'no-playback',
        context: { name: null, uri: null },
        items: [],
        list: { mode: 'current-plus-queue', reason: 'no-playback' },
        playback: null,
        stale: false,
      };
    }

    const contextUri = stringValue(playback.context?.uri);
    if (!contextCache || contextCache.uri !== contextUri) {
      contextCache = {
        uri: contextUri,
        value: await loadContext(token, contextUri, request),
      };
      queueCache = null;
    }
    const current = normalizeItem(playback.item);
    const context = contextCache.value;
    const mode = context.accessible
      ? 'context' as const
      : 'current-plus-queue' as const;
    const key = `${contextUri ?? 'none'}:${current?.uri ?? 'none'}`;
    const items = context.accessible
      ? context.items
      : await loadQueue(token, current, key);
    const repeat = playback.repeat_state;
    const disallows = playback.actions?.disallows ?? {};
    const playingType = stringValue(playback.currently_playing_type);
    const device = playback.device
      ? normalizeDevice(playback.device)
      : null;
    const condition = playingType === 'ad'
      ? 'advertisement' as const
      : !current
        ? 'unsupported-item' as const
        : !device
          ? 'no-device' as const
          : device.isRestricted
            ? 'restricted-device' as const
            : !context.accessible
              ? 'inaccessible-context' as const
              : 'ready' as const;
    return {
      canPlayRows: Boolean(contextUri),
      capturedAt: new Date(now()).toISOString(),
      condition,
      context: {
        name: context.metadata?.name ?? null,
        uri: contextUri,
      },
      items,
      list: { mode, reason: context.reason },
      playback: {
        actions: {
          pausing: disallows.pausing !== true,
          resuming: disallows.resuming !== true,
          seeking: disallows.seeking !== true,
          skippingNext: disallows.skipping_next !== true,
          skippingPrevious: disallows.skipping_prev !== true,
          togglingRepeat: disallows.toggling_repeat_context !== true &&
            disallows.toggling_repeat_track !== true,
          togglingShuffle: disallows.toggling_shuffle !== true,
        },
        current,
        currentIndex: findCurrentIndex(items, current),
        device,
        isPlaying: playback.is_playing === true,
        progressMs: numberValue(playback.progress_ms),
        repeat: repeat === 'context' || repeat === 'track'
          ? repeat
          : 'off',
        shuffle: playback.shuffle_state === true,
      },
      stale: false,
    };
  }

  async function getState(): Promise<ViewState> {
    try {
      const state = await loadState();
      lastUsableState = state;
      return state;
    } catch (error) {
      const cached = isTransientError(error) ? staleState(error) : null;
      if (cached) return cached;
      throw error;
    }
  }

  async function playRow(index: number) {
    if (!Number.isInteger(index) || index < 0) {
      throw new Error('Track row must be a non-negative integer.');
    }
    const view = await getState();
    if (!view.playback) throw new Error('No active Spotify playback.');
    if (!view.context.uri) {
      throw new Error('Current playback has no context URI.');
    }
    const item = view.items[index];
    if (!item?.uri) throw new Error(`No playable row ${index + 1}.`);
    const token = await tokenProvider();
    await request(token, '/me/player/play', {
      body: {
        context_uri: view.context.uri,
        offset: { uri: item.uri },
      },
      method: 'PUT',
    });
    queueCache = null;
    return { item };
  }

  async function togglePlayback() {
    const view = await getState();
    if (!view.playback) throw new Error('No active Spotify playback.');
    const action = view.playback.isPlaying ? 'pause' : 'play';
    await request(await tokenProvider(), `/me/player/${action}`, {
      method: 'PUT',
    });
    return { isPlaying: action === 'play' };
  }

  async function selectPlaylist(uri: string) {
    const available = await listPlaylists();
    const playlist = available.find((item) => item.uri === uri);
    if (!playlist) throw new Error('Playlist is not in the available list.');
    if (playlist.itemCount === 0) throw new Error('Playlist is empty.');
    const device = chooseDevice(await listDevices(), localHostname);
    if (!device?.id) {
      throw new Error(
        'No active or local Spotify Connect device could be selected.',
      );
    }
    const path = `/me/player/play?device_id=${encodeURIComponent(device.id)}`;
    await request(await tokenProvider(), path, {
      body: { context_uri: playlist.uri },
      method: 'PUT',
    });
    contextCache = null;
    queueCache = null;
    return { deviceName: device.name, playlist };
  }

  async function skip(direction: 'next' | 'previous'): Promise<void> {
    if (direction !== 'next' && direction !== 'previous') {
      throw new Error('Skip direction must be next or previous.');
    }
    await request(await tokenProvider(), `/me/player/${direction}`, {
      method: 'POST',
    });
    queueCache = null;
  }

  async function seek(positionMs: number): Promise<void> {
    if (!Number.isFinite(positionMs) || positionMs < 0) {
      throw new Error('Seek position must be a non-negative number.');
    }
    const view = await getState();
    const duration = view.playback?.current?.durationMs;
    if (duration === null || duration === undefined) {
      throw new Error('The current item cannot be seeked.');
    }
    const position = Math.round(Math.min(positionMs, duration));
    await request(
      await tokenProvider(),
      `/me/player/seek?position_ms=${position}`,
      { method: 'PUT' },
    );
  }

  async function setShuffle(enabled: boolean): Promise<void> {
    if (typeof enabled !== 'boolean') {
      throw new Error('Shuffle state must be a boolean.');
    }
    await request(
      await tokenProvider(),
      `/me/player/shuffle?state=${String(enabled)}`,
      { method: 'PUT' },
    );
  }

  async function setRepeat(
    mode: 'off' | 'context' | 'track',
  ): Promise<void> {
    if (mode !== 'off' && mode !== 'context' && mode !== 'track') {
      throw new Error('Invalid repeat mode.');
    }
    await request(
      await tokenProvider(),
      `/me/player/repeat?state=${mode}`,
      { method: 'PUT' },
    );
  }

  async function selectDevice(deviceId: string): Promise<void> {
    if (!deviceId.trim()) throw new Error('Device ID is required.');
    const devices = await listDevices();
    const device = devices.find((item) => item.id === deviceId);
    if (!device || device.isRestricted) {
      throw new Error('Device is unavailable.');
    }
    await request(await tokenProvider(), '/me/player', {
      body: { device_ids: [deviceId] },
      method: 'PUT',
    });
    contextCache = null;
    queueCache = null;
  }

  return {
    authorize,
    getState,
    listDevices,
    listPlaylists,
    openSpotifyUrl,
    playRow,
    seek,
    selectDevice,
    selectPlaylist,
    setRepeat,
    setShuffle,
    skip,
    togglePlayback,
  };
}

export type SpotifyController = ReturnType<typeof createController>;
