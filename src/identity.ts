/** Who the server acts as: a personal API token, or the signed-in user (OIDC session token). */
import type { SpaceClient } from './space.js';

export interface TokenInfo {
  id: string;
  name: string;
  owner: 'account' | 'organization';
  accountId: string | null;
  organizationId: string;
  scopes: string[];
  spaces: 'all' | string[];
  role: string | null;
  expiresAt: string | null;
}

export type Identity =
  | { kind: 'token'; id?: string; token: TokenInfo }
  | { kind: 'session'; id?: string; email?: string; name?: string };

/**
 * Resolves the caller once per token kind (a session token rotates every few minutes, its user does not).
 * Session users come from the OIDC userinfo endpoint of `issuer` (uuid, email), their name from /settings
 * or, failing that, from the members of their spaces (done by the tools).
 */
export function makeIdentify(api: SpaceClient, opts: { issuer?: string; fetchFn?: typeof fetch } = {}): () => Promise<Identity> {
  const fetchFn = opts.fetchFn ?? globalThis.fetch;
  const cache = new Map<string, { identity: Promise<Identity>; until: number }>();
  const resolve = async (token: string): Promise<Identity> => {
    if (token.startsWith('tws_')) return { kind: 'token', id: undefined, token: await api.request<TokenInfo>('GET', '/tokens/self') };
    const out: Identity = { kind: 'session' };
    if (opts.issuer) {
      try {
        const base = opts.issuer.replace(/\/+$/, '');
        const conf = (await (await fetchFn(`${base}/.well-known/openid-configuration`)).json()) as { userinfo_endpoint?: string };
        if (conf.userinfo_endpoint) {
          const res = await fetchFn(conf.userinfo_endpoint, { headers: { authorization: `Bearer ${token}` } });
          if (res.ok) {
            const u = (await res.json()) as { uuid?: string; email?: string; name?: string };
            out.id = u.uuid;
            out.email = u.email;
            out.name = u.name;
          }
        }
      } catch {
        /* identity stays partial: tools still work, without "waiting on me" */
      }
    }
    if (!out.name) {
      const s = await api.request<{ displayName: string | null }>('GET', '/settings').catch(() => undefined);
      if (s?.displayName) out.name = s.displayName;
    }
    return out;
  };
  return async () => {
    const token = await api.token();
    const kind = token.startsWith('tws_') ? `tws:${token.slice(-8)}` : 'session';
    const hit = cache.get(kind);
    if (hit && hit.until > Date.now()) return hit.identity;
    const p = resolve(token).then((id) => {
      if (id.kind === 'token') id.id = id.token.accountId ?? undefined;
      // A session user whose userinfo failed is asked again a minute later, not kept partial for good.
      if (id.kind === 'session' && !id.id) cache.set(kind, { identity: p, until: Date.now() + 60_000 });
      return id;
    });
    cache.set(kind, { identity: p, until: Number.POSITIVE_INFINITY });
    p.catch(() => cache.delete(kind));
    return p;
  };
}
