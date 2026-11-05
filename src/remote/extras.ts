// What the external server backend adds to the UI (from rapidraw-web's rrweb/files): a pill at the top with the
// server and the connection state, progress while a photo opens and for thumbnails, and the ring next to a slider
// while its preview renders on the server.
import { el } from './ui';
import { onConnection } from './transport';
import { mountProgress } from './progress';
import { mountAdjustProgress } from './adjust';
import './remote.css';

export function mountRemoteExtras(host: string) {
  const tag = el('span', { class: 'rrf-tag rrb-host' }, host);
  const dot = el('span', { class: 'rrb-dot' });
  const pill = el('div', { id: 'rrf-tabs', class: 'rrb-pill', title: `RapidRAW server: ${host}` }, dot, tag);
  document.body.append(pill);
  onConnection((online) => {
    pill.classList.toggle('offline', !online);
    tag.textContent = online ? host : `Reconnecting to ${host}…`;
  });
  mountProgress(pill);
  mountAdjustProgress();
}
