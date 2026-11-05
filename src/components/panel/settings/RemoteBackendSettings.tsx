import { ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Check, Laptop, Server, Wifi, WifiOff } from 'lucide-react';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import Text from '../../ui/Text';
import { TextColors, TextVariants } from '../../../types/typography';
import {
  BackendConfig,
  BackendMode,
  checkServer,
  DEFAULT_BACKEND_CONFIG,
  isRemoteBackend,
  loadBackendConfig,
  remoteHost,
  remoteStartupProblem,
  saveBackendConfig,
  ServerInfo,
} from '../../../remote/backend';
import { describeBackendError } from '../../../remote/notice';

type Status =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'connected'; info: ServerInfo }
  | { kind: 'saved' }
  | { kind: 'error'; message: string };

function Item({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  return (
    <div>
      <Text variant={TextVariants.heading} className="block mb-2">
        {label}
      </Text>
      {children}
      {description && (
        <Text variant={TextVariants.small} className="mt-2">
          {description}
        </Text>
      )}
    </div>
  );
}

// Settings → Backend: this device, or an external rapidraw-web server (src/remote/backend.ts)
export default function RemoteBackendSettings() {
  const { t } = useTranslation();
  const [saved, setSaved] = useState<BackendConfig | null>(null);
  const [cfg, setCfg] = useState<BackendConfig>(DEFAULT_BACKEND_CONFIG);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  useEffect(() => {
    loadBackendConfig()
      .then((c) => {
        setSaved(c);
        setCfg(c);
      })
      .catch((e) => {
        setSaved(DEFAULT_BACKEND_CONFIG);
        setStatus({ kind: 'error', message: String(e) });
      });
  }, []);

  if (!saved) return null;

  const update = (patch: Partial<BackendConfig>) => {
    setCfg((c) => ({ ...c, ...patch }));
    setStatus({ kind: 'idle' });
  };
  const isBusy = status.kind === 'busy';
  const remote = cfg.mode === 'remote';
  const changed = JSON.stringify(cfg) !== JSON.stringify(saved);
  const startupProblem = remoteStartupProblem();

  const test = async () => {
    setStatus({ kind: 'busy' });
    try {
      setStatus({ kind: 'connected', info: await checkServer(cfg) });
    } catch (e) {
      setStatus({ kind: 'error', message: describeBackendError(t, e) });
    }
  };

  // The UI keeps the backend for the whole session: a new choice takes effect with a reload
  const saveAndReload = async () => {
    setStatus({ kind: 'busy' });
    try {
      const next = { ...cfg };
      if (remote) next.url = (await checkServer(cfg)).url;
      await saveBackendConfig(next);
      setStatus({ kind: 'saved' });
      setTimeout(() => window.location.reload(), 400);
    } catch (e) {
      setStatus({ kind: 'error', message: describeBackendError(t, e) });
    }
  };

  const modes: { id: BackendMode; label: string; icon: typeof Laptop }[] = [
    { id: 'local', label: t('settings.backend.modeLocal'), icon: Laptop },
    { id: 'remote', label: t('settings.backend.modeRemote'), icon: Server },
  ];

  return (
    <div className="p-6 bg-surface rounded-xl shadow-md">
      <Text variant={TextVariants.title} color={TextColors.accent} className="mb-5">
        {t('settings.backend.title')}
      </Text>
      <Text className="mb-4">{t('settings.backend.description')}</Text>
      <Text variant={TextVariants.small} className="mb-6 flex items-center gap-2">
        {isRemoteBackend() ? <Server size={14} /> : <Laptop size={14} />}
        {isRemoteBackend()
          ? t('settings.backend.inUseRemote', { host: remoteHost() })
          : t('settings.backend.inUseLocal')}
      </Text>
      {startupProblem && (
        <Text color={TextColors.error} className="mb-6 flex items-center gap-2 break-all">
          <WifiOff size={16} className="shrink-0" />
          {t('settings.backend.fallback', { reason: describeBackendError(t, startupProblem) })}
        </Text>
      )}

      <div className="space-y-8">
        <div className="flex flex-wrap gap-2">
          {modes.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => update({ mode: id })}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                cfg.mode === id ? 'bg-accent text-button-text' : 'bg-bg-primary text-text-primary hover:bg-card-active',
              )}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>

        {remote && (
          <>
            <Item label={t('settings.backend.url')} description={t('settings.backend.urlDesc')}>
              <Input
                value={cfg.url}
                placeholder="https://rapidraw.example.net"
                onChange={(e) => update({ url: e.target.value })}
                bgClassName="bg-bg-primary"
              />
            </Item>
            <Item label={t('settings.backend.user')}>
              <Input value={cfg.user} onChange={(e) => update({ user: e.target.value })} bgClassName="bg-bg-primary" />
            </Item>
            <Item label={t('settings.backend.password')} description={t('settings.backend.credentialsDesc')}>
              <Input
                type="password"
                value={cfg.password}
                onChange={(e) => update({ password: e.target.value })}
                bgClassName="bg-bg-primary"
              />
            </Item>
            <Text variant={TextVariants.small}>{t('settings.backend.remoteNotes')}</Text>
          </>
        )}

        <div>
          <div className="flex flex-wrap items-center gap-2">
            {remote && (
              <Button className="min-w-32" onClick={test} disabled={isBusy || !cfg.url.trim()}>
                {isBusy ? t('settings.backend.working') : t('settings.backend.test')}
              </Button>
            )}
            <Button
              className="min-w-32"
              onClick={saveAndReload}
              disabled={isBusy || (!changed && !startupProblem) || (remote && !cfg.url.trim())}
            >
              {t('settings.backend.saveReload')}
            </Button>
          </div>
          <StatusLine status={status} />
        </div>
      </div>
    </div>
  );
}

function StatusLine({ status }: { status: Status }) {
  const { t } = useTranslation();
  if (status.kind === 'idle' || status.kind === 'busy') return null;
  const success = status.kind !== 'error';
  const message =
    status.kind === 'connected'
      ? t('settings.backend.connected', { version: status.info.rapidraw })
      : status.kind === 'saved'
        ? t('settings.backend.saved')
        : status.message;
  return (
    <Text color={success ? TextColors.success : TextColors.error} className="mt-2 flex items-center gap-2 break-all">
      {status.kind === 'connected' && <Wifi size={16} className="shrink-0" />}
      {status.kind === 'saved' && <Check size={16} className="shrink-0" />}
      {status.kind === 'error' && <WifiOff size={16} className="shrink-0" />}
      {message}
    </Text>
  );
}
