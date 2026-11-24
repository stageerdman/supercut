use std::fs;
use std::path::{Path, PathBuf};

fn main() {
    // The app embeds ../src at compile time. Stamp the binary with a hash of exactly those
    // files, so `npm run install-app` can prove the installed copy carries this checkout's
    // frontend (the shared Cargo target is written by every checkout; see CLAUDE.md).
    // Same algorithm as frontendId() in scripts/build-id.js.
    println!("cargo:rustc-env=MAGIC_CUT_FRONTEND_ID={}", frontend_id(Path::new("../src")));
    // tauri_build prints its own rerun-if-changed lines, which turn off Cargo's default scan, and ../src is outside
    // the crate anyway: without this a frontend-only change keeps the old stamp (and the old embedded files).
    println!("cargo:rerun-if-changed=../src");
    tauri_build::build()
}

/// FNV-1a 64 over every file under `dir`, sorted by relative path: `path \0 bytes \0` each.
fn frontend_id(dir: &Path) -> String {
    let mut files = Vec::new();
    collect(dir, dir, &mut files);
    files.sort();
    let mut hash: u64 = 0xcbf29ce484222325;
    for rel in files {
        let bytes = fs::read(dir.join(&rel)).expect("read frontend file");
        let chunks: [&[u8]; 4] = [rel.as_bytes(), &[0], &bytes, &[0]];
        for chunk in chunks {
            for b in chunk {
                hash = (hash ^ u64::from(*b)).wrapping_mul(0x100000001b3);
            }
        }
    }
    format!("{hash:016x}")
}

fn collect(root: &Path, dir: &Path, out: &mut Vec<String>) {
    for entry in fs::read_dir(dir).expect("read frontend dir") {
        let path: PathBuf = entry.expect("frontend dir entry").path();
        if path.is_dir() {
            collect(root, &path, out);
        } else {
            let rel = path.strip_prefix(root).unwrap().to_string_lossy().replace('\\', "/");
            out.push(rel);
        }
    }
}
