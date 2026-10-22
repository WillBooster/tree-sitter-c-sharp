#ifndef TREE_SITTER_C_SHARP_IF_ALTERNATIVE_DIRECTIVE_H_
#define TREE_SITTER_C_SHARP_IF_ALTERNATIVE_DIRECTIVE_H_

static bool scan_directive_word(TSLexer *lexer, const char *word);

// Marks an `#if` after an if statement's consequence when its first branch continues that statement with `else`.
// Deciding here keeps a directive that starts the next statement from being read as part of the if statement.
static QuestionScanResult scan_if_alternative_directive(TSLexer *lexer, const bool *valid_symbols) {
    if (!valid_symbols[IF_ALTERNATIVE_DIRECTIVE]) return QUESTION_NOT_STARTED;
    while (is_space_but_line_feed(lexer->lookahead) || is_line_terminator(lexer->lookahead)) skip(lexer);
    if (lexer->lookahead != '#') return QUESTION_NOT_STARTED;
    lexer->mark_end(lexer);
    advance(lexer);
    while (is_directive_horizontal(lexer->lookahead)) advance(lexer);
    if (!scan_directive_word(lexer, "if")) return QUESTION_MISMATCHED;
    while (!lexer->eof(lexer) && !is_line_terminator(lexer->lookahead)) advance(lexer);
    skip_ws_and_comments(lexer);
    if (!scan_directive_word(lexer, "else")) return QUESTION_MISMATCHED;
    lexer->result_symbol = IF_ALTERNATIVE_DIRECTIVE;
    return QUESTION_MATCHED;
}

static bool scan_directive_word(TSLexer *lexer, const char *word) {
    for (; *word; word++) {
        if (lexer->lookahead != *word) return false;
        advance(lexer);
    }
    return !is_id_continue(lexer->lookahead) && lexer->lookahead != '\\';
}

#endif // TREE_SITTER_C_SHARP_IF_ALTERNATIVE_DIRECTIVE_H_
