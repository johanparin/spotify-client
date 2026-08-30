#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

import { accessToken } from '../001-context-survey/lib/auth.mjs';
import { createController } from './controller.mjs';

const HOST = '127.0.0.1';
const PORT = Number(process.env.UI_PORT || 43822);
const PUBLIC = new URL('./public/', import.meta.url);
const controller = createController(accessToken);

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/ui.mjs', ['ui.mjs', 'text/javascript; charset=utf-8']],
  ['/model.mjs', ['model.mjs', 'text/javascript; charset=utf-8']],
]);

function sendJson(response, status, value) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

async function route(request, response) {
  const url = new URL(request.url, `http://${HOST}:${PORT}`);

  if (request.method === 'GET' && assets.has(url.pathname)) {
    const [name, contentType] = assets.get(url.pathname);
    const body = await readFile(new URL(name, PUBLIC));
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': contentType,
    });
    response.end(body);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/state') {
    sendJson(response, 200, await controller.state());
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/playlists') {
    sendJson(response, 200, { items: await controller.playlists() });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/play') {
    const { index } = await readJson(request);
    sendJson(response, 200, await controller.playRow(index));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/toggle') {
    sendJson(response, 200, await controller.togglePlayback());
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/playlist') {
    const { uri } = await readJson(request);
    sendJson(response, 200, await controller.selectPlaylist(uri));
    return;
  }

  sendJson(response, 404, { error: 'Not found.' });
}

const server = createServer((request, response) => {
  route(request, response).catch((error) => {
    console.error(error);
    sendJson(response, error.status || 500, { error: error.message });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Spotify UI proof: http://${HOST}:${PORT}`);
});