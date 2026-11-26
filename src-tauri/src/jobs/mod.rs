//! Supervised child processes (ffmpeg): each one registered while it runs, killed the moment its result is no
//! longer wanted, and all of them killed when the app quits. Orphans of a crash are reaped at the next start.
//! Why: updates/2026-11-26 OVERLOAD - OPEN/update v1.md (unkillable ffmpegs piled up and outlived the app).

pub mod children;
pub mod reap;

use children::{Children, RUNNING};
use std::io::{self, Read};
use std::process::{Child, Command, Output, Stdio};
use std::thread::JoinHandle;
use std::time::Duration;

/// How often a running job asks whether it is still wanted.
const POLL: Duration = Duration::from_millis(50);

/// One running child. Dropping it kills the child (if still running) and waits for it, so no path out of a
/// caller, error or early return included, leaves it behind.
pub struct Job {
    child: Child,
    registry: &'static Children,
    stderr: Option<JoinHandle<Vec<u8>>>,
}

impl Job {
    /// Starts `cmd` with no stdin and piped stdout and stderr, registered in the app's children.
    pub fn spawn(cmd: &mut Command) -> io::Result<Job> {
        Self::spawn_in(&RUNNING, cmd)
    }

    pub fn spawn_in(registry: &'static Children, cmd: &mut Command) -> io::Result<Job> {
        let mut child = cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn()?;
        registry.add(child.id());
        // Drained from the start on its own thread: a full stderr pipe would block ffmpeg forever.
        let stderr = drain(child.stderr.take());
        Ok(Job { child, registry, stderr })
    }

    /// The child's stdout, for reading as it comes (`finish` then returns none of it).
    pub fn stdout(&mut self) -> Option<std::process::ChildStdout> {
        self.child.stdout.take()
    }

    /// Waits for the child to end; `None` once `live` says the result is no longer wanted (the child is killed).
    pub fn finish(mut self, live: &dyn Fn() -> bool) -> io::Result<Option<Output>> {
        let (out, err) = (drain(self.child.stdout.take()), self.stderr.take());
        loop {
            if let Some(status) = self.child.try_wait()? {
                return Ok(Some(Output { status, stdout: joined(out), stderr: joined(err) }));
            }
            if !live() {
                return Ok(None);
            }
            std::thread::sleep(POLL);
        }
    }
}

impl Drop for Job {
    fn drop(&mut self) {
        // Ok on a child already waited for: std never signals a pid it has reaped.
        let _ = self.child.kill();
        let _ = self.child.wait();
        self.registry.remove(self.child.id());
    }
}

fn drain(pipe: Option<impl Read + Send + 'static>) -> Option<JoinHandle<Vec<u8>>> {
    pipe.map(|mut p| {
        std::thread::spawn(move || {
            let mut bytes = Vec::new();
            let _ = p.read_to_end(&mut bytes);
            bytes
        })
    })
}

fn joined(reader: Option<JoinHandle<Vec<u8>>>) -> Vec<u8> {
    reader.and_then(|r| r.join().ok()).unwrap_or_default()
}

/// Runs `cmd` to its end, or `None` once `live` says no (the child is killed then, not left running).
pub fn run(cmd: &mut Command, live: &dyn Fn() -> bool) -> io::Result<Option<Output>> {
    Job::spawn(cmd)?.finish(live)
}

/// Runs `cmd` to its end, registered so quitting the app still kills it.
pub fn output(cmd: &mut Command) -> io::Result<Output> {
    Ok(run(cmd, &|| true)?.expect("an always-live job runs to its end"))
}

/// The app is going: no child may outlive it.
pub fn kill_all() {
    RUNNING.kill_all()
}

fn kill_pids(pids: &[u32]) {
    if pids.is_empty() {
        return;
    }
    let _ = Command::new("/bin/kill").arg("-KILL").args(pids.iter().map(u32::to_string)).output();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    fn sleeper() -> Command {
        let mut c = Command::new("/bin/sleep");
        c.arg("30");
        c
    }

    fn alive(pid: u32) -> bool {
        Command::new("/bin/kill").args(["-0", &pid.to_string()]).output().unwrap().status.success()
    }

    #[test]
    fn a_job_no_longer_wanted_is_killed_at_once() {
        static MINE: Children = Children::new();
        let job = Job::spawn_in(&MINE, &mut sleeper()).unwrap();
        let pid = job.child.id();
        let started = Instant::now();
        assert!(job.finish(&|| false).unwrap().is_none());
        assert!(started.elapsed() < Duration::from_secs(2));
        assert!(!alive(pid), "the child is gone");
        assert_eq!(MINE.count(), 0);
    }

    #[test]
    fn a_dropped_job_takes_its_child_with_it() {
        static MINE: Children = Children::new();
        let job = Job::spawn_in(&MINE, &mut sleeper()).unwrap();
        let pid = job.child.id();
        drop(job);
        assert!(!alive(pid));
        assert_eq!(MINE.count(), 0);
    }

    #[test]
    fn kill_all_leaves_no_child_running() {
        static MINE: Children = Children::new();
        let jobs: Vec<Job> = (0..3).map(|_| Job::spawn_in(&MINE, &mut sleeper()).unwrap()).collect();
        let pids: Vec<u32> = jobs.iter().map(|j| j.child.id()).collect();
        assert_eq!(MINE.count(), 3);
        MINE.kill_all();
        let started = Instant::now();
        for job in jobs {
            let out = job.finish(&|| true).unwrap().unwrap();
            assert!(!out.status.success());
        }
        assert!(started.elapsed() < Duration::from_secs(2), "killed, not waited out");
        assert!(pids.iter().all(|&p| !alive(p)));
    }

    #[test]
    fn a_finished_job_hands_back_its_output() {
        static MINE: Children = Children::new();
        let mut c = Command::new("/bin/sh");
        c.args(["-c", "echo out; echo err >&2; exit 3"]);
        let out = Job::spawn_in(&MINE, &mut c).unwrap().finish(&|| true).unwrap().unwrap();
        assert_eq!((out.status.code(), out.stdout.as_slice(), out.stderr.as_slice()), (Some(3), &b"out\n"[..], &b"err\n"[..]));
    }
}
