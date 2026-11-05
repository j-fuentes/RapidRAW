// Which backend the UI talks to (Settings → Backend):
//  - local: the Rust backend of this app, over Tauri's IPC (as always; works offline)
//  - remote: a rapidraw-web server (relay + bridge, e.g. RapidRAW Web on a computer with a GPU), over a WebSocket.
//    The UI then works like RapidRAW Web in a browser: every invoke() and event goes to RapidRAW on the server,
//    file dialogs show the server's folders, images come from the server.
// The choice is made once per start (main.tsx calls initBackend() before the UI loads); changing it reloads the UI.
// src/backend/tauri/* route @tauri-apps/* calls by isRemoteBackend(); vite.config.mjs points the UI's imports there.
import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { start } from './transport';

export type BackendMode = 'local' | 'remote';
export interface BackendConfig {
  mode: BackendMode;
  url: string;
  user: string;
  password: string;
}
export interface ServerInfo {
  url: string;
  protocol: number;
  rapidraw: string;
}
export type BackendErrorCode =
  'url' | 'insecure' | 'unreachable' | 'auth' | 'notRapidraw' | 'protocol' | 'version' | 'noBridge';
export class BackendError extends Error {
  constructor(
    public code: BackendErrorCode,
    public detail: string = '',
  ) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

/** Protocol of rapidraw-web's /ipc this app speaks (rrweb/relay/relay.mjs: PROTOCOL). */
export const REMOTE_PROTOCOL = 1;
export const DEFAULT_BACKEND_CONFIG: BackendConfig = { mode: 'local', url: '', user: '', password: '' };

let active: { base: string; token: string; host: string } | null = null;
let startupProblem: BackendError | null = null;

export const isRemoteBackend = () => active !== null;
export const remoteHost = () => active?.host ?? '';
/** Why the external server configured in the settings isn't used in this session (null: it is, or local mode). */
export const remoteStartupProblem = () => startupProblem;

/** Android-only paths of the UI (gallery, the app's library folder, content:// URIs) need Android's backend. */
export const usesAndroidBackend = (osPlatform: string) => osPlatform === 'android' && !isRemoteBackend();

/** URL of a file on the server (rapidraw-web's /files serves the photo folders and RapidRAW's thumbnails). */
export function remoteFileUrl(path: string) {
  return `${active!.base}/files?path=${encodeURIComponent(path)}&rr_auth=${encodeURIComponent(active!.token)}`;
}

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const tokenOf = (cfg: BackendConfig) => (cfg.user || cfg.password ? b64(`${cfg.user}:${cfg.password}`) : '');

/** "rapidraw.example.net" → "https://rapidraw.example.net"; no trailing slash. Throws BackendError('url'). */
export function normalizeServerUrl(raw: string): string {
  let s = raw.trim();
  if (!s) throw new BackendError('url');
  if (!/^[a-z]+:\/\//i.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new BackendError('url', raw);
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new BackendError('url', raw);
  // The app's page is a secure context: a WebView refuses plain ws:// / http:// to other computers (mixed content,
  // and Android allows no cleartext). Only this computer itself is allowed without TLS.
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.protocol === 'http:' && !loopback) throw new BackendError('insecure', raw);
  return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`;
}

const baseVersion = (v: string) => v.split(/[+-]/)[0].trim();

/** Checks that `cfg` points at a compatible rapidraw-web server and the credentials work. */
export async function checkServer(cfg: BackendConfig, timeoutMs = 8000): Promise<ServerInfo> {
  const base = normalizeServerUrl(cfg.url);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${base}/rr/version?rr_auth=${encodeURIComponent(tokenOf(cfg))}`, {
      cache: 'no-store',
      signal: ctl.signal,
    });
  } catch (e) {
    throw new BackendError('unreachable', ctl.signal.aborted ? 'timeout' : String(e));
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 || res.status === 403) throw new BackendError('auth');
  let info: { app?: string; protocol?: number; rapidraw?: string | null; bridge?: boolean };
  try {
    info = await res.json();
  } catch {
    // an older rapidraw-web (without /rr/version) answers with its web page
    throw new BackendError('notRapidraw', `HTTP ${res.status}`);
  }
  if (!res.ok || info?.app !== 'rapidraw-web') throw new BackendError('notRapidraw', `HTTP ${res.status}`);
  if (info.protocol !== REMOTE_PROTOCOL)
    throw new BackendError('protocol', `${info.protocol ?? '?'} ≠ ${REMOTE_PROTOCOL}`);
  if (!info.bridge || !info.rapidraw) throw new BackendError('noBridge');
  const mine = await getVersion().catch(() => '');
  if (mine && baseVersion(info.rapidraw) !== baseVersion(mine)) {
    throw new BackendError('version', `${info.rapidraw} ≠ ${mine}`);
  }
  return { url: base, protocol: info.protocol, rapidraw: info.rapidraw };
}

export const loadBackendConfig = async (): Promise<BackendConfig> => ({
  ...DEFAULT_BACKEND_CONFIG,
  ...(await tauriInvoke<Partial<BackendConfig>>('get_backend_config')),
});
export const saveBackendConfig = (config: BackendConfig) => tauriInvoke('set_backend_config', { config });

/** Called once before the UI loads: decides the backend of this session. Never throws. */
export async function initBackend(): Promise<void> {
  let cfg: BackendConfig;
  try {
    cfg = await loadBackendConfig();
  } catch (e) {
    console.error('Could not read the backend settings, using this device:', e);
    return;
  }
  if (cfg.mode !== 'remote') return;
  try {
    const info = await checkServer(cfg);
    const host = new URL(info.url).host;
    active = { base: info.url, token: tokenOf(cfg), host };
    start(active.base, active.token);
    // The window is shown by the local backend (desktop: it starts hidden until the UI is ready)
    tauriInvoke('frontend_ready').catch(() => {});
    const { mountRemoteExtras } = await import('./extras');
    mountRemoteExtras(host);
    console.info(`Backend: external server ${info.url} (RapidRAW ${info.rapidraw})`);
  } catch (e) {
    active = null;
    startupProblem = e instanceof BackendError ? e : new BackendError('unreachable', String(e));
    console.warn('External server not usable, using this device:', startupProblem.message);
  }
}
