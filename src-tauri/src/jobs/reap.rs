//! Orphans of a crashed run: our own ffmpegs whose parent died, so launchd (pid 1) adopted them. Nothing reads
//! their output any more; they only burn the CPU. Killed when the app starts.

use std::path::Path;
use std::process::Command;

/// The pids in `ps -axo pid=,ppid=,command=` output whose parent is launchd and whose command is `program`.
pub fn orphans(ps: &str, program: &Path) -> Vec<u32> {
    let program = program.to_string_lossy();
    ps.lines().filter_map(|line| orphan(line.trim_start(), &program)).collect()
}

fn orphan(line: &str, program: &str) -> Option<u32> {
    let (pid, rest) = line.split_once(char::is_whitespace)?;
    let (ppid, command) = rest.trim_start().split_once(char::is_whitespace)?;
    let ours = command.trim_start() == program || command.trim_start().starts_with(&format!("{program} "));
    (ppid == "1" && ours).then(|| pid.parse().ok()).flatten()
}

/// The pids that were killed.
pub fn reap(program: &Path) -> Vec<u32> {
    let Ok(out) = Command::new("/bin/ps").args(["-axo", "pid=,ppid=,command="]).output() else { return vec![] };
    let pids = orphans(&String::from_utf8_lossy(&out.stdout), program);
    super::kill_pids(&pids);
    pids
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_our_program_adopted_by_launchd_is_an_orphan() {
        let ff = Path::new("/Applications/Magic Cut.app/Contents/MacOS/ffmpeg");
        let ps = "\
  101     1 /Applications/Magic Cut.app/Contents/MacOS/ffmpeg -i /Users/x/IMG_8456.MOV out.mp4
  102   900 /Applications/Magic Cut.app/Contents/MacOS/ffmpeg -i a.mov b.mp4
  103     1 /opt/homebrew/bin/ffmpeg -i a.mov b.mp4
  104     1 /Applications/Magic Cut.app/Contents/MacOS/ffmpegx -i a
  105    11 /sbin/launchd
  106     1 /Applications/Magic Cut.app/Contents/MacOS/ffmpeg";
        assert_eq!(orphans(ps, ff), vec![101, 106]);
    }
}
