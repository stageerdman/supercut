//! All-or-nothing file saves: write a temp file beside the target, then rename it over the target.

use std::path::Path;

/// Makes the folder if needed. A reader never sees half a file; a rewrite replaces the old one.
pub fn write(file: &Path, text: &str) -> std::io::Result<()> {
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let mut tmp = file.as_os_str().to_owned();
    tmp.push(".tmp");
    std::fs::write(&tmp, text)?;
    std::fs::rename(&tmp, file)
}
