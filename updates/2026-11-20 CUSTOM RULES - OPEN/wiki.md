# Custom rules — wiki

- The engine stays pure: rules arrive as `&[String]`; only `main.rs` touches the store.
- Built-in rules first, the user's after with "where they differ, they win": Claude follows the last, most specific word.
- Write the file through a temp file and a rename: a save is all or nothing.
