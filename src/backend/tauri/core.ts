// @tauri-apps/api/core for the UI (vite.config.mjs points src/'s imports here): Tauri's IPC to this app's backend,
// or the external server (src/remote/backend.ts), chosen at start.
import * as tauri from '@tauri-apps/api/core';
import { call, on } from '../../remote/transport';
import { isRemoteBackend, remoteFileUrl } from '../../remote/backend';

export * from '@tauri-apps/api/core';

// Always this app's own backend: the window, its logs, plugins (dialog, clerk, os…) and the backend choice itself
const LOCAL = new Set(['frontend_ready', 'frontend_log', 'get_backend_config', 'set_backend_config']);
export const isLocalCommand = (cmd: string) => LOCAL.has(cmd) || cmd.startsWith('plugin:');

export function invoke<T>(cmd: string, args?: tauri.InvokeArgs, options?: tauri.InvokeOptions): Promise<T> {
  if (!isRemoteBackend() || isLocalCommand(cmd)) return tauri.invoke<T>(cmd, args, options);
  return call<T>(cmd, args ?? {});
}

export function convertFileSrc(filePath: string, protocol?: string): string {
  return isRemoteBackend() ? remoteFileUrl(filePath) : tauri.convertFileSrc(filePath, protocol);
}

// A Channel over the relay (as in rapidraw-web's rrweb/shim/core.ts): the argument travels as { __rrChannel: id },
// the bridge creates a real Channel for it and sends each message back as the event "__rrch:<id>" (binary data
// base64-encoded).
let channelSeq = 0;
const fromWire = (p: unknown): unknown => {
  if (p && typeof p === 'object' && typeof (p as { __rrb64?: unknown }).__rrb64 === 'string') {
    const s = atob((p as { __rrb64: string }).__rrb64);
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes.buffer;
  }
  return p;
};
class RemoteChannel<T = unknown> {
  readonly id = `${Date.now().toString(36)}-${++channelSeq}`;
  #onmessage: (response: T) => void = () => {};
  constructor(onmessage?: (response: T) => void) {
    if (onmessage) this.#onmessage = onmessage;
    on(`__rrch:${this.id}`, (payload) => this.#onmessage(fromWire(payload) as T));
  }
  set onmessage(handler: (response: T) => void) {
    this.#onmessage = handler;
  }
  get onmessage() {
    return this.#onmessage;
  }
  toJSON() {
    return { __rrChannel: this.id };
  }
}

export class Channel<T = unknown> {
  constructor(onmessage?: (response: T) => void) {
    return (isRemoteBackend()
      ? new RemoteChannel<T>(onmessage)
      : new tauri.Channel<T>(onmessage)) as unknown as Channel<T>;
  }
}
