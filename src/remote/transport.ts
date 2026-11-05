// The external server backend (Settings → Backend): one WebSocket connection to a rapidraw-web relay, which passes
// every invoke() to RapidRAW running on the server and sends its events back. Binary answers: [u32 LE id][payload].
//
// Taken from rapidraw-web (rrweb/shim/transport.ts, same protocol, keep both in step). Differences: the server and
// credentials come from the backend settings (backend.ts) instead of the page's own address, the connection opens
// on start() instead of on import, and the credentials travel as ?rr_auth=… (a WebView can't add Basic auth to a
// WebSocket).
/* eslint-disable @typescript-eslint/no-explicit-any */
type Pending = {
  res: (v: any) => void;
  rej: (e: any) => void;
  cmd: string;
  t0: number;
  frame: string;
  sent: boolean;
  tries: number;
};
type Handler = (payload: unknown) => void;

let url = '';
const pending = new Map<number, Pending>();
const handlers = new Map<string, Set<Handler>>();
const queue: number[] = []; // ids of calls waiting for the connection
// duration and size of answers
const timings = new Set<(cmd: string, ms: number, bytes: number) => void>();
export const onTiming = (fn: (cmd: string, ms: number, bytes: number) => void) => timings.add(fn);
const done = (p: Pending, bytes: number) => timings.forEach((fn) => fn(p.cmd, performance.now() - p.t0, bytes));
// start of a call (progress.ts: opening a photo, thumbnail paths; adjust.ts: processing changes); result must not
// be left unhandled
type Start = (cmd: string, args: unknown, result: Promise<unknown>, id: number) => void;
const starts = new Set<Start>();
export const onCall = (fn: Start) => starts.add(fn);
let ws: WebSocket | null = null;
let seq = 0;
let backoff = 250;

// A connection can die silently (TCP without any answer: Wi-Fi, mobile data, sleep…), and the WebView notices only
// after a few minutes. So: when nothing arrives for a while, __rr_ping; if that gets no answer either, a new
// connection. Sent calls that are safe to repeat go to the new connection, the others fail.
const IDLE_MS = 5000;
const STALL_MS = 25000;
const RETRY =
  /^(load_|list_|get_|read_|generate_)|^(apply_adjustments|update_thumbnail_queue)$|^__rr_(progress|thumbs|thumbs_summary|view|ping|home|share_caps|share_list|share_have)$/;
let lastRecv = 0;
let pingAt = 0;
// last event received: after a reconnect the relay replays the ones missed meanwhile
let lastSeq = 0;
let lastBoot = '';
let online = true;
const stateFns = new Set<(online: boolean) => void>();
export const onConnection = (fn: (online: boolean) => void) => {
  stateFns.add(fn);
  fn(online);
};
const setOnline = (v: boolean) => {
  if (v !== online) {
    online = v;
    stateFns.forEach((fn) => fn(v));
  }
};

function send(p: Pending) {
  ws!.send(p.frame);
  p.sent = true;
}

function lost() {
  for (const [id, p] of pending) {
    if (!p.sent) continue; // still queued: it goes as soon as the connection opens
    if (RETRY.test(p.cmd) && p.tries < 2) {
      p.tries++;
      p.sent = false;
      queue.push(id);
      continue;
    }
    pending.delete(id);
    p.rej('Connection to the RapidRAW server lost');
  }
}

function watchdog() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const now = Date.now();
  if (pingAt && lastRecv >= pingAt) pingAt = 0;
  if (pingAt && now - pingAt > 3000) setOnline(false);
  if (pingAt && now - pingAt > STALL_MS) {
    const dead = ws;
    dead.onclose = dead.onmessage = null;
    try {
      dead.close();
    } catch {
      /* already closed */
    }
    console.warn('remote backend: no answer from the server, reconnecting');
    lost();
    connect();
    return;
  }
  if (!pingAt && now - lastRecv > IDLE_MS) {
    pingAt = now;
    ws.send(JSON.stringify({ id: 0, cmd: '__rr_ping', args: {} }));
  }
}

function connect() {
  const sock = new WebSocket(lastSeq ? `${url}&seq=${lastSeq}&boot=${encodeURIComponent(lastBoot)}` : url);
  ws = sock;
  sock.binaryType = 'arraybuffer';
  sock.onopen = () => {
    backoff = 250;
    lastRecv = Date.now();
    pingAt = 0;
    setOnline(true);
    for (const id of queue.splice(0)) {
      const p = pending.get(id);
      if (p && !p.sent) send(p);
    }
  };
  sock.onmessage = (m) => {
    lastRecv = Date.now();
    setOnline(true);
    if (m.data instanceof ArrayBuffer) {
      const id = new DataView(m.data).getUint32(0, true);
      const p = pending.get(id);
      pending.delete(id);
      if (p) {
        done(p, m.data.byteLength - 4);
        p.res(m.data.slice(4));
      }
      return;
    }
    const msg = JSON.parse(m.data);
    if (msg.event !== undefined) {
      if (typeof msg.seq === 'number') {
        lastSeq = msg.seq;
        lastBoot = msg.boot ?? '';
      }
      handlers.get(msg.event)?.forEach((h) => h(msg.payload));
      return;
    }
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (!p) return;
    done(p, m.data.length);
    if ('error' in msg) p.rej(msg.error);
    else p.res(msg.result);
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    setOnline(false);
    lost();
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 5000);
  };
}

/** Opens the connection to the relay at `base` (https://host[:port]); `token` = base64(user:pass) or ''. */
export function start(base: string, token: string) {
  if (ws) return;
  url = `${base.replace(/^http/, 'ws')}/ipc?rr_auth=${encodeURIComponent(token)}`;
  connect();
  setInterval(watchdog, 2000);
}

export function call<T>(cmd: string, args: unknown = {}): Promise<T> {
  seq = (seq + 1) >>> 0 || 1;
  const id = seq;
  const frame = JSON.stringify({ id, cmd, args });
  const result = new Promise<T>((res, rej) => {
    const p: Pending = { res, rej, cmd, t0: performance.now(), frame, sent: false, tries: 0 };
    pending.set(id, p);
    if (ws?.readyState === WebSocket.OPEN) send(p);
    else queue.push(id);
  });
  starts.forEach((fn) => {
    try {
      fn(cmd, args, result, id);
    } catch {
      /* an observer must not break the call */
    }
  });
  return result;
}

// An event as if it came from the backend
export function emitLocal(event: string, payload: unknown = null) {
  handlers.get(event)?.forEach((h) => h(payload));
}

export function on(event: string, h: Handler): () => void {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event)!.add(h);
  return () => {
    handlers.get(event)?.delete(h);
  };
}
