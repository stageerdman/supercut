//! Ids that name files and folders: letters, digits, `-` and `_`, at most 64 of them, so a name built from one
//! can't leave its folder.

pub fn is_plain(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_ids_that_stay_in_their_folder_are_plain() {
        assert!(is_plain("run-1_a") && is_plain("k3m9q2x7a1bz"));
        for id in ["", "../x", "a/b", "run 1", "run.1", &"x".repeat(65)] {
            assert!(!is_plain(id), "{id}");
        }
    }
}
