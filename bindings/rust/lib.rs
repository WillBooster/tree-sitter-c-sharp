//! This crate provides C# language support for the [tree-sitter] parsing library.
//!
//! Typically, you will use the [`LANGUAGE`] constant to add this language to a
//! tree-sitter [`Parser`], and then use the parser to parse some code:
//!
//! ```
//! let code = "class Program {\n    static void Main() => System.Console.WriteLine(\"Hello\");\n}\n";
//! let mut parser = tree_sitter::Parser::new();
//! let language = tree_sitter_c_sharp::LANGUAGE;
//! parser
//!     .set_language(&language.into())
//!     .expect("Error loading C# parser");
//! let tree = parser.parse(code, None).unwrap();
//! assert!(!tree.root_node().has_error());
//! ```
//!
//! [`Parser`]: https://docs.rs/willbooster-tree-sitter/1/tree_sitter/struct.Parser.html
//! [tree-sitter]: https://tree-sitter.github.io/

use tree_sitter_language::LanguageFn;

unsafe extern "C" {
    fn tree_sitter_c_sharp() -> *const ();
}

/// The tree-sitter [`LanguageFn`] for this grammar.
pub const LANGUAGE: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_c_sharp) };

/// The content of the [`node-types.json`] file for this grammar.
///
/// [`node-types.json`]: https://tree-sitter.github.io/tree-sitter/using-parsers/6-static-node-types
pub const NODE_TYPES: &str = include_str!("../../src/node-types.json");

#[cfg(test)]
mod tests {
    use tree_sitter::{InputEdit, Parser, Point, Tree};

    fn new_parser() -> Parser {
        let mut parser = Parser::new();
        parser
            .set_language(&super::LANGUAGE.into())
            .expect("Error loading C# parser");
        parser
    }

    fn point_at(code: &[u8], offset: usize) -> Point {
        let line_start = code[..offset]
            .iter()
            .rposition(|&byte| byte == b'\n')
            .map_or(0, |index| index + 1);
        let row = code[..offset].iter().filter(|&&byte| byte == b'\n').count();
        Point::new(row, offset - line_start)
    }

    /// Replaces `deleted_length` bytes at `position` with `inserted` in both `code` and `tree`, and returns the edit
    /// that undoes it.
    fn edit(
        tree: &mut Tree,
        code: &mut Vec<u8>,
        (position, deleted_length, inserted): (usize, usize, &[u8]),
    ) -> (usize, usize, Vec<u8>) {
        let removed = code[position..position + deleted_length].to_vec();
        let start_position = point_at(code, position);
        let old_end_position = point_at(code, position + deleted_length);
        code.splice(
            position..position + deleted_length,
            inserted.iter().copied(),
        );
        tree.edit(&InputEdit {
            start_byte: position,
            old_end_byte: position + deleted_length,
            new_end_byte: position + inserted.len(),
            start_position,
            old_end_position,
            new_end_position: point_at(code, position + inserted.len()),
        });
        (position, inserted.len(), removed)
    }

    /// Parses `code`, applies `edits` and reparses, undoes them and reparses again, and returns the final tree and a
    /// fresh parse of the same text.
    fn reparse_after_undoing(code: &str, edits: &[(usize, usize, &[u8])]) -> (String, String) {
        let mut parser = new_parser();
        let mut code = code.as_bytes().to_vec();
        let mut tree = parser.parse(&code, None).unwrap();
        let undo: Vec<_> = edits
            .iter()
            .map(|&e| edit(&mut tree, &mut code, e))
            .collect();
        let mut tree = parser.parse(&code, Some(&tree)).unwrap();
        for (position, deleted_length, inserted) in undo.iter().rev() {
            edit(&mut tree, &mut code, (*position, *deleted_length, inserted));
        }
        let tree = parser.parse(&code, Some(&tree)).unwrap();
        let fresh = parser.parse(&code, None).unwrap();
        (tree.root_node().to_sexp(), fresh.root_node().to_sexp())
    }

    #[test]
    fn test_can_load_grammar() {
        new_parser();
    }

    // The input and edits are the corpus case "Precedence between is operator and as operator" and the edits
    // `tree-sitter fuzz` makes with TREE_SITTER_SEED=1133. They leave a syntax error before the unchanged last line.
    #[test]
    fn test_parsing_var_as_an_implicit_type_after_an_error_on_a_preceding_line() {
        let mut parser = new_parser();
        let mut code = concat!(
            "\n",
            "//var a = new object() is null as Object == false; // this parses with wrong precedence\n",
            "var a = new object() is null as Object;\n",
            "var b = true == 1 as int? is int;\n",
        )
        .as_bytes()
        .to_vec();
        let mut tree = parser.parse(&code, None).unwrap();
        for e in [(16, 64, &b"2B7QP"[..]), (0, 0, b"4 & "), (18, 0, b"j9F7nu")] {
            edit(&mut tree, &mut code, e);
        }
        let var_b = code.windows(5).position(|w| w == b"var b").unwrap();
        let var_kind = |tree: &Tree| {
            tree.root_node()
                .named_descendant_for_byte_range(var_b, var_b + 3)
                .unwrap()
                .kind()
                .to_string()
        };

        let reparsed = parser.parse(&code, Some(&tree)).unwrap();
        assert_eq!(var_kind(&reparsed), "implicit_type");
        assert_eq!(
            var_kind(&parser.parse(&code, None).unwrap()),
            "implicit_type"
        );
    }

    // The input and edits are the corpus case "Identifiers" and the edits `tree-sitter fuzz` makes with
    // TREE_SITTER_SEED=6575. One of them splits the three bytes of U+203F in `first\u{203F}letter`, right after the token
    // `first`.
    #[test]
    fn test_reparsing_an_identifier_after_undoing_an_edit_inside_the_character_after_it() {
        let (incremental, fresh) = reparse_after_undoing(
            concat!(
                "\n",
                "int x = y;\n",
                "\n",
                "// keyword names\n",
                "int @var = @const;\n",
                "\n",
                "// contextual keyword names\n",
                "int nint = 0;\n",
                "int nuint = 0;\n",
                "\n",
                "// unicode identifiers\n",
                "int under_score = 0;\n",
                "int with1number = 0;\n",
                "int var\u{E6}ble = 0;\n",
                "int \u{41F}\u{435}\u{440}\u{435}\u{43C}\u{435}\u{43D}\u{43D}\u{430}\u{44F} = 0;\n",
                "int first\u{203F}letter = 0;\n",
                "int \u{D9C}\u{DCA}\u{200D}\u{DBB}\u{DC4}\u{DBD}\u{DDD}\u{D9A}\u{DBA} = 0;\n",
                "int _\u{643}\u{648}\u{643}\u{628}xxx = 0;\n",
            ),
            &[
                (304, 0, b"W2Sf"),
                (135, 0, b""),
                (128, 0, b"Rc8 *"),
                (96, 128, b""),
                (181, 4, b""),
                (181, 0, b"g39Ua"),
                (109, 33, b""),
            ],
        );
        assert!(!fresh.contains("ERROR"));
        assert_eq!(incremental, fresh);
    }
}
