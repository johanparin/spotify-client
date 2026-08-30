import {
  fallbackItems,
  fetchContext,
  findCurrentIndex,
  normalizeItem,
} from '../001-context-survey/lib/context.mjs';
import { apiRequest } from '../001-context-survey/lib/spotify.mjs';

export function createController(tokenProvider, request = apiRequest) {
  let contextCache = null;
  let playlistCache = null;
  let queueCache = null;

  async function playlists() {
    const maxAgeMs = 5 * 60 * 1000;
    if (playlistCache && Date.now() - playlistCache.loadedAt < maxAgeMs) {
      return playlistCache.items;
    }

    const token = await tokenProvider();
    const items = [];
    let next = '/me/playlists?limit=50';
    while (next) {
      const response = await request(token, next);
      items.push(...response.data.items.filter(Boolean).map((playlist) => ({
        collaborative: playlist.collaborative,
        item_count: playlist.items?.total ?? null,
        name: playlist.name,
        owner: playlist.owner?.display_name || playlist.owner?.id || null,
        uri: playlist.uri,
      })));
      next = response.data.next;
    }

    playlistCache = { items, loadedAt: Date.now() };
    return items;
  }

  async function loadQueue(token, current, cacheKey) {
    if (queueCache?.key === cacheKey) return queueCache.items;

    const response = await request(token, '/me/player/queue');
    const queued = response.data.queue.map(normalizeItem);
    const items = fallbackItems(current, queued);
    queueCache = { key: cacheKey, items };
    return items;
  }

  async function state() {
    const token = await tokenProvider();
    const response = await request(
      token,
      '/me/player?additional_types=track,episode',
    );
    const playback = response.data;

    if (!playback) {
      contextCache = null;
      queueCache = null;
      return { playback: null, items: [] };
    }

    const contextUri = playback.context?.uri || null;
    if (contextCache?.uri !== contextUri) {
      contextCache = {
        uri: contextUri,
        value: await fetchContext(token, playback.context),
      };
      queueCache = null;
    }

    const current = normalizeItem(playback.item);
    const context = contextCache.value;
    let items;
    let mode;
    let reason = null;

    if (context.accessible) {
      items = context.items;
      mode = 'context';
    } else {
      const cacheKey = `${contextUri || 'none'}:${current?.uri || 'none'}`;
      items = await loadQueue(token, current, cacheKey);
      mode = 'current-plus-queue';
      reason = context.reason;
    }

    return {
      captured_at: new Date().toISOString(),
      context: {
        name: context.metadata?.name || null,
        uri: contextUri,
      },
      items,
      list: { mode, reason },
      playback: {
        current,
        current_index: findCurrentIndex(items, current),
        device_name: playback.device?.name || null,
        is_playing: playback.is_playing,
        repeat_state: playback.repeat_state,
        shuffle_state: playback.shuffle_state,
      },
      can_play_rows: Boolean(contextUri),
      timing_ms: response.elapsedMs,
    };
  }

  async function playRow(index) {
    const view = await state();
    if (!view.playback) throw new Error('No active Spotify playback.');
    if (!view.context.uri) {
      throw new Error('Current playback has no context URI.');
    }

    const item = view.items[index];
    if (!Number.isInteger(index) || !item?.uri) {
      throw new Error(`No playable row ${index + 1}.`);
    }

    const token = await tokenProvider();
    await request(token, '/me/player/play', {
      method: 'PUT',
      body: {
        context_uri: view.context.uri,
        offset: { uri: item.uri },
      },
    });
    queueCache = null;
    return { item };
  }

  async function togglePlayback() {
    const token = await tokenProvider();
    const response = await request(
      token,
      '/me/player?additional_types=track,episode',
    );
    if (!response.data) throw new Error('No active Spotify playback.');

    const action = response.data.is_playing ? 'pause' : 'play';
    await request(token, `/me/player/${action}`, { method: 'PUT' });
    return { is_playing: action === 'play' };
  }

  async function selectPlaylist(uri) {
    const available = await playlists();
    const playlist = available.find((candidate) => candidate.uri === uri);
    if (!playlist) throw new Error('Playlist is not in the available list.');
    if (playlist.item_count === 0) throw new Error('Playlist is empty.');

    const token = await tokenProvider();
    await request(token, '/me/player/play', {
      body: { context_uri: playlist.uri },
      method: 'PUT',
    });
    contextCache = null;
    queueCache = null;
    return { playlist };
  }

  return { playRow, playlists, selectPlaylist, state, togglePlayback };
}