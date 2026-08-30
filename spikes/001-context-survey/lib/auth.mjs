import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

import {
  deleteCredential,
  readCredential,
  writeCredential,
} from './keychain.mjs';

const ACCOUNTS_URL = 'https://accounts.spotify.com';
const HOST = '127.0.0.1';
const PORT = 43821;
export const REDIRECT_URI = `http://${HOST}:${PORT}/callback`;

const SCOPES = [
  'playlist-read-collaborative',
  'playlist-read-private',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-read-playback-state',
];

export function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function clientId() {
  const value = readCredential('client-id');
  if (!value) {
    throw new Error('No client ID. Run the configure command first.');
  }
  return value;
}

function tokenError(response, body, action) {
  const detail = body?.error_description || body?.error || response.statusText;
  return new Error(`${action} failed (${response.status}): ${detail}`);
}

async function tokenRequest(parameters, action) {
  const response = await fetch(`${ACCOUNTS_URL}/api/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(parameters),
  });
  const body = await response.json();
  if (!response.ok) throw tokenError(response, body, action);
  return body;
}

function waitForCallback(expectedState) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('Spotify authorization timed out after five minutes.'));
    }, 300_000);

    const finish = (response, status, message, result) => {
      response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(message);
      clearTimeout(timeout);
      server.close(() => result());
    };

    const server = createServer((request, response) => {
      const url = new URL(request.url, REDIRECT_URI);
      if (url.pathname !== '/callback') {
        response.writeHead(404).end();
        return;
      }

      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');
      const code = url.searchParams.get('code');

      if (state !== expectedState) {
        finish(response, 400, 'State mismatch. You may close this tab.', () => {
          reject(new Error('OAuth state mismatch.'));
        });
      } else if (error) {
        finish(response, 400, 'Authorization denied. You may close this tab.', () => {
          reject(new Error(`Spotify authorization failed: ${error}`));
        });
      } else if (!code) {
        finish(response, 400, 'Missing code. You may close this tab.', () => {
          reject(new Error('Spotify callback did not include a code.'));
        });
      } else {
        finish(response, 200, 'Authorized. You may close this tab.', () => {
          resolve(code);
        });
      }
    });

    server.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    server.listen(PORT, HOST);
  });
}

export async function login() {
  const verifier = base64Url(randomBytes(64));
  const challenge = base64Url(
    createHash('sha256').update(verifier).digest(),
  );
  const state = base64Url(randomBytes(24));
  const callback = waitForCallback(state);
  const authorizeUrl = new URL(`${ACCOUNTS_URL}/authorize`);

  authorizeUrl.search = new URLSearchParams({
    response_type: 'code',
    client_id: clientId(),
    scope: SCOPES.join(' '),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    redirect_uri: REDIRECT_URI,
    state,
  });

  spawn('/usr/bin/open', [authorizeUrl.toString()], {
    detached: true,
    stdio: 'ignore',
  }).unref();

  const code = await callback;
  const token = await tokenRequest({
    client_id: clientId(),
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  }, 'Token exchange');

  if (!token.refresh_token) {
    throw new Error('Spotify did not return a refresh token.');
  }
  writeCredential('refresh-token', token.refresh_token);
  return token.access_token;
}

export async function accessToken() {
  const refreshToken = readCredential('refresh-token');
  if (!refreshToken) {
    throw new Error('Not authorized. Run the login command first.');
  }

  try {
    const token = await tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId(),
    }, 'Token refresh');

    if (token.refresh_token) {
      writeCredential('refresh-token', token.refresh_token);
    }
    return token.access_token;
  } catch (error) {
    if (String(error.message).includes('invalid_grant')) {
      deleteCredential('refresh-token');
    }
    throw error;
  }
}
