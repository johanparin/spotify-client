const API_URL = 'https://api.spotify.com/v1';

type Fetch = typeof globalThis.fetch;

export interface ApiRequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  method?: string;
}

export interface ApiResponse<T> {
  data: T | null;
  elapsedMs: number;
  status: number;
}

export class SpotifyApiError extends Error {
  readonly body: unknown;
  readonly method: string;
  readonly path: string;
  readonly retryAfterSeconds: number | null;
  readonly status: number;

  constructor(
    status: number,
    method: string,
    path: string,
    body: unknown,
    retryAfter: string | null = null,
  ) {
    super(`Spotify request failed (${status}).`);
    this.name = 'SpotifyApiError';
    this.status = status;
    this.method = method;
    this.path = path;
    this.body = body;
    const seconds = retryAfter === null ? Number.NaN : Number(retryAfter);
    this.retryAfterSeconds = Number.isFinite(seconds) && seconds >= 0
      ? seconds
      : null;
  }

  get safeMessage(): string {
    if (this.status === 401) return 'Spotify authorization has expired.';
    if (this.status === 403) return 'Spotify denied this operation.';
    if (this.status === 429) {
      return 'Spotify is temporarily rate limiting requests.';
    }
    return 'Spotify could not complete the request.';
  }
}

function parseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

export function createApiClient(fetchImpl: Fetch = globalThis.fetch) {
  async function request<T = unknown>(
    token: string,
    path: string,
    options: ApiRequestOptions = {},
  ): Promise<ApiResponse<T>> {
    const method = options.method ?? 'GET';
    const url = path.startsWith('http') ? path : `${API_URL}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    };
    let body: string | undefined;

    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    const startedAt = performance.now();
    const response = await fetchImpl(url, { body, headers, method });
    const elapsedMs = Math.round(performance.now() - startedAt);
    const parsed = parseBody(await response.text());

    if (!response.ok) {
      throw new SpotifyApiError(
        response.status,
        method,
        path,
        parsed,
        response.headers.get('Retry-After'),
      );
    }

    return {
      data: parsed as T | null,
      elapsedMs,
      status: response.status,
    };
  }

  return { request };
}

const defaultClient = createApiClient();

export const apiRequest = defaultClient.request;

export async function allPages<TPage, TItem>(
  token: string,
  path: string,
  selectItems: (data: TPage) => TItem[],
  request = apiRequest,
): Promise<{ items: TItem[]; timings: number[] }> {
  const items: TItem[] = [];
  const timings: number[] = [];
  let next: string | null = path;

  while (next) {
    const response = await request<TPage>(token, next);
    if (response.data === null) break;
    items.push(...selectItems(response.data));
    timings.push(response.elapsedMs);
    const page = response.data as TPage & { next?: unknown };
    next = typeof page.next === 'string' ? page.next : null;
  }

  return { items, timings };
}
