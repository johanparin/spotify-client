import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

import {
  CLIENT_ID_ACCOUNT,
  deleteCredential,
  readCredential,
  REFRESH_TOKEN_ACCOUNT,
  writeCredential,
} from './keychain.js';

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

type Fetch = typeof globalThis.fetch;

export interface CredentialStore {
  delete(account: string): void;
  read(account: string): string | null;
  write(account: string, value: string): void;
}

interface TokenResponse {
  access_token?: unknown;
  error?: unknown;
  error_description?: unknown;
  refresh_token?: unknown;
}

export class SpotifyAuthError extends Error {
  readonly reason: string;
  readonly status: number | null;

  constructor(message: string, reason: string, status: number | null = null) {
    super(message);
    this.name = 'SpotifyAuthError';
    this.reason = reason;
    this.status = status;
  }

  get safeMessage(): string {
    if (this.reason === 'invalid_grant') {
      return 'Spotify authorization expired. Please authorize again.';
    }
    if (this.reason === 'not-authorized') {
      return 'Spotify authorization is required.';
    }
    return 'Spotify authorization failed.';
  }
}

export function base64Url(value: Uint8Array): string {
  return Buffer.from(value).toString('base64url');
}

const defaultStore: CredentialStore = {
  delete: deleteCredential,
  read: readCredential,
  write: writeCredential,
};

function openAuthorization(url: string): void {
  spawn('/usr/bin/open', [url], {
    detached: true,
    stdio: 'ignore',
  }).unref();
}

export function createAuthService({
  fetchImpl = globalThis.fetch,
  openUrl = openAuthorization,
  store = defaultStore,
}: {
  fetchImpl?: Fetch;
  openUrl?: (url: string) => void;
  store?: CredentialStore;
} = {}) {
  function clientId(): string {
    const value = store.read(CLIENT_ID_ACCOUNT);
    if (!value) {
      throw new SpotifyAuthError(
        'No Spotify client ID is configured.',
        'missing-client-id',
      );
    }
    return value;
  }

  async function tokenRequest(
    parameters: Record<string, string>,
  ): Promise<TokenResponse> {
    const response = await fetchImpl(`${ACCOUNTS_URL}/api/token`, {
      body: new URLSearchParams(parameters),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      method: 'POST',
    });
    let body: TokenResponse = {};
    try {
      body = await response.json() as TokenResponse;
    } catch {
      // A safe typed error below handles malformed token responses.
    }
    if (!response.ok) {
      const reason = typeof body.error === 'string'
        ? body.error
        : 'token-request-failed';
      throw new SpotifyAuthError(
        `Spotify token request failed (${response.status}).`,
        reason,
        response.status,
      );
    }
    return body;
  }

  function waitForCallback(expectedState: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const server = createServer((request, response) => {
        const url = new URL(request.url ?? '/', REDIRECT_URI);
        if (url.pathname !== '/callback') {
          response.writeHead(404).end();
          return;
        }

        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');
        const code = url.searchParams.get('code');
        let status = 200;
        let message = 'Authorized. You may close this tab.';
        let result: () => void = () => resolve(code as string);

        if (state !== expectedState) {
          status = 400;
          message = 'State mismatch. You may close this tab.';
          result = () => reject(new SpotifyAuthError(
            'OAuth state mismatch.',
            'state-mismatch',
          ));
        } else if (error) {
          status = 400;
          message = 'Authorization denied. You may close this tab.';
          result = () => reject(new SpotifyAuthError(
            'Spotify authorization was denied.',
            error,
          ));
        } else if (!code) {
          status = 400;
          message = 'Missing code. You may close this tab.';
          result = () => reject(new SpotifyAuthError(
            'Spotify callback did not include a code.',
            'missing-code',
          ));
        }

        response.writeHead(status, {
          'Content-Type': 'text/plain; charset=utf-8',
        });
        response.end(message);
        clearTimeout(timeout);
        server.close(result);
      });
      const timeout = setTimeout(() => {
        server.close();
        reject(new SpotifyAuthError(
          'Spotify authorization timed out after five minutes.',
          'timeout',
        ));
      }, 300_000);
      server.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      server.listen(PORT, HOST);
    });
  }

  async function login(): Promise<string> {
    const configuredClientId = clientId();
    const verifier = base64Url(randomBytes(64));
    const challenge = base64Url(
      createHash('sha256').update(verifier).digest(),
    );
    const state = base64Url(randomBytes(24));
    const callback = waitForCallback(state);
    const authorizeUrl = new URL(`${ACCOUNTS_URL}/authorize`);
    authorizeUrl.search = new URLSearchParams({
      client_id: configuredClientId,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: SCOPES.join(' '),
      state,
    }).toString();
    openUrl(authorizeUrl.toString());

    const token = await tokenRequest({
      client_id: configuredClientId,
      code: await callback,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
    });
    if (typeof token.refresh_token !== 'string') {
      throw new SpotifyAuthError(
        'Spotify did not return a refresh token.',
        'missing-refresh-token',
      );
    }
    if (typeof token.access_token !== 'string') {
      throw new SpotifyAuthError(
        'Spotify did not return an access token.',
        'missing-access-token',
      );
    }
    store.write(REFRESH_TOKEN_ACCOUNT, token.refresh_token);
    return token.access_token;
  }

  async function accessToken(): Promise<string> {
    const refreshToken = store.read(REFRESH_TOKEN_ACCOUNT);
    if (!refreshToken) {
      throw new SpotifyAuthError(
        'No Spotify refresh token is stored.',
        'not-authorized',
      );
    }

    try {
      const token = await tokenRequest({
        client_id: clientId(),
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });
      if (typeof token.refresh_token === 'string') {
        store.write(REFRESH_TOKEN_ACCOUNT, token.refresh_token);
      }
      if (typeof token.access_token !== 'string') {
        throw new SpotifyAuthError(
          'Spotify did not return an access token.',
          'missing-access-token',
        );
      }
      return token.access_token;
    } catch (error) {
      if (error instanceof SpotifyAuthError &&
        error.reason === 'invalid_grant') {
        store.delete(REFRESH_TOKEN_ACCOUNT);
      }
      throw error;
    }
  }

  return { accessToken, login };
}

const defaultAuth = createAuthService();

export const accessToken = defaultAuth.accessToken;
export const login = defaultAuth.login;
