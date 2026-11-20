// npm run app: rebuild SuperCut.app and open it.
// The bundle lands in the shared Cargo target (see CLAUDE.md), so ask cargo where that is.
const { execFileSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: root, stdio: "inherit", ...opts });

run("npm", ["run", "build"]);

const meta = JSON.parse(
  execFileSync(
    "cargo",
    ["metadata", "--format-version", "1", "--no-deps", "--manifest-path", "src-tauri/Cargo.toml"],
    { cwd: root, encoding: "utf8" },
  ),
);
const app = path.join(meta.target_directory, "release", "bundle", "macos", "SuperCut.app");
if (!existsSync(app)) {
  console.error(`Build finished but no app found at ${app}`);
  process.exit(1);
}

// Quit an older running copy so the fresh build is what opens.
try {
  execFileSync("osascript", ["-e", 'quit app "SuperCut"'], { stdio: "ignore" });
} catch {}

run("open", [app]);
console.log(`Opened ${app}`);
