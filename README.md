# MagicCut

Turn a raw recording into a clean, cut video. A Mac app (Tauri + Tailwind), Apple Silicon only.

## Run it

- `npm run app` — build and open the newest app (what the studio's Start button runs).
- `npm test` — interface tests and Rust tests.

## Share it and ship updates

### Once: set up
1. The updater key: `.secrets/updater.key` in the main checkout (gitignored; a release run from a worktree finds it
   there), or `TAURI_SIGNING_PRIVATE_KEY` in the environment / `.env`. Its public half is `plugins.updater.pubkey` in
   `src-tauri/tauri.conf.json`. Keep a copy in a password manager: **lose it and no installed app can update again**
   (everyone would reinstall from the DMG once). A new key: `npx tauri signer generate -w .secrets/updater.key`, then
   put the new public key in `tauri.conf.json`.
2. `CLOUDFLARE_API_TOKEN` (Workers Scripts edit, plus DNS edit on `erdman.xyz` for the custom domain) and
   `CLOUDFLARE_ACCOUNT_ID`, in the environment or `.env` (never commit it).
3. `npm run updates:setup` — writes `https://magiccut.erdman.xyz/latest.json` into `tauri.conf.json` as the update
   address. Commit `tauri.conf.json`.

Updates are served by a Cloudflare Worker, `magic-cut-updates`, on `magiccut.erdman.xyz` (R2 is not enabled on the
account). Worker files are capped at 25 MiB, so each release file is cut into 20 MiB parts that the Worker streams
back as one file.

### Every release: one command
```
npm run release -- 0.2.0 --notes "What's new"
```
It sets the version (`tauri.conf.json`, `Cargo.toml`, `package.json`), builds the app and its DMG, checks the DMG by
mounting it, signs the update, writes `latest.json` and deploys it all to the Worker in one go. Commit the
version files (and `Cargo.lock`) afterwards.

Installed apps look for it when they open and every 6 hours, download it in the background, and show
"Update to 0.2.0" in the toolbar; one click restarts into the new version.

### The link to send
https://magiccut.erdman.xyz/MagicCut.dmg — always the newest DMG.
Next to it, https://magiccut.erdman.xyz/FIRST-OPEN.txt says how to open it the first time: the app has no Apple certificate, so
macOS asks once (right-click → Open, or System Settings → Privacy & Security → Open Anyway). Updates never ask again.

### Without Cloudflare
- `npm run dmg` — just `dist/MagicCut_<version>.dmg` and `dist/FIRST-OPEN.txt`; needs no keys.
- `npm run release -- 0.2.0 --local http://localhost:3277` — stages the release in `dist/bucket/` instead of
  uploading, for a test server; `updates/2026-11-25 DMG AND AUTO-UPDATES - OPEN/e2e-local-update.js` runs an older
  build against it. `e2e-cloudflare-update.js <newer>` in the same folder does the same against the live site.
