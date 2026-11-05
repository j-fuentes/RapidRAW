# j-fuentes/RapidRAW — HEIC fork

Personal fork of [CyberTimon/RapidRAW](https://github.com/CyberTimon/RapidRAW) that
opens HEIC/HEIF photos (e.g. Samsung Galaxy phones).

- Branch `heic-v1.6.7`: upstream tag `v1.6.7` + the HEIC patch.
- The patch is based on upstream PR #1884 (apweisskopf, `heic-native`), which
  decodes with [imazen/heic](https://github.com/imazen/heic) using the OS HEVC
  decoder. This fork also enables the crate's pure-Rust decoder
  (`backend-rust`) as a fallback, so Linux without VA-API and Android devices
  without an HEVC MediaCodec still decode, and recognizes HEIF by its `ftyp`
  brand as well as by extension (`.heic`, `.heif`, `.hif`).
- Builds: `.github/workflows/heic-build.yml` (Android arm64 APK signed with
  the fork's own key, Linux x64 AppImage/deb/rpm, macOS arm64 dmg). Upstream's
  release/PR workflows are disabled in this fork.

## Backend: this device or an external server

Settings → Backend chooses where photos are processed:

- **This device** (default): the app's own Rust backend over Tauri's IPC, as
  upstream. Works offline.
- **External server**: the UI talks to a
  [rapidraw-web](https://github.com/j-fuentes/rapidraw-web) server (relay +
  bridge, branch `immich-heic-v1.6.7` with `/rr/version`) like RapidRAW Web in a
  browser: every `invoke()` and event goes over its `/ipc` WebSocket, file
  dialogs show the server's folders (rapidraw-web's picker), images come from
  its `/files`. URL, user and password are stored in `backend.json` in the
  app data folder (mode 600; not in the system credential store, which on
  macOS can block a newly built app at start). The choice is made at start
  (`src/remote/backend.ts`, checked with `GET /rr/version`: protocol and
  RapidRAW version must match, otherwise the session falls back to this device
  with a message); changing it reloads the UI.

How: `vite.config.mjs` points the UI's imports of `@tauri-apps/api/core`,
`/event`, `/path` and `@tauri-apps/plugin-dialog` to `src/backend/tauri/*`,
which call Tauri or `src/remote/transport.ts` (from rapidraw-web's
`rrweb/shim`). Window, OS, shell, HTTP and message dialogs stay on this device.
`scripts/check-backend-switch.mjs` (run by `npm run build`) fails when the UI
starts using a Tauri module or function nobody has decided about.

Not available with the external server: photos stored on this device
(including Android's gallery and the app's library folder), rapidraw-web's
Files tab and "folders from this computer", drag & drop from the OS,
tethering. Exports go to the server's folders or to Immich (uploaded by the
server); settings and the Immich connection are the server's.

HEVC may be covered by patents; this fork is for personal use.
