import assert from 'node:assert/strict';
import test from 'node:test';

import {
  allPages,
  createApiClient,
  SpotifyApiError,
} from '../src/spotify/api.js';
import {
  createAuthService,
  type CredentialStore,
  SpotifyAuthError,
} from '../src/spotify/auth.js';

function response(
  body: string | null,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(body, { headers, status });
}

test('API transport parses JSON success and sends JSON bodies', async () => {
  let request: RequestInit | undefined;
  const client = createApiClient(async (_url, init) => {
    request = init;
    return response('{"ok":true}');
  });
  const result = await client.request<{ ok: boolean }>('secret', '/test', {
    body: { value: 1 },
    method: 'PUT',
  });

  assert.deepEqual(result.data, { ok: true });
  assert.equal(result.status, 200);
  assert.equal(request?.body, '{"value":1}');
  assert.equal(
    (request?.headers as Record<string, string>).Authorization,
    'Bearer secret',
  );
});

test('API transport handles a 204 response', async () => {
  const client = createApiClient(async () => response(null, 204));
  const result = await client.request('secret', '/pause');
  assert.equal(result.data, null);
  assert.equal(result.status, 204);
});

for (const status of [401, 403]) {
  test(`API transport retains ${status} metadata safely`, async () => {
    const client = createApiClient(async () => response(
      '{"error":{"message":"private detail"}}',
      status,
    ));
    await assert.rejects(client.request('secret', '/test'), (error) => {
      assert.ok(error instanceof SpotifyApiError);
      assert.equal(error.status, status);
      assert.doesNotMatch(error.message, /private detail|secret/);
      return true;
    });
  });
}

test('API errors retain non-JSON bodies without exposing them', async () => {
  const client = createApiClient(async () => response('upstream text', 500));
  await assert.rejects(client.request('secret', '/test'), (error) => {
    assert.ok(error instanceof SpotifyApiError);
    assert.deepEqual(error.body, { raw: 'upstream text' });
    assert.doesNotMatch(error.message, /upstream text|secret/);
    return true;
  });
});

test('API transport captures Retry-After on rate limits', async () => {
  const client = createApiClient(async () => response('', 429, {
    'Retry-After': '7',
  }));
  await assert.rejects(client.request('secret', '/test'), (error) => {
    assert.ok(error instanceof SpotifyApiError);
    assert.equal(error.retryAfterSeconds, 7);
    return true;
  });
});

test('pagination follows absolute next links', async () => {
  const paths: string[] = [];
  const requester = async <T>(_token: string, path: string) => {
    paths.push(path);
    const data = path === '/first'
      ? { items: ['a'], next: 'https://api.spotify.com/v1/second' }
      : { items: ['b'], next: null };
    return { data: data as T, elapsedMs: 2, status: 200 };
  };
  const result = await allPages(
    'secret',
    '/first',
    (page: { items: string[] }) => page.items,
    requester,
  );
  assert.deepEqual(result, { items: ['a', 'b'], timings: [2, 2] });
  assert.deepEqual(paths, [
    '/first',
    'https://api.spotify.com/v1/second',
  ]);
});

function memoryStore(values: Record<string, string>): {
  deleted: string[];
  store: CredentialStore;
  values: Record<string, string>;
} {
  const deleted: string[] = [];
  return {
    deleted,
    store: {
      delete(account) {
        deleted.push(account);
        delete values[account];
      },
      read: (account) => values[account] ?? null,
      write: (account, value) => {
        values[account] = value;
      },
    },
    values,
  };
}

test('token refresh persists a rotated refresh token', async () => {
  const memory = memoryStore({
    'client-id': 'client',
    'refresh-token': 'old-refresh',
  });
  const auth = createAuthService({
    fetchImpl: async () => response(JSON.stringify({
      access_token: 'access',
      refresh_token: 'new-refresh',
    })),
    store: memory.store,
  });
  assert.equal(await auth.accessToken(), 'access');
  assert.equal(memory.values['refresh-token'], 'new-refresh');
});

test('invalid_grant removes unusable authorization', async () => {
  const memory = memoryStore({
    'client-id': 'client',
    'refresh-token': 'expired',
  });
  const auth = createAuthService({
    fetchImpl: async () => response('{"error":"invalid_grant"}', 400),
    store: memory.store,
  });
  await assert.rejects(auth.accessToken(), (error) => {
    assert.ok(error instanceof SpotifyAuthError);
    assert.equal(error.reason, 'invalid_grant');
    assert.doesNotMatch(error.message, /expired/);
    return true;
  });
  assert.deepEqual(memory.deleted, ['refresh-token']);
});
