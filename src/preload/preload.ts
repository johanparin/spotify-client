import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS } from '../main/ipc.js';
import type { SpotifyControllerApi } from '../spotify/types.js';

const spotifyController: SpotifyControllerApi = {
  authorize: () => ipcRenderer.invoke(IPC_CHANNELS.authorize),
  getState: () => ipcRenderer.invoke(IPC_CHANNELS.getState),
  listDevices: () => ipcRenderer.invoke(IPC_CHANNELS.listDevices),
  listPlaylists: () => ipcRenderer.invoke(IPC_CHANNELS.listPlaylists),
  playRow: (index) => ipcRenderer.invoke(IPC_CHANNELS.playRow, index),
  seek: (positionMs) => ipcRenderer.invoke(IPC_CHANNELS.seek, positionMs),
  selectDevice: (deviceId) => {
    return ipcRenderer.invoke(IPC_CHANNELS.selectDevice, deviceId);
  },
  selectPlaylist: (uri) => {
    return ipcRenderer.invoke(IPC_CHANNELS.selectPlaylist, uri);
  },
  setRepeat: (mode) => ipcRenderer.invoke(IPC_CHANNELS.setRepeat, mode),
  setShuffle: (enabled) => {
    return ipcRenderer.invoke(IPC_CHANNELS.setShuffle, enabled);
  },
  skip: (direction) => ipcRenderer.invoke(IPC_CHANNELS.skip, direction),
  togglePlayback: () => ipcRenderer.invoke(IPC_CHANNELS.togglePlayback),
};

contextBridge.exposeInMainWorld('spotifyController', spotifyController);
