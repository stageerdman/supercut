//! The one logger. Every line names where it came from and the job it belongs to
//! (a trace id such as "part-2"), so any failure can be followed end to end:
//! `magic-cut INFO  transcribe part-2 chunk 3/9`

pub fn info(scope: &str, trace: &str, msg: impl AsRef<str>) {
    write("INFO ", scope, trace, msg.as_ref());
}

pub fn error(scope: &str, trace: &str, msg: impl AsRef<str>) {
    write("ERROR", scope, trace, msg.as_ref());
}

fn write(level: &str, scope: &str, trace: &str, msg: &str) {
    eprintln!("magic-cut {level} {scope} {trace} {msg}");
}
