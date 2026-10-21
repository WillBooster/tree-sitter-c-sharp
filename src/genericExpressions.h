#ifndef TREE_SITTER_C_SHARP_GENERIC_EXPRESSIONS_H_
#define TREE_SITTER_C_SHARP_GENERIC_EXPRESSIONS_H_

static bool expression_generic_following(TSLexer *lexer);

static QuestionScanResult scan_expression_generic_end(TSLexer *lexer, const bool *valid_symbols) {
    if (!valid_symbols[EXPRESSION_GENERIC_END] && !valid_symbols[DEFINITE_EXPRESSION_GENERIC_END]) return QUESTION_NOT_STARTED;
    while (is_space_but_line_feed(lexer->lookahead) || is_line_terminator(lexer->lookahead)) skip(lexer);
    if (lexer->lookahead != '>') return QUESTION_NOT_STARTED;
    advance(lexer);
    lexer->mark_end(lexer);
    if (lexer->lookahead == '=') return QUESTION_MISMATCHED;
    if (valid_symbols[EXPRESSION_GENERIC_END] && expression_generic_following(lexer)) {
        lexer->result_symbol = EXPRESSION_GENERIC_END;
        return QUESTION_MATCHED;
    }
    if (!valid_symbols[DEFINITE_EXPRESSION_GENERIC_END]) return QUESTION_MISMATCHED;
    lexer->result_symbol = DEFINITE_EXPRESSION_GENERIC_END;
    return QUESTION_MATCHED;
}

static bool expression_generic_following(TSLexer *lexer) {
    int32_t c = question_skip_separators(lexer);
    if (lexer->eof(lexer) || c == '#') return true;
    if (c == -2 || c == -1) return false;
    switch (c) {
        case '(': case ')': case '[': case ']': case '}': case ';': case ',': return true;
        case ':': return true;
        case '.': advance(lexer); return !(lexer->lookahead >= '0' && lexer->lookahead <= '9');
        case '?': advance(lexer); return lexer->lookahead != '?';
        case '&': case '|': case '^': advance(lexer); return lexer->lookahead != '=';
        case '<': advance(lexer); return lexer->lookahead != '<';
        case '>': advance(lexer); return lexer->lookahead == '=';
        case '!': advance(lexer); return lexer->lookahead == '=';
        case '=': advance(lexer); return lexer->lookahead == '=' || lexer->lookahead == '>';
        default: break;
    }
    QuestionIdentifier word;
    if (!rank_read_identifier(lexer, &word)) return false;
    if (!word.keyword) return true;
    if (!strcmp(word.word, "is") || !strcmp(word.word, "as")) return true;
    return strcmp(word.word, "with") && rank_identifier_allowed(&word, false);
}

#endif
