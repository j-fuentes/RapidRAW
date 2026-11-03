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

HEVC may be covered by patents; this fork is for personal use.
