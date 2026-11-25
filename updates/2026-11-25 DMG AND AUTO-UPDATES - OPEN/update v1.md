# DMG and auto-updates, v1

## Goal
Share Magic Cut as a DMG anyone can install without an Apple certificate, and have every installed copy find and
install newer releases by itself, from the user's own Cloudflare.

Done = the DMG installs and opens on a clean Mac account, and a test release with a higher version is found and
installed by the older build.

## Shape
- **Version** lives in one place: `src-tauri/tauri.conf.json` (`version`). `npm run release -- 0.1.1` writes it into
  `tauri.conf.json`, `Cargo.toml` and `package.json` together.
- **Build**: `tauri build --bundles app,dmg` with `createUpdaterArtifacts`, ad-hoc signed (`signingIdentity: "-"`,
  already set). Out come `Magic Cut_<v>_aarch64.dmg`, `Magic Cut.app.tar.gz` and its `.sig`.
- **Updater key**: a minisign key pair from `tauri signer generate`. The public key sits in `tauri.conf.json`
  (`plugins.updater.pubkey`). The private key sits in `.env` (`TAURI_SIGNING_PRIVATE_KEY`, gitignored), never in git.
- **Hosting**: one R2 bucket `magic-cut-updates`, public through its r2.dev URL:
  `latest.json` plus `<version>/Magic Cut.app.tar.gz` and `<version>/Magic Cut_<v>_aarch64.dmg`.
  `npm run updates:setup` creates the bucket once and writes its URL into `plugins.updater.endpoints`.
- **App side** (`src-tauri/src/updates/`): checks `latest.json` at launch, then every 6 hours; a failed check
  (offline) tries again in 15 minutes. A newer version downloads and installs in the background; the next launch runs
  it. The pill (`src/ui/update.js`, `design/update-prompt.md`) speaks to it through `update_check` (waits for the
  launch look, names any newer version), `update_install` (joins the background download or retries a failed one),
  `update://progress` events (running totals) and `update_restart`.

## Phases
1. **Research spike**: updater plugin API, artifacts, DMG without Finder (CI=true skips the AppleScript layout),
   wrangler R2 commands. Findings in `wiki.md`. *Test: a DMG and an `.app.tar.gz` + `.sig` come out of one build.*
2. **Release scripts** (`scripts/release/`): version bump, manifest, upload, setup.
   *Tests: `test/release.test.mjs` — version bump across the three files, manifest shape and URL encoding, upload plan.*
3. **App updater** (`updates/` Rust module + plugin + config).
   *Tests: schedule (next check after found / none / failed), status transitions; `cargo test`.*
4. **First-open note**: `FIRST-OPEN.md` shipped next to the DMG (right-click → Open, or System Settings → Privacy &
   Security → Open Anyway). *Test: release uploads it beside the DMG.*
5. **Cloudflare**: credentials in `.env` (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`), `npm run updates:setup`,
   release 0.1.0 (installed), release 0.1.1. *Test: the installed 0.1.0 logs `update ready 0.1.1` and relaunches as
   0.1.1; the DMG opens on a clean account.*

## Status
- [x] Phase 1 — spike findings in `wiki.md`.
- [x] Phase 2 — release scripts and tests.
- [x] Phase 3 — app updater and tests; commands reshaped to the pill's contract after main brought the pill in.
- [x] Phase 4 — first-open note.
- [ ] Phase 5 — waiting on Cloudflare credentials (wrangler is not logged in on this Mac).

## Decisions
- R2, not Pages: the app bundle is ~85 MB, over Pages' 25 MB file limit.
- Install in the background, apply on next launch: the found-and-installed path needs no UI, so it works before the
  update prompt exists; the prompt only adds "Restart now".
- The private key lives in `.env`, the project's one secret file, not a loose file in a checkout that gets deleted.
- Apple Silicon only (`aarch64`), the Macs this is built on; the manifest key is `darwin-aarch64`.
