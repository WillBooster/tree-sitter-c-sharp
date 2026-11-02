#ifndef TREE_SITTER_C_SHARP_AWAIT_IDENTIFIER_H_
#define TREE_SITTER_C_SHARP_AWAIT_IDENTIFIER_H_

static QuestionScanResult scan_await_word(TSLexer *lexer);
static bool await_continues_identifier(TSLexer *lexer);
static bool skip_await_trivia(TSLexer *lexer);
static bool is_ascii_in(int32_t c, const char *characters);

static QuestionScanResult scan_await_identifier(TSLexer *lexer, const bool *valid_symbols) {
    // The scanner's later branches must see the `as` or pragma text that a consumed word would hide, and directive
    // ends must see the line break that skipped whitespace would hide.
    if (!valid_symbols[AWAIT_IDENTIFIER] || valid_symbols[TYPE_CONTEXT_AS] || valid_symbols[PRAGMA_TEXT] ||
        valid_symbols[PRAGMA_BOUNDARY] || valid_symbols[DIRECTIVE_NEWLINE] || valid_symbols[FILE_DIRECTIVE_NEWLINE] ||
        valid_symbols[END_OF_INPUT])
        return QUESTION_NOT_STARTED;
    return scan_await_word(lexer);
}

// `await` is the await operator inside async functions and an identifier elsewhere, but the parser does not track async
// context. Like Roslyn outside async functions, this takes `await` as an identifier when the next token continues an
// identifier expression rather than starting an operand. Of the tokens that can do both, `+`, `-`, `*`, `&`, `^`, and `[`
// make an identifier because awaiting such a unary or collection operand is rare, while `(` keeps the operator because
// `await (task)` is common in async functions; `..` and a `!` followed by an operand keep it as well, as the identifier
// reading is no more common there.
static QuestionScanResult scan_await_word(TSLexer *lexer) {
    while (is_space_but_line_feed(lexer->lookahead) || is_line_terminator(lexer->lookahead)) skip(lexer);
    if (lexer->lookahead != 'a') return QUESTION_NOT_STARTED;
    char word[6] = {0};
    size_t length = consume_identifier_into(lexer, word, sizeof(word));
    if (!buf_equals(word, length, "await") || lexer->lookahead == '\\') return QUESTION_MISMATCHED;
    lexer->mark_end(lexer);
    lexer->result_symbol = AWAIT_IDENTIFIER;
    return await_continues_identifier(lexer) ? QUESTION_MATCHED : QUESTION_MISMATCHED;
}

static bool await_continues_identifier(TSLexer *lexer) {
    if (!skip_await_trivia(lexer) || lexer->eof(lexer)) return true;
    int32_t c = lexer->lookahead;
    if (c == '.') {
        advance(lexer);
        return lexer->lookahead != '.' && (lexer->lookahead < '0' || lexer->lookahead > '9');
    }
    if (c == '!') {
        advance(lexer);
        return !skip_await_trivia(lexer) || lexer->eof(lexer) || is_ascii_in(lexer->lookahead, ")]},;:?=.[");
    }
    if (is_ascii_in(c, ")]},;:?=<>|&^*%+-[")) return true;
    char word[7] = {0};
    size_t length = consume_identifier_into(lexer, word, sizeof(word));
    if (lexer->lookahead == '\\') return false;
    if (buf_equals(word, length, "with")) return skip_await_trivia(lexer) && lexer->lookahead == '{';
    return buf_equals(word, length, "is") || buf_equals(word, length, "as") || buf_equals(word, length, "switch");
}

// Skips whitespace, comments, and directive lines. Returns false after consuming a `/` that is a division operator or
// an unterminated comment.
static bool skip_await_trivia(TSLexer *lexer) {
    bool line_start = false;
    for (;;) {
        while (is_space_but_line_feed(lexer->lookahead) || is_line_terminator(lexer->lookahead)) {
            line_start = line_start || is_line_terminator(lexer->lookahead);
            advance(lexer);
        }
        if (line_start && lexer->lookahead == '#') {
            skip_line_comment(lexer);
            continue;
        }
        if (lexer->lookahead != '/') return true;
        advance(lexer);
        if (lexer->lookahead == '/') skip_line_comment(lexer);
        else if (lexer->lookahead != '*' || !skip_block_comment(lexer)) return false;
    }
}

// Wasm parsers cannot link `strchr`.
static bool is_ascii_in(int32_t c, const char *characters) {
    for (; *characters; characters++) {
        if (c == *characters) return true;
    }
    return false;
}

#endif
