/** HTTP client of the Twake Space backend API (docs/api.md of linagora/twake-space). */
import { readFile, stat } from 'node:fs/promises';

export interface TokenSource {
  getToken(): Promise<string>;
  invalidate(): void;
}

/** API token (tws_…) read from a private file at each call, so a rotated token is picked up. */
export function fileTokenSource(file: string): TokenSource {
  return {
    async getToken() {
      const st = await stat(file);
      if (st.mode & 0o077) throw new Error(`${file} must not be readable by other users (chmod 0600)`);
      const token = (await readFile(file, 'utf8')).trim();
      if (!token) throw new Error(`${file} is empty`);
      return token;
    },
    invalidate() {},
  };
}

/** Routes that the backend reserves to signed-in sessions: an API token never gets them. */
const SESSION_ONLY = [
  /^\/feed\/unread/,
  /\/feed\/read$/,
  /\/reactions\//,
  /\/(vote|decision|answer|acknowledgement)$/,
  /\/meetings$/,
  /^\/notifications\/(read|[^/]+\/read)$/,
  /^\/settings$/,
  /\/(pin|opened)$/,
];

export class SpaceError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly hint?: string,
  ) {
    super(message);
  }
}

function hintFor(status: number, code: string, path: string, headers: Headers): string | undefined {
  if (status === 401) return 'The API token is invalid, expired or revoked: create a new one in Twake Space (Settings > API tokens).';
  if (code === 'insufficient_scope') {
    const scope = /scope="([^"]+)"/.exec(headers.get('www-authenticate') ?? '')?.[1];
    if (scope) return `The API token lacks the "${scope}" scope: create a token with it in Twake Space (Settings > API tokens).`;
    if (SESSION_ONLY.some((re) => re.test(path))) return 'Twake Space keeps this action for a signed-in session: no API token can do it.';
    return 'The API token is not allowed to do this.';
  }
  if (status === 429) return `Rate limited by Twake Space: retry in ${headers.get('retry-after') ?? 'a few'} s.`;
  if (status === 404) return 'Not found, or not reachable with this token (check the space and the item id).';
  if (code === 'cannot_post') return 'Viewers cannot post in this space: an editor or admin role is needed.';
  if (code === 'not_author') return 'Only the author of the post can do this.';
  if (code === 'not_space_admin') return 'Only an admin of the space can do this.';
  if (code === 'not_space_manager') return 'Only a manager of the space (its admin or an organization admin) can do this.';
  return undefined;
}

export class SpaceClient {
  constructor(
    private readonly config: { apiUrl: string; timeoutMs: number },
    private readonly tokens: TokenSource,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  /** The current access token, to tell an API token (tws_…) from a session token. Never log it. */
  token(): Promise<string> {
    return this.tokens.getToken();
  }

  async request<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    opts: { query?: Record<string, string | number | boolean | undefined>; body?: unknown } = {},
  ): Promise<T> {
    const url = new URL(this.config.apiUrl + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    for (let attempt = 0; ; attempt++) {
      const headers: Record<string, string> = { authorization: `Bearer ${await this.tokens.getToken()}`, accept: 'application/json' };
      if (opts.body !== undefined) headers['content-type'] = 'application/json';
      const res = await this.fetchFn(url.toString(), {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
      if (res.status === 401 && attempt === 0) {
        this.tokens.invalidate();
        continue;
      }
      if (res.status === 204) return undefined as T;
      const text = await res.text();
      let data: unknown = undefined;
      try {
        data = text ? JSON.parse(text) : undefined;
      } catch {
        data = text;
      }
      if (res.ok) return data as T;
      const body = (data && typeof data === 'object' ? data : {}) as { error?: string; message?: string };
      const code = body.error ?? `http_${res.status}`;
      const message = `${method} ${path}: HTTP ${res.status} ${code}${body.message ? ` (${body.message})` : ''}`;
      throw new SpaceError(message, res.status, code, hintFor(res.status, code, path, res.headers));
    }
  }
}
