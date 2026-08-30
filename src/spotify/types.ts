export interface SpotifyUri {
  id: string;
  type: string;
}

export interface SpotifyArtistInput {
  name?: unknown;
}

export interface SpotifyItemInput {
  album?: unknown;
  artists?: unknown;
  disc_number?: unknown;
  duration_ms?: unknown;
  id?: unknown;
  is_local?: unknown;
  is_playable?: unknown;
  name?: unknown;
  track_number?: unknown;
  type?: unknown;
  uri?: unknown;
}

export interface ArtworkImage {
  height: number | null;
  url: string;
  width: number | null;
}

export interface NormalizedTrack {
  artwork: ArtworkImage | null;
  artists: string[];
  discNumber: number | null;
  durationMs: number | null;
  id: string | null;
  isLocal: boolean;
  isPlayable: boolean | null;
  name: string | null;
  spotifyUrl: string | null;
  trackNumber: number | null;
  type: 'track';
  uri: string | null;
}

export interface PlaybackContext {
  type: string | null;
  uri: string | null;
}

export interface ContextMetadata {
  declaredItemCount: number | null;
  name: string | null;
  type: 'album' | 'playlist';
  uri: string;
}

export interface ContextState {
  accessible: boolean;
  items: NormalizedTrack[];
  metadata?: ContextMetadata;
  reason: string | null;
  timings: ApiTiming[];
}

export interface QueueState {
  current: NormalizedTrack | null;
  items: NormalizedTrack[];
}

export interface PlaylistSummary {
  collaborative: boolean;
  itemCount: number | null;
  name: string;
  owner: string | null;
  uri: string;
}

export interface DeviceSummary {
  id: string | null;
  isActive: boolean;
  isRestricted: boolean;
  name: string;
  type: string;
  volumePercent: number | null;
}

export interface ApiTiming {
  elapsedMs: number;
  path: string;
}

export interface PlaybackState {
  actions: PlaybackActions;
  current: NormalizedTrack | null;
  currentIndex: number;
  device: DeviceSummary | null;
  isPlaying: boolean;
  progressMs: number | null;
  repeat: 'context' | 'off' | 'track';
  shuffle: boolean;
}

export interface PlaybackActions {
  pausing: boolean;
  resuming: boolean;
  seeking: boolean;
  skippingNext: boolean;
  skippingPrevious: boolean;
  togglingRepeat: boolean;
  togglingShuffle: boolean;
}

export interface ViewState {
  canPlayRows: boolean;
  capturedAt: string;
  condition: PlaybackCondition;
  context: { name: string | null; uri: string | null };
  items: NormalizedTrack[];
  list: { mode: 'context' | 'current-plus-queue'; reason: string | null };
  playback: PlaybackState | null;
  stale: boolean;
}

export type PlaybackCondition =
  | 'advertisement'
  | 'inaccessible-context'
  | 'no-device'
  | 'no-playback'
  | 'offline'
  | 'ready'
  | 'restricted-device'
  | 'throttled'
  | 'unsupported-item';

export interface SelectionResult {
  deviceName: string;
  playlist: PlaylistSummary;
}

export interface PlaybackResult {
  isPlaying?: boolean;
  item?: NormalizedTrack;
}

export interface SpotifyControllerApi {
  authorize(): Promise<void>;
  getState(): Promise<ViewState>;
  listDevices(): Promise<DeviceSummary[]>;
  listPlaylists(): Promise<PlaylistSummary[]>;
  openSpotifyUrl(url: string): Promise<void>;
  playRow(index: number): Promise<PlaybackResult>;
  seek(positionMs: number): Promise<void>;
  selectDevice(deviceId: string): Promise<void>;
  selectPlaylist(uri: string): Promise<SelectionResult>;
  setRepeat(mode: 'off' | 'context' | 'track'): Promise<void>;
  setShuffle(enabled: boolean): Promise<void>;
  skip(direction: 'next' | 'previous'): Promise<void>;
  togglePlayback(): Promise<PlaybackResult>;
}
