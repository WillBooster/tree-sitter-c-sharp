#ifndef TREE_SITTER_C_SHARP_QUESTION_LITERALS_H_
#define TREE_SITTER_C_SHARP_QUESTION_LITERALS_H_

typedef Array(char) RankGroups;
typedef enum { RANK_READ_UNKNOWN, RANK_READ_MORE, RANK_READ_DONE, RANK_READ_TOKEN } RankReadStep;
typedef enum { RANK_BODY_BRACKET, RANK_BODY_EXPRESSION, RANK_BODY_QUESTION_FREE, RANK_BODY_INTERPOLATION_QUESTION_FREE } RankBodyMode;

static bool rank_read_delimited(TSLexer *lexer, char opening, RankBodyMode mode, bool *force_unsafe);
static bool rank_read_delimited_body(TSLexer *lexer, char opening, RankBodyMode mode, bool *force_unsafe, unsigned format_braces);
static RankReadStep rank_close_delimited(TSLexer *lexer, RankGroups *groups, int32_t c, unsigned format_braces);
static bool rank_read_closing_braces(TSLexer *lexer, unsigned count);
static bool rank_read_format(TSLexer *lexer, unsigned closing_braces);
static bool rank_skip_delimited_token(TSLexer *lexer, RankGroups *groups, int32_t c, RankBodyMode mode, bool *access, bool *force_unsafe);
static RankReadStep rank_skip_literal(TSLexer *lexer, int32_t c, RankBodyMode mode, bool *force_unsafe);
static bool rank_skip_interpolated(TSLexer *lexer, bool verbatim, RankBodyMode mode, bool *force_unsafe);
static bool rank_skip_interpolated_body(TSLexer *lexer, bool verbatim, RankBodyMode mode, bool *force_unsafe);
static bool rank_skip_raw_interpolated(TSLexer *lexer, unsigned quotes, unsigned dollars, RankBodyMode mode, bool *force_unsafe);
static bool rank_skip_raw_hole(TSLexer *lexer, unsigned braces, unsigned dollars, RankBodyMode mode, bool *force_unsafe);
static unsigned rank_read_character_run(TSLexer *lexer, int32_t character);

static bool rank_read_delimited(TSLexer *lexer, char opening, RankBodyMode mode, bool *force_unsafe) {
    return rank_read_delimited_body(lexer, opening, mode, force_unsafe, 0);
}

static bool rank_read_delimited_body(TSLexer *lexer, char opening, RankBodyMode mode, bool *force_unsafe, unsigned format_braces) {
    RankGroups groups = array_new();
    array_push(&groups, opening);
    bool content = false;
    bool valid = false;
    bool access = false;
    bool colon = false;
    while (!lexer->eof(lexer)) {
        int32_t c = question_skip_separators(lexer);
        if (c == -2 || c == '#' || lexer->eof(lexer)) break;
        if (c == -1) { content = true; continue; }
        if (c == ')' || c == ']' || c == '}') {
            RankReadStep closing = rank_close_delimited(lexer, &groups, c, format_braces);
            if (closing != RANK_READ_MORE) {
                valid = closing == RANK_READ_DONE && (content || mode != RANK_BODY_BRACKET);
                break;
            }
            continue;
        }
        content = true;
        if (c == ':' && groups.size == 1 && format_braces) {
            advance(lexer);
            if (lexer->lookahead == ':') { advance(lexer); continue; }
            valid = rank_read_format(lexer, format_braces);
            break;
        }
        if (c == ':') colon = true;
        if (!rank_skip_delimited_token(lexer, &groups, c, mode, &access, force_unsafe)) break;
    }
    array_delete(&groups);
    if (force_unsafe) *force_unsafe |= access && colon;
    return valid;
}

static RankReadStep rank_close_delimited(TSLexer *lexer, RankGroups *groups, int32_t c, unsigned format_braces) {
    char expected = c == ')' ? '(' : c == ']' ? '[' : '{';
    if (*array_back(groups) != expected) return RANK_READ_UNKNOWN;
    array_pop(groups);
    advance(lexer);
    if (groups->size) return RANK_READ_MORE;
    return rank_read_closing_braces(lexer, format_braces > 0 ? format_braces - 1 : 0) ? RANK_READ_DONE : RANK_READ_UNKNOWN;
}

static bool rank_read_closing_braces(TSLexer *lexer, unsigned count) {
    for (unsigned i = 0; i < count; i++) {
        if (lexer->lookahead != '}') return false;
        advance(lexer);
    }
    return true;
}

static bool rank_read_format(TSLexer *lexer, unsigned closing_braces) {
    unsigned braces = 0;
    while (!lexer->eof(lexer)) {
        braces = lexer->lookahead == '}' ? braces + 1 : 0;
        advance(lexer);
        if (braces == closing_braces) return true;
    }
    return false;
}

static bool rank_skip_delimited_token(TSLexer *lexer, RankGroups *groups, int32_t c, RankBodyMode mode, bool *access, bool *force_unsafe) {
    bool question_free = mode == RANK_BODY_QUESTION_FREE || mode == RANK_BODY_INTERPOLATION_QUESTION_FREE;
    if (question_free && c == '?') return false;
    RankReadStep literal = rank_skip_literal(lexer, c, question_free ? mode : RANK_BODY_EXPRESSION, force_unsafe);
    if (literal != RANK_READ_TOKEN) return literal == RANK_READ_MORE;
    if (c == '@') return true;
    if (c == '?') {
        advance(lexer);
        bool binding = question_skip_separators(lexer) == '[';
        *access |= binding;
        return mode != RANK_BODY_BRACKET || !binding;
    }
    if (c == '(' || c == '[' || c == '{') array_push(groups, (char)c);
    advance(lexer);
    return true;
}

static RankReadStep rank_skip_literal(TSLexer *lexer, int32_t c, RankBodyMode mode, bool *force_unsafe) {
    if (c == '"' || c == '\'')
        return question_skip_quoted(lexer, false) ? RANK_READ_MORE : RANK_READ_UNKNOWN;
    if (c == '$') return rank_skip_interpolated(lexer, false, mode, force_unsafe) ? RANK_READ_MORE : RANK_READ_UNKNOWN;
    if (c != '@') return RANK_READ_TOKEN;
    advance(lexer);
    if (lexer->lookahead == '$')
        return rank_skip_interpolated(lexer, true, mode, force_unsafe) ? RANK_READ_MORE : RANK_READ_UNKNOWN;
    if (lexer->lookahead == '"')
        return question_skip_quoted(lexer, true) ? RANK_READ_MORE : RANK_READ_UNKNOWN;
    return RANK_READ_TOKEN;
}

static bool rank_skip_interpolated(TSLexer *lexer, bool verbatim, RankBodyMode mode, bool *force_unsafe) {
    if (mode == RANK_BODY_QUESTION_FREE) mode = RANK_BODY_INTERPOLATION_QUESTION_FREE;
    unsigned dollars = rank_read_character_run(lexer, '$');
    if (!verbatim && lexer->lookahead == '@') { verbatim = true; advance(lexer); }
    if (lexer->lookahead != '"') return false;
    if (verbatim) {
        if (dollars != 1) return false;
        advance(lexer);
        return rank_skip_interpolated_body(lexer, true, mode, force_unsafe);
    }
    unsigned quotes = rank_read_character_run(lexer, '"');
    if (quotes >= 3) return rank_skip_raw_interpolated(lexer, quotes, dollars, mode, force_unsafe);
    if (dollars != 1) return false;
    return quotes == 2 || rank_skip_interpolated_body(lexer, false, mode, force_unsafe);
}

static bool rank_skip_interpolated_body(TSLexer *lexer, bool verbatim, RankBodyMode mode, bool *force_unsafe) {
    while (!lexer->eof(lexer)) {
        int32_t c = lexer->lookahead;
        advance(lexer);
        if (c == '"') {
            if (!verbatim || lexer->lookahead != '"') return true;
            advance(lexer);
        } else if (c == '\\' && !verbatim) {
            if (lexer->eof(lexer)) return false;
            advance(lexer);
        } else if (c == '{') {
            if (lexer->lookahead == '{') advance(lexer);
            else if (!rank_read_delimited_body(lexer, '{', mode, force_unsafe, 1)) return false;
        } else if (c == '}') {
            if (lexer->lookahead != '}') return false;
            advance(lexer);
        } else if (!verbatim && is_line_terminator(c)) return false;
    }
    return false;
}

static bool rank_skip_raw_interpolated(TSLexer *lexer, unsigned quotes, unsigned dollars, RankBodyMode mode, bool *force_unsafe) {
    while (!lexer->eof(lexer)) {
        int32_t c = lexer->lookahead;
        if (c == '"') {
            unsigned count = rank_read_character_run(lexer, c);
            if (count >= quotes) return count == quotes;
        } else if (c == '{') {
            unsigned count = rank_read_character_run(lexer, c);
            if (!rank_skip_raw_hole(lexer, count, dollars, mode, force_unsafe)) return false;
        } else if (c == '}') {
            if (rank_read_character_run(lexer, c) >= dollars) return false;
        } else {
            advance(lexer);
        }
    }
    return false;
}

static bool rank_skip_raw_hole(TSLexer *lexer, unsigned braces, unsigned dollars, RankBodyMode mode, bool *force_unsafe) {
    if (braces < dollars) return true;
    if (braces - dollars >= dollars) return false;
    return rank_read_delimited_body(lexer, '{', mode, force_unsafe, dollars);
}

static unsigned rank_read_character_run(TSLexer *lexer, int32_t character) {
    unsigned count = 0;
    while (lexer->lookahead == character && !lexer->eof(lexer)) {
        count++;
        advance(lexer);
    }
    return count;
}

#endif
