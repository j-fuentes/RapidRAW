// Backend switch check (Settings → Backend: this device / external server). Fails (exit 1) when the UI starts
// using a Tauri module or function nobody decided about yet: does it have to reach the backend (then it needs a
// version in src/backend/tauri/ that also works with the external server) or is it about this device (window, OS,
// links…)? Also checks the RapidRAW markup src/remote/adjust.ts relies on. Runs before every build (npm run build).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// switched modules (vite.config.mjs: SWITCHED) → src/backend/tauri/<file>.ts
const SWITCHED = {
  '@tauri-apps/api/core': 'core',
  '@tauri-apps/api/event': 'event',
  '@tauri-apps/api/path': 'path',
  '@tauri-apps/plugin-dialog': 'dialog',
};
// names that may stay with this app's backend / this device in both modes
const LOCAL_OK = {
  '@tauri-apps/api/core': ['isTauri'],
  '@tauri-apps/plugin-dialog': ['ask', 'confirm', 'message'],
  '@tauri-apps/api/window': ['getCurrentWindow'],
  '@tauri-apps/api/app': ['getVersion'],
  '@tauri-apps/plugin-os': ['platform', 'type', 'arch'],
  '@tauri-apps/plugin-process': ['relaunch', 'exit'],
  '@tauri-apps/plugin-shell': ['open'],
  '@tauri-apps/plugin-http': ['fetch'],
};

const walk = (d) =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|jsx?)$/.test(f) ? [p] : [];
  });
const own = (f) => /^src[\\/](backend|remote)[\\/]/.test(f);
const overridden = (mod) => {
  const src = readFileSync(`src/backend/tauri/${SWITCHED[mod]}.ts`, 'utf8');
  return new Set([...src.matchAll(/export\s+(?:async\s+)?(?:const|function|let|class)\s+(\w+)/g)].map((m) => m[1]));
};

const problems = [];
const re = /import\s+(type\s+)?(?:\{([^}]*)\}|\*\s+as\s+\w+|\w+)\s+from\s*['"](@tauri-apps\/[\w/-]+)['"]/g;
for (const f of walk('src').filter((f) => !own(f))) {
  for (const m of readFileSync(f, 'utf8').matchAll(re)) {
    const [whole, isType, names, mod] = m;
    if (isType) continue;
    if (!SWITCHED[mod] && !LOCAL_OK[mod]) {
      problems.push(
        `${f}: ${mod} is new: decide whether it goes to the backend (src/backend/tauri, vite.config.mjs) or stays on this device (LOCAL_OK)`,
      );
      continue;
    }
    if (!names) {
      problems.push(`${f}: ${whole.trim()}: import the functions by name`);
      continue;
    }
    const remote = SWITCHED[mod] ? overridden(mod) : new Set();
    for (const raw of names.split(',')) {
      const item = raw.trim();
      if (!item || item.startsWith('type ')) continue;
      const n = item.split(/\s+as\s+/)[0];
      if (/^[A-Z]/.test(n) && n !== 'Channel') continue; // types and enums
      if (!remote.has(n) && !(LOCAL_OK[mod] ?? []).includes(n)) {
        problems.push(
          `${f}: ${mod} → '${n}' is neither in src/backend/tauri/${SWITCHED[mod] ?? '?'}.ts nor in LOCAL_OK`,
        );
      }
    }
  }
}

// src/remote/adjust.ts (from rapidraw-web) finds the slider by its markup and recognises skipped previews
const slider = readFileSync('src/components/ui/Slider.tsx', 'utf8');
const lib = readFileSync('src-tauri/src/lib.rs', 'utf8');
const checks = [
  [
    'Slider: <div className="mb-2 group …"> with one <input type="range">',
    slider.includes('className={`mb-2 group ') && (slider.match(/type="range"/g) ?? []).length === 1,
  ],
  [
    'Slider: label in the first <span>, value in a right-aligned <div> after it',
    /<span[\s\S]*?\{label\}[\s\S]*?<div className="w-\d+ text-right[\s\S]*?handleValueClick/.test(slider),
  ],
  ['skipped preview: "Superseded or worker failed"', lib.includes('"Superseded or worker failed"')],
  [
    'local-only commands exist: frontend_ready, get_backend_config, set_backend_config',
    ['fn frontend_ready', 'backend_config::get_backend_config', 'backend_config::set_backend_config'].every((s) =>
      lib.includes(s),
    ),
  ],
];
for (const [what, ok] of checks)
  if (!ok) problems.push(`RapidRAW changed (${what}): adapt src/remote/ or src/backend/`);

if (problems.length) {
  console.error('backend switch check FAILED:\n  ' + [...new Set(problems)].join('\n  '));
  process.exit(1);
}
console.log('backend switch check OK');
