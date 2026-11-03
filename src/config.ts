export interface Config {
  /** Twake Space web app, used for "open in Twake Space" links, e.g. https://space.example.com */
  appUrl: string;
  /** Backend API base URL, default <appUrl>/api */
  apiUrl: string;
  auth: { kind: 'file'; file: string } | { kind: 'command'; command: string } | { kind: 'static'; token: string };
  /** OIDC issuer, to know the signed-in user (userinfo) when the token is a session token. */
  oidcIssuer?: string;
  /** elicit: the server asks the user to approve every write; client: the MCP client does it. */
  approval: 'elicit' | 'client';
  approvalTimeoutMs: number;
  language: 'en' | 'fr';
  timeZone: string;
  timeoutMs: number;
}

function httpsUrl(name: string, raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error(`${name} must use HTTPS (only localhost may use HTTP)`);
  }
  return url;
}

function positive(name: string, raw: string | undefined, fallback: number): number {
  const n = Number(raw ?? fallback);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive number`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (!env.TWAKE_SPACE_URL) throw new Error('TWAKE_SPACE_URL is required (e.g. https://space.example.com)');
  const app = httpsUrl('TWAKE_SPACE_URL', env.TWAKE_SPACE_URL);
  const appUrl = `${app.origin}${app.pathname}`.replace(/\/+$/, '');
  const apiUrl = env.TWAKE_SPACE_API_URL ? httpsUrl('TWAKE_SPACE_API_URL', env.TWAKE_SPACE_API_URL).href.replace(/\/+$/, '') : `${appUrl}/api`;
  let auth: Config['auth'];
  if (env.TWAKE_SPACE_TOKEN_FILE) auth = { kind: 'file', file: env.TWAKE_SPACE_TOKEN_FILE };
  else if (env.TWAKE_SPACE_TOKEN_COMMAND) auth = { kind: 'command', command: env.TWAKE_SPACE_TOKEN_COMMAND };
  else if (env.TWAKE_SPACE_TOKEN) auth = { kind: 'static', token: env.TWAKE_SPACE_TOKEN };
  else throw new Error('Set TWAKE_SPACE_TOKEN_FILE (a 0600 file holding an API token tws_…), TWAKE_SPACE_TOKEN_COMMAND or TWAKE_SPACE_TOKEN');
  const approval = (env.TWAKE_SPACE_APPROVAL ?? 'elicit').toLowerCase();
  if (approval !== 'elicit' && approval !== 'client') throw new Error('TWAKE_SPACE_APPROVAL must be elicit (default) or client');
  const lang = (env.TWAKE_SPACE_LANGUAGE ?? env.USER_LANGUAGE ?? 'en').toLowerCase().slice(0, 2);
  const timeZone = env.USER_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    throw new Error(`USER_TIMEZONE must be an IANA time zone such as Europe/Paris, not "${timeZone}"`);
  }
  return {
    appUrl,
    apiUrl,
    auth,
    oidcIssuer: env.TWAKE_SPACE_OIDC_ISSUER ? httpsUrl('TWAKE_SPACE_OIDC_ISSUER', env.TWAKE_SPACE_OIDC_ISSUER).href : undefined,
    approval,
    approvalTimeoutMs: positive('TWAKE_SPACE_APPROVAL_TIMEOUT_MS', env.TWAKE_SPACE_APPROVAL_TIMEOUT_MS, 600_000),
    language: lang === 'fr' ? 'fr' : 'en',
    timeZone,
    timeoutMs: positive('TWAKE_SPACE_TIMEOUT_MS', env.TWAKE_SPACE_TIMEOUT_MS, 30000),
  };
}
