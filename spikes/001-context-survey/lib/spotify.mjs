const API_URL = 'https://api.spotify.com/v1';

export class SpotifyApiError extends Error {
  constructor(status, method, path, body) {
    const detail = body?.error?.message || body?.error_description ||
      body?.error || 'Unknown Spotify API error';
    super(`${method} ${path} failed (${status}): ${detail}`);
    this.name = 'SpotifyApiError';
    this.status = status;
    this.body = body;
  }
}

export async function apiRequest(token, path, options = {}) {
  const method = options.method || 'GET';
  const url = path.startsWith('http') ? path : `${API_URL}${path}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    ...options.headers,
  };
  let body;

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const startedAt = performance.now();
  const response = await fetch(url, { method, headers, body });
  const elapsedMs = Math.round(performance.now() - startedAt);
  const text = await response.text();
  let parsed = null;

  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }

  if (!response.ok) {
    throw new SpotifyApiError(response.status, method, path, parsed);
  }

  return {
    data: parsed,
    elapsedMs,
    status: response.status,
  };
}

export async function allPages(token, path, selectItems) {
  const items = [];
  const timings = [];
  let next = path;

  while (next) {
    const response = await apiRequest(token, next);
    items.push(...selectItems(response.data));
    timings.push(response.elapsedMs);
    next = response.data.next;
  }

  return { items, timings };
}
