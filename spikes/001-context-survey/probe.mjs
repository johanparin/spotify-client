#!/usr/bin/env node

import { appendFile, mkdir } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { accessToken, login, REDIRECT_URI } from './lib/auth.mjs';
import {
  fallbackItems,
  fetchContext,
  snapshot,
} from './lib/context.mjs';
import { writeCredential } from './lib/keychain.mjs';
import { apiRequest } from './lib/spotify.mjs';

const OBSERVATIONS = new URL('../../observations/', import.meta.url);

function help() {
  console.log(`Usage: probe <command>

Commands:
  configure              Store the public Spotify client ID in Keychain
  login                  Authorize with PKCE in the system browser
  survey [label]         Capture playback, context, queue, and timings
  view                   Print the current context as a compact track list
  play <row> --yes       Play a one-based row in the current context
  watch [seconds] [ms]   Report externally triggered playback changes
  help                   Show this message

Redirect URI to register exactly:
  ${REDIRECT_URI}`);
}

async function configure() {
  const readline = createInterface({ input, output });
  const value = (await readline.question('Spotify client ID: ')).trim();
  readline.close();

  if (!/^[A-Za-z0-9]{16,64}$/.test(value)) {
    throw new Error('Client ID must be 16–64 ASCII letters or digits.');
  }
  writeCredential('client-id', value);
  console.log('Stored the client ID in macOS Keychain.');
}

function artists(item) {
  return item.artists.length ? item.artists.join(', ') : 'Unknown artist';
}

function printList(result) {
  if (!result.playback) {
    console.log('No active Spotify playback.');
    return;
  }

  const playback = result.playback;
  const context = result.context;
  console.log(
    `${playback.is_playing ? '▶' : '❚❚'} ` +
    `${playback.device?.name || 'No device'} | ` +
    `shuffle=${playback.shuffle_state} repeat=${playback.repeat_state}`,
  );
  const contextName = context.metadata?.name;
  console.log(
    `Context: ${contextName || 'unknown'} ` +
    `(${playback.context?.uri || 'none'})`,
  );

  const items = context.accessible
    ? context.items
    : fallbackItems(playback.current, result.queue.items);
  const source = context.accessible ? 'context' : `queue (${context.reason})`;
  console.log(`List source: ${source}; ${items.length} items`);

  items.forEach((item, index) => {
    const playing = context.accessible
      ? index === playback.current_index
      : item.uri === playback.current?.uri;
    const marker = playing ? '▶' : ' ';
    const row = String(index + 1).padStart(3);
    console.log(`${marker} ${row}  ${artists(item)} — ${item.name}`);
  });
}

async function survey(label) {
  const result = await snapshot(await accessToken());
  const observation = { label: label || null, ...result };
  await mkdir(OBSERVATIONS, { recursive: true });
  await appendFile(
    new URL('context-surveys.jsonl', OBSERVATIONS),
    `${JSON.stringify(observation)}\n`,
    { mode: 0o600 },
  );
  printList(result);
  console.log('Recorded observations/context-surveys.jsonl');
}

async function view() {
  printList(await snapshot(await accessToken()));
}

async function play(row, confirmed) {
  if (!confirmed) {
    throw new Error('Playback changes require the explicit --yes flag.');
  }
  const index = Number(row) - 1;
  if (!Number.isInteger(index) || index < 0) {
    throw new Error('Row must be a positive integer.');
  }

  const token = await accessToken();
  const state = await snapshot(token);
  if (!state.playback?.context?.uri) {
    throw new Error('Current playback has no context URI.');
  }
  const items = state.context.accessible
    ? state.context.items
    : fallbackItems(state.playback.current, state.queue.items);
  const item = items[index];
  if (!item?.uri) throw new Error(`No playable context row ${row}.`);

  await apiRequest(token, '/me/player/play', {
    method: 'PUT',
    body: {
      context_uri: state.playback.context.uri,
      offset: { uri: item.uri },
    },
  });
  console.log(`Requested: ${artists(item)} — ${item.name}`);
}

function stateKey(data) {
  if (!data) return 'no-playback';
  return JSON.stringify({
    context: data.context?.uri || null,
    device: data.device?.id || null,
    is_playing: data.is_playing,
    item: data.item?.uri || null,
    repeat: data.repeat_state,
    shuffle: data.shuffle_state,
    timestamp: data.timestamp,
  });
}

async function watch(secondsValue, intervalValue) {
  const seconds = Number(secondsValue || 60);
  const intervalMs = Number(intervalValue || 1000);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error('Watch duration must be a positive number of seconds.');
  }
  if (!Number.isInteger(intervalMs) || intervalMs < 250) {
    throw new Error('Polling interval must be an integer of at least 250 ms.');
  }

  const token = await accessToken();
  const deadline = Date.now() + seconds * 1000;
  let previous = null;

  while (Date.now() < deadline) {
    const response = await apiRequest(
      token,
      '/me/player?additional_types=track,episode',
    );
    const key = stateKey(response.data);
    if (key !== previous) {
      console.log(new Date().toISOString(), `${response.elapsedMs}ms`, key);
      previous = key;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function main() {
  const [command = 'help', ...args] = process.argv.slice(2);

  if (command === 'help' || command === '--help' || command === '-h') {
    help();
  } else if (command === 'configure') {
    await configure();
  } else if (command === 'login') {
    await login();
    console.log('Authorized; refresh token stored in macOS Keychain.');
  } else if (command === 'survey') {
    await survey(args.join(' '));
  } else if (command === 'view') {
    await view();
  } else if (command === 'play') {
    await play(args.find((arg) => arg !== '--yes'), args.includes('--yes'));
  } else if (command === 'watch') {
    await watch(args[0], args[1]);
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
