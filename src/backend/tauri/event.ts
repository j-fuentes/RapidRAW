// @tauri-apps/api/event for the UI: backend events from this app's backend or from the external server.
import * as tauri from '@tauri-apps/api/event';
import { emitLocal, on } from '../../remote/transport';
import { isRemoteBackend } from '../../remote/backend';

export * from '@tauri-apps/api/event';

// Window events (tauri://resize, drag & drop…) always come from this app
const remote = (event: string) => isRemoteBackend() && !event.startsWith('tauri://');

export async function listen<T>(
  event: string,
  handler: tauri.EventCallback<T>,
  options?: tauri.Options,
): Promise<tauri.UnlistenFn> {
  if (!remote(event)) return tauri.listen<T>(event, handler, options);
  return on(event, (payload) => handler({ event, id: 0, payload: payload as T }));
}

export async function once<T>(
  event: string,
  handler: tauri.EventCallback<T>,
  options?: tauri.Options,
): Promise<tauri.UnlistenFn> {
  if (!remote(event)) return tauri.once<T>(event, handler, options);
  const un = on(event, (payload) => {
    un();
    handler({ event, id: 0, payload: payload as T });
  });
  return un;
}

// Events emitted by the UI stay in the UI with the external server (its event bus is not reachable)
export async function emit<T>(event: string, payload?: T): Promise<void> {
  if (!remote(event)) return tauri.emit(event, payload);
  emitLocal(event, payload ?? null);
}
