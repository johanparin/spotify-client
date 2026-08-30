import { app, BrowserWindow } from 'electron';

import { startServer } from '../005-thin-interactive-proof/server.mjs';

let mainWindow = null;
let server = null;
let uiUrl = null;

async function ensureServer() {
  if (server) return;
  const started = await startServer({ port: 0 });
  server = started.server;
  uiUrl = started.url;
}

async function createWindow() {
  await ensureServer();

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
      sandbox: true,
    },
    width: 560,
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(uiUrl)) event.preventDefault();
  });
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    console.log(`Electron window ready: ${uiUrl}`);
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(uiUrl);
}

app.whenReady().then(createWindow).catch((error) => {
  console.error(error);
  app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createWindow().catch(console.error);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  server?.close();
  server = null;
});
