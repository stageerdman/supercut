# MagicCut

Turn a raw recording into a clean, cut video. A Mac app (Tauri + Tailwind), Apple Silicon only.

## Run it

- `npm run app` — build and open the newest app (what the studio's Start button runs).
- `npm test` — interface tests and Rust tests.

## Share it and ship updates

### Once: set up
1. Put these in `.env` (never commit it):
   - `TAURI_SIGNING_PRIVATE_KEY` and an empty `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: the updater key. Its public half
     is `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`. Keep a copy in a password manager: **lose it and no
     installed app can update again** (everyone would reinstall from the DMG once). A new key:
     `npx tauri signer generate -w .secrets/updater.key`, then put the new public key in `tauri.conf.json`.
   - `CLOUDFLARE_API_TOKEN` (a token with Account › Workers R2 Storage › Edit) and `CLOUDFLARE_ACCOUNT_ID`.
2. `npm run updates:setup` — creates the R2 bucket `magic-cut-updates`, turns on its public URL and writes
   `<that URL>/latest.json` into `tauri.conf.json` as the update address. Commit `tauri.conf.json`.

### Every release: one command
```
npm run release -- 0.2.0 --notes "What's new"
```
It sets the version (`tauri.conf.json`, `Cargo.toml`, `package.json`), builds the app and its DMG, checks the DMG by
mounting it, signs the update, writes `latest.json` and uploads everything to R2, `latest.json` last. Commit the
version files (and `Cargo.lock`) afterwards.

Installed apps look for it when they open and every 6 hours, download it in the background, and show
"Update to 0.2.0" in the toolbar; one click restarts into the new version.

### The link to send
`<bucket URL>/MagicCut.dmg` — always the newest DMG (the bucket URL is the update address without `/latest.json`).
Next to it, `<bucket URL>/FIRST-OPEN.txt` says how to open it the first time: the app has no Apple certificate, so
macOS asks once (right-click → Open, or System Settings → Privacy & Security → Open Anyway). Updates never ask again.

### Without Cloudflare
- `npm run dmg` — just `dist/MagicCut_<version>.dmg` and `dist/FIRST-OPEN.txt`; needs no keys.
- `npm run release -- 0.2.0 --local http://localhost:3277` — stages the release in `dist/bucket/` instead of
  uploading, for a test server; `updates/2026-11-25 DMG AND AUTO-UPDATES - OPEN/e2e-local-update.js` runs an older
  build against it.
