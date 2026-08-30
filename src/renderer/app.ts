import type {
  DeviceSummary,
  PlaybackState,
  PlaylistSummary,
  ViewState,
} from '../spotify/types.js';
import {
  clampProgress,
  filterByText,
  moveSelection,
  nextRepeatMode,
  normalizeNavigationKey,
  optimisticTransition,
  reconcileSelection,
  shouldAutoReveal,
} from './model.js';

function element<T extends Element>(selector: string): T {
  const value = document.querySelector<T>(selector);
  if (!value) throw new Error(`Missing renderer element: ${selector}`);
  return value;
}

const contextName = element<HTMLElement>('#context-name');
const listMode = element<HTMLElement>('#list-mode');
const tracks = element<HTMLOListElement>('#tracks');
const toggle = element<HTMLButtonElement>('#toggle');
const reveal = element<HTMLButtonElement>('#reveal');
const connection = element<HTMLElement>('#connection');
const openPlaylists = element<HTMLButtonElement>('#open-playlists');
const playlistDialog = element<HTMLDialogElement>('#playlist-dialog');
const playlistSearch = element<HTMLInputElement>('#playlist-search');
const playlistList = element<HTMLOListElement>('#playlists');
const playlistHelp = element<HTMLElement>('#playlist-help');
const previous = element<HTMLButtonElement>('#previous');
const next = element<HTMLButtonElement>('#next');
const shuffle = element<HTMLButtonElement>('#shuffle');
const repeat = element<HTMLButtonElement>('#repeat');
const device = element<HTMLSelectElement>('#device');
const seek = element<HTMLInputElement>('#seek');
const progressCurrent = element<HTMLElement>('#progress-current');
const progressDuration = element<HTMLElement>('#progress-duration');
const nowTitle = element<HTMLElement>('#now-title');
const nowArtist = element<HTMLElement>('#now-artist');

let view: ViewState = {
  canPlayRows: false,
  capturedAt: '',
  context: { name: null, uri: null },
  items: [],
  list: { mode: 'current-plus-queue', reason: 'loading' },
  playback: null,
  stale: false,
};
let selectedIndex = -1;
let previousPlayingUri: string | null = null;
let requestPending = false;
let renderedItems = '';
let availablePlaylists: PlaylistSummary[] = [];
let visiblePlaylists: PlaylistSummary[] = [];
let selectedPlaylistIndex = 0;
let availableDevices: DeviceSummary[] = [];

function duration(milliseconds: number | null): string {
  if (milliseconds === null || !Number.isFinite(milliseconds)) return '';
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:` +
    String(seconds % 60).padStart(2, '0');
}

function selectedUri(): string | null {
  return view.items[selectedIndex]?.uri ?? null;
}

function rowVisible(index: number): boolean {
  const row = tracks.children.item(index) as HTMLElement | null;
  if (!row) return true;
  return row.offsetTop >= tracks.scrollTop &&
    row.offsetTop + row.offsetHeight <=
      tracks.scrollTop + tracks.clientHeight;
}

function revealPlaying(): void {
  const index = view.playback?.currentIndex ?? -1;
  tracks.children.item(index)?.scrollIntoView({ block: 'nearest' });
}

function updateRows(): void {
  Array.from(tracks.children).forEach((row, index) => {
    const selected = index === selectedIndex;
    const playing = index === view.playback?.currentIndex;
    row.classList.toggle('selected', selected);
    row.classList.toggle('playing', playing);
    row.setAttribute('aria-selected', String(selected));
    const number = row.querySelector<HTMLElement>('.number');
    if (number) number.textContent = playing ? '▶' : String(index + 1);
  });
}

function renderRows(): void {
  const signature = JSON.stringify(view.items.map((item) => [
    item.uri,
    item.name,
    item.artists,
    item.durationMs,
  ]));
  if (signature !== renderedItems) {
    const fragment = document.createDocumentFragment();
    view.items.forEach((item, index) => {
      const row = document.createElement('li');
      row.className = 'track';
      row.dataset.index = String(index);
      row.setAttribute('role', 'option');

      const number = document.createElement('span');
      number.className = 'number';
      const title = document.createElement('span');
      title.className = 'title';
      title.textContent = item.name ?? 'Unknown track';
      if (item.artists.length > 0) {
        const artist = document.createElement('span');
        artist.className = 'artist';
        artist.textContent = ` — ${item.artists.join(', ')}`;
        title.append(artist);
      }
      const length = document.createElement('span');
      length.className = 'duration';
      length.textContent = duration(item.durationMs);
      row.append(number, title, length);
      fragment.append(row);
    });
    tracks.replaceChildren(fragment);
    renderedItems = signature;
  }
  updateRows();
}

function render(): void {
  renderRows();
  const playback = view.playback;
  toggle.disabled = !playback || (playback.isPlaying
    ? !playback.actions.pausing
    : !playback.actions.resuming);
  const toggleLabel = playback?.isPlaying ? 'Pause' : 'Play';
  toggle.title = toggleLabel;
  toggle.setAttribute('aria-label', toggleLabel);
  toggle.querySelector('use')?.setAttribute(
    'href',
    playback?.isPlaying ? '#icon-pause' : '#icon-play',
  );
  contextName.textContent = view.context.name ??
    (view.playback ? 'Unknown context' : 'No active playback');
  const current = playback?.current;
  reveal.hidden = !current || (playback?.currentIndex ?? -1) < 0;
  nowTitle.textContent = current?.name ?? 'Unknown track';
  nowArtist.textContent = current?.artists.length
    ? current.artists.join(', ')
    : 'Unknown artist';
  listMode.textContent = !view.playback
    ? 'No playback'
    : view.list.mode === 'context'
    ? `${view.items.length} tracks`
    : `${view.items.length} tracks · Current + Queue · ` +
      (view.list.reason ?? 'fallback');
  previous.disabled = !playback?.actions.skippingPrevious;
  next.disabled = !playback?.actions.skippingNext;
  shuffle.disabled = !playback?.actions.togglingShuffle;
  shuffle.title = `Shuffle ${playback?.shuffle ? 'on' : 'off'}`;
  shuffle.classList.toggle('active', playback?.shuffle === true);
  shuffle.setAttribute('aria-pressed', String(playback?.shuffle === true));
  repeat.disabled = !playback?.actions.togglingRepeat;
  repeat.title = `Repeat ${playback?.repeat ?? 'off'}`;
  repeat.classList.toggle('active', playback?.repeat !== 'off' && !!playback);
  repeat.setAttribute(
    'aria-pressed',
    String(playback?.repeat !== 'off' && !!playback),
  );

  const durationMs = playback?.current?.durationMs ?? null;
  const positionMs = clampProgress(playback?.progressMs ?? 0, durationMs);
  seek.disabled = !playback?.actions.seeking || durationMs === null;
  seek.max = String(durationMs ?? 0);
  seek.value = String(positionMs);
  const progressPercent = durationMs && durationMs > 0
    ? positionMs / durationMs * 100
    : 0;
  seek.style.setProperty('--seek-progress', `${progressPercent}%`);
  progressCurrent.textContent = duration(positionMs);
  progressDuration.textContent = duration(durationMs) || '0:00';
  renderDevices();
}

function renderDevices(): void {
  const activeId = view.playback?.device?.id ?? null;
  const signature = JSON.stringify(availableDevices.map((item) => [
    item.id,
    item.name,
    item.isActive,
    item.isRestricted,
  ]));
  if (device.dataset.signature !== signature) {
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = availableDevices.length > 0
      ? 'Choose device'
      : view.playback?.device?.name ?? 'No device';
    const options = availableDevices.map((item) => {
      const option = document.createElement('option');
      option.value = item.id ?? '';
      option.disabled = item.id === null || item.isRestricted;
      option.textContent = item.name +
        (item.isRestricted ? ' · restricted' : '');
      return option;
    });
    device.replaceChildren(placeholder, ...options);
    device.dataset.signature = signature;
  }
  device.disabled = availableDevices.length === 0;
  device.value = activeId && availableDevices.some((item) => {
    return item.id === activeId;
  }) ? activeId : '';
}

function setStatus(message: string, state: 'error' | 'ok'): void {
  connection.textContent = message;
  connection.className = state;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Spotify action failed.';
}

async function refresh(): Promise<void> {
  if (requestPending) return;
  requestPending = true;
  try {
    const next = await window.spotifyController.getState();
    // Read selection after awaiting state so in-flight navigation is retained.
    const oldSelectedUri = selectedUri();
    const oldPlayingIndex = view.playback?.currentIndex ?? -1;
    const previousPlayingVisible = rowVisible(oldPlayingIndex);
    const nextPlayingUri = next.playback?.current?.uri ?? null;
    const autoReveal = shouldAutoReveal({
      nextPlayingUri,
      previousPlayingUri,
      previousPlayingVisible,
    });

    view = next;
    selectedIndex = reconcileSelection(
      view.items,
      oldSelectedUri,
      selectedIndex < 0
        ? view.playback?.currentIndex ?? 0
        : selectedIndex,
    );
    render();
    if (autoReveal) {
      revealPlaying();
    }
    previousPlayingUri = nextPlayingUri;
    setStatus(view.stale ? 'State may be stale' : 'Connected', 'ok');
  } catch (error) {
    setStatus(errorMessage(error), 'error');
  } finally {
    requestPending = false;
  }
}

function select(indexOrKey: number | string): void {
  selectedIndex = moveSelection(
    selectedIndex,
    indexOrKey,
    view.items.length,
  );
  updateRows();
  tracks.children.item(selectedIndex)?.scrollIntoView({ block: 'nearest' });
}

async function runAction(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
    await refresh();
  } catch (error) {
    setStatus(errorMessage(error), 'error');
  }
}

async function runOptimistic(
  update: (playback: PlaybackState) => PlaybackState,
  action: () => Promise<unknown>,
): Promise<void> {
  let rollback = view;
  if (view.playback) {
    const transition = optimisticTransition(view.playback, update);
    rollback = { ...view, playback: transition.rollback };
    view = { ...view, playback: transition.next };
    render();
  }
  try {
    await action();
    await refresh();
  } catch (error) {
    view = rollback;
    render();
    setStatus(errorMessage(error), 'error');
  }
}

async function playSelected(): Promise<void> {
  if (!view.canPlayRows || selectedIndex < 0) return;
  await runAction(() => window.spotifyController.playRow(selectedIndex));
}

async function togglePlayback(): Promise<void> {
  await runOptimistic(
    (playback) => ({ ...playback, isPlaying: !playback.isPlaying }),
    () => window.spotifyController.togglePlayback(),
  );
}

async function skip(direction: 'next' | 'previous'): Promise<void> {
  await runAction(() => window.spotifyController.skip(direction));
}

async function toggleShuffle(): Promise<void> {
  const enabled = !view.playback?.shuffle;
  await runOptimistic(
    (playback) => ({ ...playback, shuffle: enabled }),
    () => window.spotifyController.setShuffle(enabled),
  );
}

async function cycleRepeat(): Promise<void> {
  if (!view.playback) return;
  const mode = nextRepeatMode(view.playback.repeat);
  await runOptimistic(
    (playback) => ({ ...playback, repeat: mode }),
    () => window.spotifyController.setRepeat(mode),
  );
}

async function seekTo(positionMs: number): Promise<void> {
  const durationMs = view.playback?.current?.durationMs ?? null;
  const position = clampProgress(positionMs, durationMs);
  await runOptimistic(
    (playback) => ({ ...playback, progressMs: position }),
    () => window.spotifyController.seek(position),
  );
}

async function loadDevices(): Promise<void> {
  try {
    availableDevices = await window.spotifyController.listDevices();
    renderDevices();
  } catch (error) {
    setStatus(errorMessage(error), 'error');
  }
}

async function selectDevice(deviceId: string): Promise<void> {
  const selected = availableDevices.find((item) => item.id === deviceId);
  if (!selected) return;
  await runOptimistic(
    (playback) => ({ ...playback, device: selected }),
    () => window.spotifyController.selectDevice(deviceId),
  );
  await loadDevices();
}

function updatePlaylistRows(): void {
  Array.from(playlistList.children).forEach((row, index) => {
    row.classList.toggle('selected', index === selectedPlaylistIndex);
  });
  playlistList.children.item(selectedPlaylistIndex)?.scrollIntoView({
    block: 'nearest',
  });
}

function renderPlaylists(): void {
  visiblePlaylists = filterByText(availablePlaylists, playlistSearch.value);
  selectedPlaylistIndex = moveSelection(
    selectedPlaylistIndex,
    selectedPlaylistIndex,
    visiblePlaylists.length,
  );
  const fragment = document.createDocumentFragment();
  visiblePlaylists.forEach((playlist, index) => {
    const row = document.createElement('li');
    row.className = 'playlist';
    row.dataset.index = String(index);
    if (playlist.uri === view.context.uri) row.classList.add('current');
    if (playlist.itemCount === 0) row.classList.add('empty');

    const name = document.createElement('span');
    name.textContent = playlist.name;
    const details = document.createElement('span');
    details.className = 'playlist-owner';
    details.textContent = `${playlist.owner ?? 'Unknown'} · ` +
      `${playlist.itemCount ?? '?'} tracks`;
    row.append(name, details);
    fragment.append(row);
  });
  playlistList.replaceChildren(fragment);
  updatePlaylistRows();
}

async function showPlaylists(): Promise<void> {
  playlistDialog.showModal();
  playlistSearch.value = '';
  playlistHelp.textContent = 'Loading playlists…';
  playlistSearch.focus();
  try {
    availablePlaylists = await window.spotifyController.listPlaylists();
    const current = availablePlaylists.findIndex(
      (playlist) => playlist.uri === view.context.uri,
    );
    selectedPlaylistIndex = current >= 0 ? current : 0;
    playlistHelp.textContent =
      'Type to filter · C-n/C-p or ↑/↓ · Enter play';
    renderPlaylists();
  } catch (error) {
    const message = errorMessage(error);
    playlistHelp.textContent = message;
    setStatus(message, 'error');
  }
}

async function choosePlaylist(): Promise<void> {
  const playlist = visiblePlaylists[selectedPlaylistIndex];
  if (!playlist) return;
  if (playlist.itemCount === 0) {
    playlistHelp.textContent = 'This playlist is empty.';
    return;
  }
  playlistHelp.textContent = `Opening ${playlist.name}…`;
  try {
    await window.spotifyController.selectPlaylist(playlist.uri);
    playlistDialog.close();
    await new Promise((resolve) => setTimeout(resolve, 350));
    await refresh();
  } catch (error) {
    const message = errorMessage(error);
    playlistHelp.textContent = message;
    setStatus(message, 'error');
  }
}

function closestRow(
  event: Event,
  selector: '.playlist' | '.track',
): HTMLElement | null {
  return event.target instanceof Element
    ? event.target.closest<HTMLElement>(selector)
    : null;
}

tracks.addEventListener('click', (event) => {
  const row = closestRow(event, '.track');
  if (row) select(Number(row.dataset.index));
});
tracks.addEventListener('dblclick', (event) => {
  const row = closestRow(event, '.track');
  if (!row) return;
  event.preventDefault();
  select(Number(row.dataset.index));
  void playSelected();
});

document.addEventListener('keydown', (event) => {
  const key = normalizeNavigationKey(event);
  if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) {
    event.preventDefault();
    select(key);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    void playSelected();
  } else if (event.key === ' ') {
    event.preventDefault();
    void togglePlayback();
  } else if (event.key === '[' && !previous.disabled) {
    event.preventDefault();
    void skip('previous');
  } else if (event.key === ']' && !next.disabled) {
    event.preventDefault();
    void skip('next');
  } else if (event.key.toLocaleLowerCase() === 'f') {
    revealPlaying();
  } else if (event.key.toLocaleLowerCase() === 'p' &&
    !event.altKey && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    void showPlaylists();
  }
});

toggle.addEventListener('click', () => void togglePlayback());
previous.addEventListener('click', () => void skip('previous'));
next.addEventListener('click', () => void skip('next'));
shuffle.addEventListener('click', () => void toggleShuffle());
repeat.addEventListener('click', () => void cycleRepeat());
seek.addEventListener('input', () => {
  const position = Number(seek.value);
  const maximum = Number(seek.max);
  progressCurrent.textContent = duration(position);
  const percentage = maximum > 0 ? position / maximum * 100 : 0;
  seek.style.setProperty('--seek-progress', `${percentage}%`);
});
seek.addEventListener('change', () => void seekTo(Number(seek.value)));
device.addEventListener('pointerdown', () => void loadDevices());
device.addEventListener('focus', () => void loadDevices());
device.addEventListener('change', () => {
  const deviceId = device.value;
  device.blur();
  void selectDevice(deviceId);
});
reveal.addEventListener('click', revealPlaying);
openPlaylists.addEventListener('click', () => void showPlaylists());
playlistSearch.addEventListener('input', () => {
  selectedPlaylistIndex = 0;
  renderPlaylists();
});
playlistDialog.addEventListener('keydown', (event) => {
  event.stopPropagation();
  const key = normalizeNavigationKey(event);
  if (key === 'ArrowDown' || key === 'ArrowUp') {
    event.preventDefault();
    selectedPlaylistIndex = moveSelection(
      selectedPlaylistIndex,
      key,
      visiblePlaylists.length,
    );
    updatePlaylistRows();
  } else if (key === 'Enter') {
    event.preventDefault();
    void choosePlaylist();
  }
});
playlistList.addEventListener('click', (event) => {
  const row = closestRow(event, '.playlist');
  if (!row) return;
  selectedPlaylistIndex = Number(row.dataset.index);
  updatePlaylistRows();
  void choosePlaylist();
});

tracks.focus();
await refresh();
await loadDevices();
setInterval(() => void refresh(), 1000);
