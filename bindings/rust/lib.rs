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
//! Use `willbooster-tree-sitter` 15.0.0 or later within major version 15; upstream's `tree-sitter` crate rejects this parser.
//!
//! [`Parser`]: https://docs.rs/willbooster-tree-sitter/15.0.0/tree_sitter/struct.Parser.html
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
    use tree_sitter::Parser;

    fn new_parser() -> Parser {
        let mut parser = Parser::new();
        parser
            .set_language(&super::LANGUAGE.into())
            .expect("Error loading C# parser");
        parser
    }

    #[test]
    fn test_can_load_grammar() {
        new_parser();
    }

    // The input was captured by `tree-sitter fuzz` with TREE_SITTER_SEED=1133.
    #[test]
    fn test_parsing_var_as_an_implicit_type_after_an_error_on_a_preceding_line() {
        let code = concat!(
            "4 & \n",
            "//var a = newj9F7nu o2B7QPecedence\n",
            "var a = new object() is null as Object;\n",
            "var b = true == 1 as int? is int;\n",
        );
        let var_b = code.find("var b").unwrap();
        let tree = new_parser().parse(code, None).unwrap();
        assert_eq!(
            tree.root_node()
                .named_descendant_for_byte_range(var_b, var_b + 3)
                .unwrap()
                .kind(),
            "implicit_type"
        );
    }
}
