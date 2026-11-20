// npm run app: rebuild the app and open it.
const { execFileSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { root, productName, appPath } = require("./bundle");

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: root, stdio: "inherit", ...opts });

run("npm", ["run", "build"]);

const app = appPath();
if (!existsSync(app)) {
  console.error(`Build finished but no app found at ${app}`);
  process.exit(1);
}

// Quit an older running copy so the fresh build is what opens.
try {
  execFileSync("osascript", ["-e", `quit app "${productName}"`], { stdio: "ignore" });
} catch {}

run("open", [app]);
console.log(`Opened ${app}`);
