//! Claude's keep/drop → cuts. The built-in rule lives here, in code: Claude decides how many
//! takes of a re-recorded line stay; which ones is ours — the last.

use super::lines::Line;
use crate::claude::picks::{Dropped, Picks};
use serde::Serialize;

/// The hover adds which take was kept ("· kept “…”"), so the reason doesn't say it again.
pub const EARLIER_TAKE: &str = "Earlier take";

/// Who made a cut: Claude, or our last-take rule overriding Claude. Tells "Claude was wrong" from "our rule was".
#[derive(Serialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Source {
    Claude,
    Rule,
}

/// A proposed cut: line `line` = words `from..to` of part `part`, `s`–`e` seconds in that part's own time.
/// `instead`: the take of the same line that stays, when the cut is an earlier take.
#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct Cut {
    pub line: u32,
    pub part: u32,
    pub from: usize,
    pub to: usize,
    pub s: f64,
    pub e: f64,
    pub reason: String,
    pub source: Source,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instead: Option<u32>,
}

/// Claude's picks after our rule, and the lines the rule dropped in Claude's place.
pub struct Decided {
    pub picks: Picks,
    pub by_rule: Vec<u32>,
}

/// In a group where Claude kept some take but not the last one, its latest kept take
/// hands the keep to the last take.
pub fn keep_last_takes(mut picks: Picks, groups: &[Vec<u32>]) -> Decided {
    let mut by_rule = Vec::new();
    for group in groups {
        let last = *group.last().expect("groups have two or more takes");
        let Some(&latest_kept) = group.iter().rev().find(|id| picks.keep.contains(id)) else { continue };
        if latest_kept == last {
            continue;
        }
        picks.keep.retain(|&id| id != latest_kept);
        picks.keep.push(last);
        picks.drop.retain(|d| d.id != last);
        picks.drop.push(Dropped { id: latest_kept, reason: EARLIER_TAKE.into() });
        by_rule.push(latest_kept);
    }
    Decided { picks, by_rule }
}

/// One cut per dropped line, in line order. Times come from the words, never from Claude.
pub fn cuts(lines: &[Line], decided: &Decided, groups: &[Vec<u32>]) -> Vec<Cut> {
    let Decided { picks, by_rule } = decided;
    lines
        .iter()
        .filter_map(|l| picks.drop.iter().find(|d| d.id == l.id).map(|d| (l, d)))
        .map(|(l, d)| Cut {
            line: l.id,
            part: l.part,
            from: l.from,
            to: l.to,
            s: l.s,
            e: l.e,
            reason: d.reason.clone(),
            source: if by_rule.contains(&l.id) { Source::Rule } else { Source::Claude },
            instead: kept_take(l.id, &picks.keep, groups),
        })
        .collect()
}

/// The take that stays in the dropped line's group: its latest kept take. None outside a group, or if all went.
fn kept_take(line: u32, keep: &[u32], groups: &[Vec<u32>]) -> Option<u32> {
    let group = groups.iter().find(|g| g.contains(&line))?;
    group.iter().rev().find(|id| keep.contains(id)).copied()
}

#[cfg(test)]
mod tests {
    use super::super::lines::{sample::part, split};
    use super::*;

    fn picks(keep: &[u32], drop: &[u32]) -> Picks {
        Picks { keep: keep.to_vec(), drop: drop.iter().map(|&id| Dropped { id, reason: "claude".into() }).collect(), check: vec![] }
    }

    fn sorted(d: &Decided) -> (Vec<u32>, Vec<u32>) {
        let mut keep = d.picks.keep.clone();
        let mut drop: Vec<u32> = d.picks.drop.iter().map(|d| d.id).collect();
        keep.sort_unstable();
        drop.sort_unstable();
        (keep, drop)
    }

    #[test]
    fn an_earlier_take_kept_over_the_last_is_swapped() {
        let d = keep_last_takes(picks(&[1, 2, 4], &[3]), &[vec![2, 3]]);
        assert_eq!(sorted(&d), (vec![1, 3, 4], vec![2]));
        assert_eq!(d.picks.drop[0].reason, EARLIER_TAKE);
        assert_eq!(d.by_rule, [2], "the rule, not Claude, dropped take 2");
    }

    #[test]
    fn each_cut_says_who_made_it_and_which_take_stayed() {
        // Lines: 1 "Hi." · 2, 3, 4 three takes · 5 "Um." (a fumble outside any group).
        let lines = split(&[part(1, "Hi. Take a. Take b. Take c. Um.")]);
        let groups = [vec![2, 3, 4]];
        let d = keep_last_takes(picks(&[1, 3], &[2, 4, 5]), &groups); // Claude kept take 3: the rule moves it to 4
        let got: Vec<_> = cuts(&lines, &d, &groups).iter().map(|c| (c.line, c.source, c.instead)).collect();
        assert_eq!(got, [(2, Source::Claude, Some(4)), (3, Source::Rule, Some(4)), (5, Source::Claude, None)]);
    }

    #[test]
    fn no_take_stays_when_claude_drops_them_all() {
        let lines = split(&[part(1, "Take a. Take b.")]);
        let groups = [vec![1, 2]];
        let d = keep_last_takes(picks(&[], &[1, 2]), &groups);
        assert!(cuts(&lines, &d, &groups).iter().all(|c| c.instead.is_none()));
    }

    #[test]
    fn claudes_choice_stands_when_it_kept_the_last_take() {
        assert_eq!(sorted(&keep_last_takes(picks(&[3], &[1, 2]), &[vec![1, 2, 3]])), (vec![3], vec![1, 2]));
    }

    #[test]
    fn claude_may_keep_both_when_they_only_sound_alike() {
        assert_eq!(sorted(&keep_last_takes(picks(&[1, 2], &[]), &[vec![1, 2]])), (vec![1, 2], vec![]));
    }

    #[test]
    fn claude_may_drop_every_take() {
        assert_eq!(sorted(&keep_last_takes(picks(&[], &[1, 2]), &[vec![1, 2]])), (vec![], vec![1, 2]));
    }

    #[test]
    fn of_three_takes_the_latest_kept_one_moves_to_the_last() {
        // Claude kept takes 1 and 2: it wanted two lines; the rule keeps 1 and 3.
        assert_eq!(sorted(&keep_last_takes(picks(&[1, 2], &[3]), &[vec![1, 2, 3]])), (vec![1, 3], vec![2]));
    }

    #[test]
    fn dropped_lines_become_cuts_with_word_ranges_and_times() {
        let lines = split(&[part(1, "Take one. Take two."), part(2, "Bye now.")]);
        let dropped = vec![Dropped { id: 3, reason: "fumble".into() }, Dropped { id: 1, reason: "earlier take".into() }];
        let d = Decided { picks: Picks { keep: vec![2], drop: dropped, check: vec![] }, by_rule: vec![] };
        let cut = |line, part, reason: &str| Cut { line, part, from: 0, to: 2, s: 0.0, e: 0.9, reason: reason.into(), source: Source::Claude, instead: None };
        assert_eq!(cuts(&lines, &d, &[]), [cut(1, 1, "earlier take"), cut(3, 2, "fumble")]);
    }
}
