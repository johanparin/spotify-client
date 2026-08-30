import type { SpotifyControllerApi } from '../spotify/types.js';

export const IPC_CHANNELS = {
  getState: 'spotify:get-state',
  listDevices: 'spotify:list-devices',
  listPlaylists: 'spotify:list-playlists',
  playRow: 'spotify:play-row',
  seek: 'spotify:seek',
  selectDevice: 'spotify:select-device',
  selectPlaylist: 'spotify:select-playlist',
  setRepeat: 'spotify:set-repeat',
  setShuffle: 'spotify:set-shuffle',
  skip: 'spotify:skip',
  togglePlayback: 'spotify:toggle-playback',
} as const;

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];

type InvokeHandler = (event: unknown, ...args: unknown[]) => unknown;

export interface IpcRegistrar {
  handle(channel: string, handler: InvokeHandler): void;
  removeHandler(channel: string): void;
}

function requireNoPayload(args: unknown[]): void {
  if (args.length !== 0) {
    throw new TypeError('This operation takes no payload.');
  }
}

function requirePlaylistUri(value: unknown): string {
  if (typeof value !== 'string' ||
    !/^spotify:playlist:[A-Za-z0-9]+$/.test(value)) {
    throw new TypeError('Invalid Spotify playlist URI.');
  }
  return value;
}

function requireRow(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new TypeError('Track row must be a non-negative integer.');
  }
  return value as number;
}

function requireSeekPosition(value: unknown): number {
  if (typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0) {
    throw new TypeError('Seek position must be a non-negative number.');
  }
  return value;
}

function requireDeviceId(value: unknown): string {
  if (typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 256 ||
    /[\u0000-\u001f\u007f]/.test(value)) {
    throw new TypeError('Invalid Spotify device ID.');
  }
  return value;
}

export function registerIpcHandlers(
  ipc: IpcRegistrar,
  controller: SpotifyControllerApi,
): () => void {
  const handlers: Record<IpcChannel, InvokeHandler> = {
    [IPC_CHANNELS.getState]: (_event, ...args) => {
      requireNoPayload(args);
      return controller.getState();
    },
    [IPC_CHANNELS.listDevices]: (_event, ...args) => {
      requireNoPayload(args);
      return controller.listDevices();
    },
    [IPC_CHANNELS.listPlaylists]: (_event, ...args) => {
      requireNoPayload(args);
      return controller.listPlaylists();
    },
    [IPC_CHANNELS.playRow]: (_event, value, ...rest) => {
      requireNoPayload(rest);
      return controller.playRow(requireRow(value));
    },
    [IPC_CHANNELS.seek]: (_event, value, ...rest) => {
      requireNoPayload(rest);
      return controller.seek(requireSeekPosition(value));
    },
    [IPC_CHANNELS.selectDevice]: (_event, value, ...rest) => {
      requireNoPayload(rest);
      return controller.selectDevice(requireDeviceId(value));
    },
    [IPC_CHANNELS.selectPlaylist]: (_event, value, ...rest) => {
      requireNoPayload(rest);
      return controller.selectPlaylist(requirePlaylistUri(value));
    },
    [IPC_CHANNELS.setRepeat]: (_event, value, ...rest) => {
      requireNoPayload(rest);
      if (value !== 'off' && value !== 'context' && value !== 'track') {
        throw new TypeError('Invalid repeat mode.');
      }
      return controller.setRepeat(value);
    },
    [IPC_CHANNELS.setShuffle]: (_event, value, ...rest) => {
      requireNoPayload(rest);
      if (typeof value !== 'boolean') {
        throw new TypeError('Shuffle state must be a boolean.');
      }
      return controller.setShuffle(value);
    },
    [IPC_CHANNELS.skip]: (_event, value, ...rest) => {
      requireNoPayload(rest);
      if (value !== 'next' && value !== 'previous') {
        throw new TypeError('Invalid skip direction.');
      }
      return controller.skip(value);
    },
    [IPC_CHANNELS.togglePlayback]: (_event, ...args) => {
      requireNoPayload(args);
      return controller.togglePlayback();
    },
  };

  for (const [channel, handler] of Object.entries(handlers)) {
    ipc.handle(channel, handler);
  }
  return () => {
    for (const channel of Object.keys(handlers)) ipc.removeHandler(channel);
  };
}
