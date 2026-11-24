//! Home's delete confirm (design/home-screen.md): the only guard before a project is gone for good (no undo, no
//! trash), so **Cancel is the default button**: Return and Esc keep the project. On Home Return means "open", so a
//! Delete default would turn ⌫ then Return into a lost project.
//!
//! The web `ask` can't choose the default (its OK button is always first, the default). Here the first button,
//! the default, is labelled Cancel and the second Delete, and only the answer "Delete" deletes: anything else,
//! whatever the dialog reports, keeps the project.

use tauri_plugin_dialog::{MessageDialogButtons, MessageDialogKind, MessageDialogResult};

pub const CANCEL: &str = "Cancel";
pub const DELETE: &str = "Delete";

/// First button = the default (Return; Esc picks the one titled Cancel on the Mac): Cancel. Then Delete.
pub fn buttons() -> MessageDialogButtons {
    MessageDialogButtons::OkCancelCustom(CANCEL.into(), DELETE.into())
}

/// True only when Delete itself was pressed.
pub fn deletes(answer: &MessageDialogResult) -> bool {
    matches!(answer, MessageDialogResult::Custom(label) if label == DELETE)
}

pub const KIND: MessageDialogKind = MessageDialogKind::Warning;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancel_is_the_first_button_so_return_and_esc_keep_the_project() {
        match buttons() {
            MessageDialogButtons::OkCancelCustom(first, second) => {
                assert_eq!(first, "Cancel");
                assert_eq!(second, "Delete");
            }
            _ => panic!("two custom buttons, Cancel first"),
        }
    }

    #[test]
    fn only_delete_deletes() {
        assert!(deletes(&MessageDialogResult::Custom("Delete".into())));
        for keep in [
            MessageDialogResult::Custom("Cancel".into()), // Return, Esc, or a click on Cancel
            MessageDialogResult::Ok,
            MessageDialogResult::Cancel,
            MessageDialogResult::Yes,
            MessageDialogResult::No,
            MessageDialogResult::Custom(String::new()),
        ] {
            assert!(!deletes(&keep), "{keep:?} keeps the project");
        }
    }
}
