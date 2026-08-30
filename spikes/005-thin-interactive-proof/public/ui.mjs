import {
  moveSelection,
  normalizeNavigationKey,
  reconcileSelection,
  shouldAutoReveal,
} from './model.mjs';

const contextName = document.querySelector('#context-name');
const contextDetail = document.querySelector('#context-detail');
const listMode = document.querySelector('#list-mode');
const tracks = document.querySelector('#tracks');
const toggle = document.querySelector('#toggle');
const reveal = document.querySelector('#reveal');
const connection = document.querySelector('#connection');
const openPlaylists = document.querySelector('#open-playlists');
const playlistDialog = document.querySelector('#playlist-dialog');
const playlistSearch = document.querySelector('#playlist-search');
const playlistList = document.querySelector('#playlists');

let view = { items: [], playback: null };
let selectedIndex = -1;
let previousPlayingUri = null;
let requestPending = false;
let renderedItems = '';
let availablePlaylists = [];
let visiblePlaylists = [];
let selectedPlaylistIndex = 0;

function duration(milliseconds) {
  if (!Number.isFinite(milliseconds)) return '';
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function selectedUri() {
  return view.items[selectedIndex]?.uri || null;
}

function rowVisible(index) {
  const row = tracks.children[index];
  if (!row) return true;
  return row.offsetTop >= tracks.scrollTop &&
    row.offsetTop + row.offsetHeight <= tracks.scrollTop + tracks.clientHeight;
}

function revealPlaying() {
  const index = view.playback?.current_index ?? -1;
  tracks.children[index]?.scrollIntoView({ block: 'nearest' });
  reveal.hidden = true;
}

function updateRows() {
  Array.from(tracks.children).forEach((row, index) => {
    const selected = index === selectedIndex;
    const playing = index === view.playback?.current_index;
    row.classList.toggle('selected', selected);
    row.classList.toggle('playing', playing);
    row.setAttribute('aria-selected', selected ? 'true' : 'false');
    row.querySelector('.number').textContent = playing ? '▶' : String(index + 1);
  });
}

function renderRows() {
  const signature = view.items.map((item) => item.uri).join('\n');
  if (signature !== renderedItems) {
    const fragment = document.createDocumentFragment();

    view.items.forEach((item, index) => {
      const row = document.createElement('li');
      row.className = 'track';
      row.dataset.index = index;

      const number = document.createElement('span');
      number.className = 'number';

      const title = document.createElement('span');
      title.className = 'title';
      title.textContent = item.name || 'Unknown track';
      if (item.artists?.length) {
        const artist = document.createElement('span');
        artist.className = 'artist';
        artist.textContent = ` — ${item.artists.join(', ')}`;
        title.append(artist);
      }

      const length = document.createElement('span');
      length.className = 'duration';
      length.textContent = duration(item.duration_ms);
      row.append(number, title, length);
      fragment.append(row);
    });

    tracks.replaceChildren(fragment);
    renderedItems = signature;
  }
  updateRows();
}

function render() {
  renderRows();
  toggle.disabled = !view.playback;
  toggle.textContent = view.playback?.is_playing
    ? 'Space · Pause'
    : 'Space · Play';
  contextName.textContent = view.context?.name ||
    (view.playback ? 'Unknown context' : 'No active playback');
  contextDetail.textContent = view.playback
    ? `${view.playback.device_name || 'No device'} · ` +
      `shuffle ${view.playback.shuffle_state} · ` +
      `repeat ${view.playback.repeat_state}`
    : 'Start playback in Spotify, then return here';
  listMode.textContent = view.list?.mode === 'context'
    ? `${view.items.length} tracks · full context`
    : `${view.items.length} tracks · Current + Queue · ` +
      `${view.list?.reason || 'fallback'}`;
}

async function api(path, options) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

async function refresh() {
  if (requestPending) return;
  requestPending = true;

  try {
    const next = await api('/api/state');
    // Read selection after the request. Keyboard or pointer input may have
    // changed it while Spotify was responding.
    const oldSelectedUri = selectedUri();
    const previousPlayingVisible = rowVisible(
      view.playback?.current_index ?? -1,
    );
    const nextPlayingUri = next.playback?.current?.uri || null;
    const autoReveal = shouldAutoReveal({
      nextPlayingUri,
      previousPlayingUri,
      previousPlayingVisible,
    });

    view = next;
    selectedIndex = reconcileSelection(
      view.items,
      oldSelectedUri,
      selectedIndex < 0 ? view.playback?.current_index : selectedIndex,
    );
    render();

    if (autoReveal) {
      revealPlaying();
    } else if (!rowVisible(view.playback?.current_index ?? -1)) {
      reveal.hidden = false;
    } else {
      reveal.hidden = true;
    }

    previousPlayingUri = nextPlayingUri;
    connection.textContent = `${next.timing_ms ?? '—'} ms`;
    connection.className = 'ok';
  } catch (error) {
    connection.textContent = error.message;
    connection.className = 'error';
  } finally {
    requestPending = false;
  }
}

function select(index) {
  selectedIndex = moveSelection(selectedIndex, index, view.items.length);
  updateRows();
  tracks.children[selectedIndex]?.scrollIntoView({ block: 'nearest' });
}

async function playSelected() {
  if (!view.can_play_rows || selectedIndex < 0) return;
  await api('/api/play', {
    method: 'POST',
    body: JSON.stringify({ index: selectedIndex }),
  });
  await refresh();
}

async function togglePlayback() {
  await api('/api/toggle', { method: 'POST', body: '{}' });
  await refresh();
}

function updatePlaylistRows() {
  Array.from(playlistList.children).forEach((row, index) => {
    row.classList.toggle('selected', index === selectedPlaylistIndex);
  });
  playlistList.children[selectedPlaylistIndex]?.scrollIntoView({
    block: 'nearest',
  });
}

function renderPlaylists() {
  const query = playlistSearch.value.trim().toLocaleLowerCase();
  visiblePlaylists = availablePlaylists.filter((playlist) => {
    const text = `${playlist.name} ${playlist.owner || ''}`.toLocaleLowerCase();
    return text.includes(query);
  });
  selectedPlaylistIndex = Math.max(
    0,
    Math.min(selectedPlaylistIndex, visiblePlaylists.length - 1),
  );

  const fragment = document.createDocumentFragment();
  visiblePlaylists.forEach((playlist, index) => {
    const row = document.createElement('li');
    row.className = 'playlist';
    if (playlist.uri === view.context?.uri) row.classList.add('current');
    if (playlist.item_count === 0) row.classList.add('empty');
    row.dataset.index = index;

    const name = document.createElement('span');
    name.textContent = playlist.name;
    const details = document.createElement('span');
    details.className = 'playlist-owner';
    details.textContent = `${playlist.owner || 'Unknown'} · ` +
      `${playlist.item_count ?? '?'} tracks`;
    row.append(name, details);
    fragment.append(row);
  });
  playlistList.replaceChildren(fragment);
  updatePlaylistRows();
}

async function showPlaylists() {
  playlistDialog.showModal();
  playlistSearch.value = '';
  playlistSearch.focus();
  try {
    const result = await api('/api/playlists');
    availablePlaylists = result.items;
    const current = availablePlaylists.findIndex(
      (playlist) => playlist.uri === view.context?.uri,
    );
    selectedPlaylistIndex = current >= 0 ? current : 0;
    renderPlaylists();
  } catch (error) {
    connection.textContent = error.message;
    connection.className = 'error';
  }
}

async function choosePlaylist() {
  const playlist = visiblePlaylists[selectedPlaylistIndex];
  if (!playlist || playlist.item_count === 0) return;
  connection.textContent = `Opening ${playlist.name}…`;
  await api('/api/playlist', {
    body: JSON.stringify({ uri: playlist.uri }),
    method: 'POST',
  });
  playlistDialog.close();
  setTimeout(refresh, 350);
}

tracks.addEventListener('click', (event) => {
  const row = event.target.closest('.track');
  if (row) select(Number(row.dataset.index));
});

tracks.addEventListener('dblclick', (event) => {
  if (event.target.closest('.track')) {
    event.preventDefault();
    playSelected().catch(console.error);
  }
});

document.addEventListener('keydown', (event) => {
  const key = normalizeNavigationKey(event);
  if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) {
    event.preventDefault();
    select(key);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    playSelected().catch(console.error);
  } else if (event.key === ' ') {
    event.preventDefault();
    togglePlayback().catch(console.error);
  } else if (event.key.toLowerCase() === 'f') {
    revealPlaying();
  } else if (
    event.key.toLowerCase() === 'p' &&
    !event.altKey && !event.ctrlKey && !event.metaKey
  ) {
    event.preventDefault();
    showPlaylists();
  }
});

toggle.addEventListener('click', () => togglePlayback().catch(console.error));
reveal.addEventListener('click', revealPlaying);
openPlaylists.addEventListener('click', showPlaylists);

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
    choosePlaylist().catch(console.error);
  }
});

playlistList.addEventListener('click', (event) => {
  const row = event.target.closest('.playlist');
  if (!row) return;
  selectedPlaylistIndex = Number(row.dataset.index);
  updatePlaylistRows();
});

playlistList.addEventListener('dblclick', (event) => {
  if (!event.target.closest('.playlist')) return;
  event.preventDefault();
  choosePlaylist().catch(console.error);
});

tracks.focus();
await refresh();
setInterval(refresh, 1000);