import type {
  PlaylistSummary,
  ViewState,
} from '../spotify/types.js';
import {
  filterByText,
  moveSelection,
  normalizeNavigationKey,
  reconcileSelection,
  shouldAutoReveal,
} from './model.js';

function element<T extends Element>(selector: string): T {
  const value = document.querySelector<T>(selector);
  if (!value) throw new Error(`Missing renderer element: ${selector}`);
  return value;
}

const contextName = element<HTMLElement>('#context-name');
const contextDetail = element<HTMLElement>('#context-detail');
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
  reveal.hidden = true;
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
  toggle.disabled = !view.playback;
  toggle.textContent = view.playback?.isPlaying
    ? 'Space · Pause'
    : 'Space · Play';
  contextName.textContent = view.context.name ??
    (view.playback ? 'Unknown context' : 'No active playback');
  contextDetail.textContent = view.playback
    ? `${view.playback.device?.name ?? 'No device'} · ` +
      `shuffle ${view.playback.shuffle} · ` +
      `repeat ${view.playback.repeat}`
    : 'Start playback in Spotify, then return here';
  listMode.textContent = view.list.mode === 'context'
    ? `${view.items.length} tracks · full context`
    : `${view.items.length} tracks · Current + Queue · ` +
      (view.list.reason ?? 'fallback');
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
    } else {
      reveal.hidden = rowVisible(view.playback?.currentIndex ?? -1);
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

async function playSelected(): Promise<void> {
  if (!view.canPlayRows || selectedIndex < 0) return;
  await runAction(() => window.spotifyController.playRow(selectedIndex));
}

async function togglePlayback(): Promise<void> {
  await runAction(() => window.spotifyController.togglePlayback());
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
  } else if (event.key.toLocaleLowerCase() === 'f') {
    revealPlaying();
  } else if (event.key.toLocaleLowerCase() === 'p' &&
    !event.altKey && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    void showPlaylists();
  }
});

toggle.addEventListener('click', () => void togglePlayback());
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
});
playlistList.addEventListener('dblclick', (event) => {
  const row = closestRow(event, '.playlist');
  if (!row) return;
  event.preventDefault();
  selectedPlaylistIndex = Number(row.dataset.index);
  void choosePlaylist();
});

tracks.focus();
await refresh();
setInterval(() => void refresh(), 1000);
