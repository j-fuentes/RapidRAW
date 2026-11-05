// Tells the user once per start when the external server from the settings could not be used (this session then
// runs on this device).
import i18n from 'i18next';
import { toast } from 'react-toastify';
import { BackendError, remoteStartupProblem } from './backend';

// i18next's t (its typed key union does not take keys built at run time)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type T = (...args: any[]) => string;

export function describeBackendError(t: T, e: unknown): string {
  if (!(e instanceof BackendError)) return String(e);
  const text = t(`settings.backend.errors.${e.code}`);
  return e.detail && e.code !== 'auth' ? `${text} (${e.detail})` : text;
}

export function notifyBackendProblem() {
  const problem = remoteStartupProblem();
  if (!problem) return;
  // after the UI has loaded its settings (language) and its toast container
  setTimeout(() => {
    const t = i18n.t.bind(i18n) as unknown as T;
    toast.warn(t('settings.backend.fallback', { reason: describeBackendError(t, problem) }), { autoClose: 12000 });
  }, 3000);
}
