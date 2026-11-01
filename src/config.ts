export interface Config {
  /** Twake Space web app, used for "open in Twake Space" links, e.g. https://space.example.com */
  appUrl: string;
  /** Backend API base URL, default <appUrl>/api */
  apiUrl: string;
  auth: { kind: 'file'; file: string } | { kind: 'command'; command: string } | { kind: 'static'; token: string };
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
  const timeoutMs = Number(env.TWAKE_SPACE_TIMEOUT_MS ?? 30000);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('TWAKE_SPACE_TIMEOUT_MS must be a positive number');
  return {
    appUrl,
    apiUrl,
    auth,
    timeZone: env.USER_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone,
    timeoutMs,
  };
}
