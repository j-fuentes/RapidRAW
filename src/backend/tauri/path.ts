// @tauri-apps/api/path for the UI: with the external server, the home folder is the server's.
import * as tauri from '@tauri-apps/api/path';
import { call } from '../../remote/transport';
import { isRemoteBackend } from '../../remote/backend';

export * from '@tauri-apps/api/path';

export async function homeDir(): Promise<string> {
  return isRemoteBackend() ? call<string>('__rr_home') : tauri.homeDir();
}
