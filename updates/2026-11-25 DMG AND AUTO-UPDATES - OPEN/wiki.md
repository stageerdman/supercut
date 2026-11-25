# DMG and auto-updates: what we learned

## Commands
- `npm run dmg` — `dist/MagicCut_<v>.dmg` + `dist/FIRST-OPEN.txt`. Needs nothing but this Mac.
- `npm run updates:setup` — once: R2 bucket `magic-cut-updates`, its public r2.dev URL, written into
  `plugins.updater.endpoints` in `tauri.conf.json` (commit it).
- `npm run release -- 0.1.1 --notes "…"` — bumps the version in `tauri.conf.json`, `Cargo.toml`, `package.json`,
  builds, signs, stages `dist/bucket/`, uploads (manifest last). Commit the version files (and `Cargo.lock`) after.
- `--local http://localhost:3277` stages instead of uploading, for a manifest served locally; `e2e-local-update.js`
  in this folder runs an old build against it.

## Secrets
- `.env`: `TAURI_SIGNING_PRIVATE_KEY` (+ empty `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`), `CLOUDFLARE_API_TOKEN`
  (R2 edit), `CLOUDFLARE_ACCOUNT_ID`. The public key is in `tauri.conf.json`.
- **Lose the private key and no installed app can ever update again**: every update must carry its signature. A new
  key means everyone reinstalls from the DMG once.

## What works
- `createUpdaterArtifacts` is passed only by the release (`tauri build --config`), not set in `tauri.conf.json`:
  with it on, every build needs the private key, and `npm run app` / `install-app` in a checkout without the key
  would fail.
- `CI=true` makes Tauri's `bundle_dmg.sh` skip the Finder AppleScript layout, so the DMG builds without a GUI
  session (plain window: the app and an Applications link).
- Ad-hoc signing (`signingIdentity: "-"`) is enough for the updater: it checks the minisign signature, not Apple's.
  The replaced bundle still passes `codesign --verify --deep --strict`.
- A file the app downloads itself carries no quarantine flag, so an update never meets Gatekeeper again; only the
  DMG from a browser does (hence `FIRST-OPEN.txt`).
- The updater refuses plain http in release builds; `dangerousInsecureTransportProtocol` is set only for `--local`.
- `EmptyEndpoints` (no `updates:setup` yet) stops the checker quietly: one log line, no retries.
- The checker does not run in debug builds: `tauri dev` has no .app bundle to replace.

## Verified (2026-11-25)
- `npm run dmg`: 33 MB DMG; mounted read-only it holds the whole app, ad-hoc signed, this checkout's build id, and
  the Applications link (`scripts/release/verify.js` checks this on every build).
- Local end to end: 0.1.0 read `latest.json`, downloaded the 0.1.1 bundle, verified the signature and replaced
  itself on disk (Info.plist 0.1.1, codesign valid, binary runs).

## Not verified yet
- A clean macOS user account opening the DMG (needs a second login on this Mac): first-open note written from
  macOS 15+ behaviour, where right-click → Open may be replaced by System Settings → Open Anyway.
- The R2 path, until Cloudflare credentials are in `.env`.

## Gotchas
- r2.dev URLs are rate-limited and meant for light use; a custom domain on the bucket is the upgrade path (re-run the
  endpoint edit with that URL; old builds keep checking the r2.dev one, so keep it on).
- Apple Silicon only (`darwin-aarch64`).
- An installed dev build (`npm run install-app`) also updates itself once the endpoint is set and a higher version is
  released.
