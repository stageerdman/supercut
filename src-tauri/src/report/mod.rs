//! One-click debug report (design/debug-report.md): gathers the fixed bundle on this Mac, hides the home
//! folder, gzips it and posts it to the Magic Cut server, which answers with the report's id.
//! A piece that can't be read is noted in the bundle, never fatal: a partial report beats none.

pub mod bundle;

use crate::error::AppError;
use crate::{claude, log, paths, usage};
use bundle::Bundle;
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

const URL: &str = "https://magiccut.erdman.xyz/api/debug-report";
const LIMIT: Duration = Duration::from_secs(15);

/// Where the bundle's files are; tests point these at a temp folder.
pub struct Sources {
    pub log_dir: PathBuf,
    pub usage_file: PathBuf,
    pub install_file: PathBuf,
}

impl Sources {
    pub fn this_mac() -> Self {
        Self { log_dir: log::dir(), usage_file: usage::ledger_file(&usage::dir()), install_file: paths::data("install-id") }
    }
}

/// The Mac details the bundle carries.
pub struct Mac {
    pub macos: String,
    pub model: String,
    pub disk: u64,
    pub claude: String,
}

impl Mac {
    pub fn this_mac() -> Self {
        Self {
            macos: output("/usr/bin/sw_vers", &["-productVersion"]),
            model: output("/usr/sbin/sysctl", &["-n", "hw.model"]),
            disk: crate::export::target::free(&paths::home()),
            claude: claude::status(claude::find(&claude::candidates())).state.into(),
        }
    }
}

#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub struct Sent {
    pub id: String,
}

/// Gathers, sends and logs one report: what the Settings button runs.
pub fn send_now(trace: &str) -> Result<Sent, AppError> {
    let json = bundle::to_json(&gather(&Sources::this_mac(), Mac::this_mac()), &paths::home().display().to_string());
    match post(&gzip(json.as_bytes())?) {
        Ok(sent) => {
            log::info("report", trace, format!("sent {} ({} bytes)", sent.id, json.len()));
            Ok(sent)
        }
        Err(e) => {
            log::error("report", trace, format!("{e:?}"));
            Err(e)
        }
    }
}

pub fn gather(src: &Sources, mac: Mac) -> Bundle {
    let max = log::MAX_BYTES as usize;
    let read = |f: PathBuf| std::fs::read(f).unwrap_or_default();
    Bundle {
        install: install_id(&src.install_file).unwrap_or_else(|e| format!("unknown ({e})")),
        app: env!("CARGO_PKG_VERSION").into(),
        build: env!("MAGIC_CUT_FRONTEND_ID").into(),
        macos: mac.macos,
        model: mac.model,
        disk: mac.disk,
        claude: mac.claude,
        log: bundle::log_tail(&read(log::current(&src.log_dir)), &read(log::previous(&src.log_dir)), max),
        usage: usage::notes(&src.usage_file).map_or_else(|e| vec![format!("couldn't read the usage notes: {e}")], |n| n.lines),
    }
}

/// This Mac's random id, made once: it groups one Mac's reports and identifies no one.
pub fn install_id(file: &Path) -> std::io::Result<String> {
    if let Ok(id) = std::fs::read_to_string(file) {
        if !id.trim().is_empty() {
            return Ok(id.trim().to_owned());
        }
    }
    let id = random_hex()?;
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(file, &id)?;
    Ok(id)
}

fn random_hex() -> std::io::Result<String> {
    let mut bytes = [0u8; 16];
    std::fs::File::open("/dev/urandom")?.read_exact(&mut bytes)?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

/// A command's trimmed stdout, or "unknown".
fn output(bin: &str, args: &[&str]) -> String {
    let out = Command::new(bin).args(args).output().ok().filter(|o| o.status.success());
    out.map(|o| String::from_utf8_lossy(&o.stdout).trim().to_owned()).filter(|s| !s.is_empty()).unwrap_or_else(|| "unknown".into())
}

fn gzip(bytes: &[u8]) -> Result<Vec<u8>, AppError> {
    let mut enc = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    enc.write_all(bytes).and_then(|_| enc.finish()).map_err(|e| AppError::Report(format!("gzip: {e}")))
}

fn post(body: &[u8]) -> Result<Sent, AppError> {
    let err = |e: &dyn std::fmt::Display| AppError::Report(format!("{URL}: {e}"));
    let reply = ureq::post(URL)
        .timeout(LIMIT)
        .set("Content-Type", "application/json")
        .set("Content-Encoding", "gzip")
        .send_bytes(body)
        .map_err(|e| err(&e))?
        .into_string()
        .map_err(|e| err(&e))?;
    serde_json::from_str(&reply).map_err(|e| err(&format!("{e} in {reply:?}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testkit::temp_dir;

    fn sources(name: &str) -> Sources {
        let d = temp_dir(name);
        Sources { log_dir: d.join("logs"), usage_file: d.join("usage/ledger.jsonl"), install_file: d.join("install-id") }
    }

    fn mac() -> Mac {
        Mac { macos: "15.1".into(), model: "Mac15,6".into(), disk: 7, claude: "ready".into() }
    }

    #[test]
    fn the_bundle_carries_the_log_the_usage_notes_and_the_mac() {
        let src = sources("report-gather");
        log::append(&src.log_dir, "old line", log::MAX_BYTES).unwrap();
        std::fs::rename(log::current(&src.log_dir), log::previous(&src.log_dir)).unwrap();
        log::append(&src.log_dir, "new line", log::MAX_BYTES).unwrap();
        usage::record(&src.usage_file, &usage::ledger::sample_call(1, Some("p"), 3), "t");
        let b = gather(&src, mac());
        assert_eq!(b.log, "old line\nnew line\n");
        assert_eq!(b.usage.len(), 1);
        assert_eq!((b.macos.as_str(), b.model.as_str(), b.disk, b.claude.as_str()), ("15.1", "Mac15,6", 7, "ready"));
    }

    #[test]
    fn missing_files_make_an_empty_report_not_a_failure() {
        let b = gather(&sources("report-empty"), mac());
        assert_eq!((b.log.as_str(), b.usage.len()), ("", 0));
        assert_eq!(b.install.len(), 32);
    }

    #[test]
    fn the_install_id_is_made_once_and_kept() {
        let file = sources("report-install").install_file;
        let first = install_id(&file).unwrap();
        assert_eq!(first.len(), 32);
        assert_eq!(install_id(&file).unwrap(), first);
        assert_ne!(install_id(&sources("report-install-2").install_file).unwrap(), first);
    }

    #[test]
    fn gzip_round_trips() {
        let mut out = String::new();
        flate2::read::GzDecoder::new(&gzip(b"{\"a\":1}").unwrap()[..]).read_to_string(&mut out).unwrap();
        assert_eq!(out, "{\"a\":1}");
    }
}
