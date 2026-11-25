# DMG and auto-updates: what we learned

## Commands
- `npm run dmg` — `dist/MagicCut_<v>.dmg` + `dist/FIRST-OPEN.txt`. Needs nothing but this Mac.
- `npm run updates:setup` — once: writes `https://magiccut.erdman.xyz/latest.json` into
  `plugins.updater.endpoints` in `tauri.conf.json` (commit it).
- `npm run release -- 0.1.1 --notes "…"` — bumps the version in `tauri.conf.json`, `Cargo.toml`, `package.json`,
  builds, signs, and deploys the Worker `magic-cut-updates` with every file in one `wrangler deploy`. Commit the
  version files (and `Cargo.lock`) after.
- `--local http://localhost:3277` stages instead of uploading, for a manifest served locally; `e2e-local-update.js`
  in this folder runs an old build against it. `e2e-cloudflare-update.js <newer>` runs the installed app against the
  live site.

## Secrets
- Updater private key: `.secrets/updater.key` in the main checkout (`/Users/stage/dev/supercut`), found by
  `scripts/release/signing-key.js` (env `TAURI_SIGNING_PRIVATE_KEY` > this checkout's `.secrets/` > the main
  checkout's). The public key is in `tauri.conf.json`.
- `CLOUDFLARE_API_TOKEN` (Workers edit + DNS on the zone) and `CLOUDFLARE_ACCOUNT_ID`, from the environment or `.env`.
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
- App ↔ pill contract: `update_check` → `{version}` or null, `update_install` (joins the background download, or
  retries a failed one), `update://progress` `{downloaded, total}` running totals, `update_restart`. The background
  download stays (Pixel's call): the pill usually opens straight to "ready".
- The checker does not run in debug builds: `tauri dev` has no .app bundle to replace.

## Verified (2026-11-25)
- `npm run dmg`: 33 MB DMG; mounted read-only it holds the whole app, ad-hoc signed, this checkout's build id, and
  the Applications link (`scripts/release/verify.js` checks this on every build).
- Local end to end: 0.1.0 read `latest.json`, downloaded the 0.1.1 bundle, verified the signature and replaced
  itself on disk (Info.plist 0.1.1, codesign valid, binary runs).
- Live end to end on Cloudflare, three times: installed 0.1.0 → 0.1.1, 0.1.1 → 0.1.2 (found 1.4 s, pill
  told 3.4 s, `update ready` 16.6 s, reopened as 0.1.2, codesign valid), and 0.1.2 → 0.1.3 (found 1.1 s, pill
  3.5 s, ready 7.7 s, reopened as 0.1.3, codesign valid).

## Not verified yet
- A clean macOS user account opening the DMG (needs a second login on this Mac): first-open note written from
  macOS 15+ behaviour, where right-click → Open may be replaced by System Settings → Open Anyway.
- The pill seen on screen: screenshots fail here (`screencapture` can't read the display), so "the pill is told" is
  proven by the log line `pill shows update X` (written when `update_check` returns a version), and Restart by a
  relaunch.

## Gotchas
- R2 is not enabled on the account (API code 10042): hence the Worker. Worker static assets have the same 25 MiB
  per-file cap as Pages, so `site.js` cuts files into 20 MiB parts plus `_index.json`, and the Worker streams them
  back with a `FixedLengthStream` so Content-Length is right.
- Once, right after the first deploy, a download stalled for 10 min after `found 0.1.1, downloading`. The next two
  runs took 5 s and 17 s. Not reproduced; likely the new custom domain's certificate or a cold Worker. If it comes
  back, run `npx --yes wrangler@4 tail magic-cut-updates --format json` during the e2e.
- Apple Silicon only (`darwin-aarch64`).
- An installed dev build (`npm run install-app`) also updates itself once the endpoint is set and a higher version is
  released.
