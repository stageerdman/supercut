//! Parakeet gives sub-word tokens; the editor works in words.
//! A token that starts with a space or "▁" begins a new word; anything else
//! (rest of a word, punctuation) joins the word before it.

use crate::recognizer::Token;
use serde::{Deserialize, Serialize};

/// One spoken word with start and end time in seconds (same shape as Pensieve).
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Word {
    pub w: String,
    pub s: f64,
    pub e: f64,
}

pub fn merge_tokens(tokens: &[Token]) -> Vec<Word> {
    let mut words: Vec<Word> = Vec::new();
    for Token { text, s, e } in tokens {
        let starts_word = text.starts_with([' ', '▁']) || words.is_empty();
        let text = text.trim_start_matches([' ', '▁']);
        match (starts_word, words.last_mut()) {
            (false, Some(last)) => {
                last.w.push_str(text);
                last.e = *e;
            }
            _ if !text.is_empty() => words.push(Word { w: text.into(), s: *s, e: *e }),
            _ => {}
        }
    }
    words
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t(text: &str, s: f64, e: f64) -> Token {
        Token { text: text.into(), s, e }
    }

    #[test]
    fn joins_sub_words_and_punctuation() {
        let words = merge_tokens(&[t("▁Hel", 0.0, 0.2), t("lo", 0.2, 0.4), t(",", 0.4, 0.45), t("▁world", 0.6, 1.0)]);
        assert_eq!(
            words,
            vec![Word { w: "Hello,".into(), s: 0.0, e: 0.45 }, Word { w: "world".into(), s: 0.6, e: 1.0 }]
        );
    }

    #[test]
    fn first_token_without_marker_still_starts_a_word() {
        let words = merge_tokens(&[t("Hi", 0.0, 0.1), t(" there", 0.2, 0.5)]);
        assert_eq!(words.iter().map(|w| w.w.as_str()).collect::<Vec<_>>(), ["Hi", "there"]);
    }

    #[test]
    fn bare_space_tokens_are_dropped() {
        let words = merge_tokens(&[t("▁", 0.0, 0.1), t("▁ok", 0.2, 0.4)]);
        assert_eq!(words, vec![Word { w: "ok".into(), s: 0.2, e: 0.4 }]);
    }

    #[test]
    fn empty_input_gives_no_words() {
        assert!(merge_tokens(&[]).is_empty());
    }
}
