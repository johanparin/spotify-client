import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { app, BrowserWindow, ipcMain } from 'electron';

import { accessToken } from '../spotify/auth.js';
import { createController } from '../spotify/controller.js';
import { registerIpcHandlers } from './ipc.js';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;
const controller = createController({ tokenProvider: accessToken });

registerIpcHandlers(ipcMain, controller);

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    autoHideMenuBar: true,
    backgroundColor: '#111412',
    height: 680,
    minHeight: 320,
    minWidth: 420,
    show: false,
    title: 'Spotify compact controller',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(moduleDirectory, '../preload/preload.cjs'),
      sandbox: true,
    },
    width: 560,
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  await mainWindow.loadFile(
    path.join(moduleDirectory, '../renderer/index.html'),
  );
}

app.whenReady().then(createWindow).catch((error: unknown) => {
  console.error(error);
  app.quit();
});

app.on('activate', () => {
  if (!mainWindow) void createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
