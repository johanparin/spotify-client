import { allPages, apiRequest } from './spotify.mjs';

export function parseSpotifyUri(uri) {
  if (typeof uri !== 'string') return null;
  const parts = uri.split(':');
  if (parts.length !== 3 || parts[0] !== 'spotify') return null;
  return { type: parts[1], id: parts[2] };
}

export function normalizeItem(item) {
  if (!item) return null;
  return {
    uri: item.uri || null,
    id: item.id || null,
    type: item.type || null,
    name: item.name || null,
    artists: Array.isArray(item.artists)
      ? item.artists.map((artist) => artist.name)
      : [],
    duration_ms: item.duration_ms ?? null,
    disc_number: item.disc_number ?? null,
    track_number: item.track_number ?? null,
    is_local: item.is_local ?? false,
    is_playable: item.is_playable ?? null,
  };
}

export function findCurrentIndex(items, current) {
  if (!current) return -1;
  return items.findIndex((item) => {
    if (current.uri && item.uri === current.uri) return true;
    return current.id && item.id === current.id;
  });
}

export function fallbackItems(current, queueItems) {
  return current ? [current, ...queueItems] : queueItems;
}

export async function fetchContext(token, context) {
  const parsed = parseSpotifyUri(context?.uri);
  if (!parsed) {
    return {
      accessible: false,
      reason: 'missing-or-invalid-context-uri',
      items: [],
      timings: [],
    };
  }

  if (parsed.type === 'playlist') {
    const metadataResponse = await apiRequest(
      token,
      `/playlists/${parsed.id}`,
    );
    const playlist = metadataResponse.data;
    const metadata = {
      type: 'playlist',
      uri: context.uri,
      name: playlist.name || null,
      owner_id: playlist.owner?.id || null,
      owner_name: playlist.owner?.display_name || null,
      collaborative: playlist.collaborative ?? null,
      public: playlist.public ?? null,
      items_present: Boolean(playlist.items),
      declared_item_count: playlist.items?.total ?? null,
    };
    const path = `/playlists/${parsed.id}/items?limit=50&` +
      'additional_types=track';

    try {
      const pages = await allPages(
        token,
        path,
        (data) => data.items.map((entry) => entry.item).filter(Boolean),
      );
      return {
        accessible: true,
        reason: null,
        metadata,
        metadata_elapsed_ms: metadataResponse.elapsedMs,
        items: pages.items.map(normalizeItem),
        timings: pages.timings,
      };
    } catch (error) {
      return {
        accessible: false,
        reason: `api-error:${error.status || 'unknown'}`,
        error: error.message,
        metadata,
        metadata_elapsed_ms: metadataResponse.elapsedMs,
        items: [],
        timings: [],
      };
    }
  }

  if (parsed.type === 'album') {
    const metadataResponse = await apiRequest(token, `/albums/${parsed.id}`);
    const album = metadataResponse.data;
    const pages = await allPages(
      token,
      `/albums/${parsed.id}/tracks?limit=50`,
      (data) => data.items,
    );
    return {
      accessible: true,
      reason: null,
      metadata: {
        type: 'album',
        uri: context.uri,
        name: album.name || null,
        artists: album.artists?.map((artist) => artist.name) || [],
        album_type: album.album_type || null,
        declared_item_count: album.total_tracks ?? null,
      },
      metadata_elapsed_ms: metadataResponse.elapsedMs,
      items: pages.items.map(normalizeItem),
      timings: pages.timings,
    };
  }

  return {
    accessible: false,
    reason: `unsupported-context-type:${parsed.type}`,
    items: [],
    timings: [],
  };
}

export async function snapshot(token) {
  const playbackResponse = await apiRequest(
    token,
    '/me/player?additional_types=track,episode',
  );
  const playback = playbackResponse.data;

  if (!playback) {
    return {
      captured_at: new Date().toISOString(),
      playback: null,
      playback_elapsed_ms: playbackResponse.elapsedMs,
    };
  }

  let context;
  try {
    context = await fetchContext(token, playback.context);
  } catch (error) {
    context = {
      accessible: false,
      reason: `api-error:${error.status || 'unknown'}`,
      error: error.message,
      items: [],
      timings: [],
    };
  }

  let queue;
  let queueElapsedMs;
  try {
    const response = await apiRequest(token, '/me/player/queue');
    queue = {
      current: normalizeItem(response.data.currently_playing),
      items: response.data.queue.map(normalizeItem),
    };
    queueElapsedMs = response.elapsedMs;
  } catch (error) {
    queue = { error: error.message, current: null, items: [] };
    queueElapsedMs = null;
  }

  const current = normalizeItem(playback.item);
  const currentIndex = findCurrentIndex(context.items, current);

  return {
    captured_at: new Date().toISOString(),
    playback: {
      context: playback.context || null,
      current,
      current_index: currentIndex,
      currently_playing_type: playback.currently_playing_type,
      device: playback.device ? {
        id: playback.device.id,
        name: playback.device.name,
        type: playback.device.type,
        is_active: playback.device.is_active,
        is_restricted: playback.device.is_restricted,
      } : null,
      is_playing: playback.is_playing,
      progress_ms: playback.progress_ms,
      repeat_state: playback.repeat_state,
      shuffle_state: playback.shuffle_state,
      timestamp: playback.timestamp,
    },
    context: {
      ...context,
      item_count: context.items.length,
      current_mapped: currentIndex >= 0,
    },
    queue: {
      ...queue,
      item_count: queue.items.length,
      visible_item_count: fallbackItems(current, queue.items).length,
    },
    timings_ms: {
      playback: playbackResponse.elapsedMs,
      context_pages: context.timings,
      queue: queueElapsedMs,
    },
  };
}
