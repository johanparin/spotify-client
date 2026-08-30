import type {
  NormalizedTrack,
  SpotifyArtistInput,
  SpotifyItemInput,
  SpotifyUri,
} from './types.js';

export function parseSpotifyUri(value: unknown): SpotifyUri | null {
  if (typeof value !== 'string') return null;
  const parts = value.split(':');
  if (
    parts.length !== 3 ||
    parts[0] !== 'spotify' ||
    !parts[1] ||
    !parts[2]
  ) {
    return null;
  }
  return { id: parts[2], type: parts[1] };
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function normalizeItem(
  value: SpotifyItemInput | null | undefined,
): NormalizedTrack | null {
  if (!value || value.type !== 'track') return null;
  const artists = Array.isArray(value.artists)
    ? value.artists
      .map((artist: SpotifyArtistInput) => nullableString(artist?.name))
      .filter((name): name is string => name !== null)
    : [];

  return {
    artists,
    discNumber: nullableNumber(value.disc_number),
    durationMs: nullableNumber(value.duration_ms),
    id: nullableString(value.id),
    isLocal: value.is_local === true,
    isPlayable: typeof value.is_playable === 'boolean'
      ? value.is_playable
      : null,
    name: nullableString(value.name),
    trackNumber: nullableNumber(value.track_number),
    type: 'track',
    uri: nullableString(value.uri),
  };
}

type TrackIdentity = Pick<NormalizedTrack, 'id' | 'uri'>;

function sameTrack(left: TrackIdentity, right: TrackIdentity): boolean {
  if (left.uri && right.uri) return left.uri === right.uri;
  return Boolean(left.id && right.id && left.id === right.id);
}

export function findCurrentIndex(
  items: readonly TrackIdentity[],
  current: TrackIdentity | null | undefined,
): number {
  if (!current) return -1;
  return items.findIndex((item) => sameTrack(item, current));
}

/**
 * Builds the honest fallback window. Spotify sometimes repeats the current
 * item as the first queue entry, so that one adjacent duplicate is removed.
 */
export function fallbackItems(
  current: NormalizedTrack | null,
  queueItems: readonly (NormalizedTrack | null | undefined)[],
): NormalizedTrack[] {
  const queue = queueItems.filter(
    (item): item is NormalizedTrack => item !== null && item !== undefined,
  );
  if (!current) return queue;
  const first = queue[0];
  return [current, ...(first && sameTrack(first, current)
    ? queue.slice(1)
    : queue)];
}
