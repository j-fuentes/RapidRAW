// @tauri-apps/plugin-dialog for the UI: with the external server, files and folders are chosen on the server
// (rapidraw-web's picker over its photo folders); messages and questions stay native.
import * as tauri from '@tauri-apps/plugin-dialog';
import { isRemoteBackend } from '../../remote/backend';

export * from '@tauri-apps/plugin-dialog';

const exts = (filters?: tauri.DialogFilter[]) => filters?.flatMap((f) => f.extensions);

export async function open<T extends tauri.OpenDialogOptions>(options?: T): Promise<tauri.OpenDialogReturn<T>> {
  if (!isRemoteBackend()) return tauri.open(options);
  const { pick } = await import('../../remote/picker');
  return (await pick({
    mode: options?.directory ? 'dir' : 'file',
    multiple: options?.multiple,
    title: options?.title,
    defaultPath: options?.defaultPath,
    extensions: exts(options?.filters),
  })) as tauri.OpenDialogReturn<T>;
}

export async function save(options?: tauri.SaveDialogOptions): Promise<string | null> {
  if (!isRemoteBackend()) return tauri.save(options);
  const { pick } = await import('../../remote/picker');
  return (await pick({
    mode: 'save',
    title: options?.title,
    defaultPath: options?.defaultPath,
    extensions: exts(options?.filters),
  })) as string | null;
}
