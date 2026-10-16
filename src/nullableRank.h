#ifndef TREE_SITTER_C_SHARP_NULLABLE_RANK_H_
#define TREE_SITTER_C_SHARP_NULLABLE_RANK_H_

typedef enum {
    RANK_NONE,
    RANK_NULLABLE_LAST,
    RANK_NULLABLE_NEXT,
    RANK_TERNARY,
    RANK_AFTER_NULLABLE,
} NullableRankRole;

typedef enum { RANK_ATOM, RANK_IS_TYPE, RANK_QUESTION, RANK_COLON, RANK_CONTINUATION, RANK_AS, RANK_SWITCH, RANK_BINARY, RANK_END } RankTokenKind;
typedef struct { RankTokenKind kind; bool collection; } RankToken;
typedef Array(RankToken) RankTokens;
typedef Array(char) RankGroups;
typedef enum { RANK_BODY_BRACKET, RANK_BODY_EXPRESSION } RankBodyMode;
typedef struct { unsigned end; uint8_t role; bool collection_ternary; bool valid; } RankParse;

static uint8_t rank_stream_role(TSLexer *lexer, uint32_t pending);
static bool rank_read_prefix(TSLexer *lexer);
static bool rank_read_type_suffixes(TSLexer *lexer);
static bool rank_read_type_member(TSLexer *lexer);
static bool rank_read_type_arguments(TSLexer *lexer);
static bool rank_read_type_name(TSLexer *lexer);
static bool rank_read_identifier(TSLexer *lexer, QuestionIdentifier *identifier);
static bool rank_identifier_allowed(const QuestionIdentifier *word, bool type);
static bool rank_read_bracket(TSLexer *lexer, bool empty);
static bool rank_read_delimited(TSLexer *lexer, char opening, RankBodyMode mode);
static bool rank_skip_delimited_token(TSLexer *lexer, RankGroups *groups, int32_t c);
static bool rank_read_stream(TSLexer *lexer, RankTokens *tokens, unsigned *colons);
static bool rank_read_atom(TSLexer *lexer, RankTokens *tokens);
static bool rank_read_operator(TSLexer *lexer, RankTokens *tokens, unsigned *colons, bool *atom, bool division);
static bool rank_read_postfix(TSLexer *lexer, int32_t c);
static bool rank_read_as(TSLexer *lexer, bool *colon);
static bool rank_read_as_type(TSLexer *lexer, bool *colon);
static bool rank_read_as_name(TSLexer *lexer, bool *colon);
static bool rank_read_as_name_part(TSLexer *lexer);
static bool rank_read_as_arguments(TSLexer *lexer, int32_t close);
static bool rank_read_as_rank(TSLexer *lexer);
static bool rank_read_switch(TSLexer *lexer);
static bool rank_read_binary(TSLexer *lexer, int32_t c, bool *postfix, bool *colon);
static bool rank_skip_binary_operator(TSLexer *lexer, int32_t c, bool *postfix, bool updates);
static bool rank_read_binary_rhs(TSLexer *lexer, bool *colon);
static bool rank_skip_rhs_token(TSLexer *lexer, int32_t c);
static bool rank_skip_rhs_question(TSLexer *lexer);
static bool rank_read_terminal(TSLexer *lexer, bool *colon);
static bool rank_read_question(TSLexer *lexer, RankTokens *tokens, bool *colon);
static RankParse rank_evaluate(const RankTokens *tokens, unsigned target);
static RankParse rank_parse(const RankTokens *tokens, const RankParse *memo, unsigned start, bool force, unsigned target);
static unsigned rank_conditional(const RankTokens *tokens, const RankParse *memo, unsigned pos, bool force, unsigned target, RankParse *result);

static uint8_t rank_stream_role(TSLexer *lexer, uint32_t pending) {
    if (!rank_read_prefix(lexer)) return RANK_NONE;
    advance(lexer);
    if (!rank_read_bracket(lexer, true)) return RANK_NONE;
    RankTokens tail = array_new();
    unsigned colons = 0;
    if (!rank_read_stream(lexer, &tail, &colons) || pending > colons) {
        array_delete(&tail);
        return RANK_NONE;
    }
    RankTokens tokens = array_new();
    for (uint32_t i = 0; i < pending; i++) {
        array_push(&tokens, ((RankToken){RANK_ATOM, false}));
        array_push(&tokens, ((RankToken){RANK_QUESTION, false}));
    }
    array_push(&tokens, ((RankToken){RANK_IS_TYPE, false}));
    unsigned target = tokens.size;
    array_push(&tokens, ((RankToken){RANK_QUESTION, true}));
    array_push(&tokens, ((RankToken){RANK_ATOM, true}));
    for (unsigned i = 0; i < tail.size; i++) array_push(&tokens, tail.contents[i]);
    bool has_next = tail.size > 1 && tail.contents[0].kind == RANK_QUESTION;
    RankParse parsed = rank_evaluate(&tokens, target);
    uint8_t result = RANK_NONE;
    if (parsed.valid && parsed.end == tokens.size - 1) {
        if (parsed.role == RANK_TERNARY) result = RANK_TERNARY;
        else if (parsed.role == RANK_NULLABLE_LAST) result = has_next ? RANK_NULLABLE_NEXT : RANK_NULLABLE_LAST;
    }
    array_delete(&tokens);
    array_delete(&tail);
    return result;
}

static bool rank_read_prefix(TSLexer *lexer) {
    bool operand = true;
    while (!lexer->eof(lexer)) {
        if (question_skip_separators(lexer) < 0) return false;
        if (!operand && lexer->lookahead == '?') return true;
        QuestionIdentifier word;
        if (!rank_read_identifier(lexer, &word)) return false;
        bool logical = word.keyword && (!strcmp(word.word, "and") || !strcmp(word.word, "or"));
        if (!operand) {
            if (!logical) return false;
            operand = true;
            continue;
        }
        if (logical) return false;
        if (word.keyword && !strcmp(word.word, "not")) continue;
        if (!rank_identifier_allowed(&word, true) || !rank_read_type_suffixes(lexer)) return false;
        operand = false;
    }
    return false;
}

static bool rank_read_type_suffixes(TSLexer *lexer) {
    for (;;) {
        int32_t next = question_skip_separators(lexer);
        if (next == '.') {
            if (!rank_read_type_member(lexer)) return false;
        } else if (next == '<') {
            if (!rank_read_type_arguments(lexer)) return false;
        } else return next >= 0;
    }
}

static bool rank_read_type_member(TSLexer *lexer) {
    advance(lexer);
    if (question_skip_separators(lexer) < 0) return false;
    QuestionIdentifier name;
    return rank_read_identifier(lexer, &name) && rank_identifier_allowed(&name, true);
}

static bool rank_read_type_arguments(TSLexer *lexer) {
    advance(lexer);
    for (;;) {
        if (!rank_read_type_name(lexer)) return false;
        int32_t next = question_skip_separators(lexer);
        if (next != ',' && next != '>') return false;
        advance(lexer);
        if (next == '>') return true;
    }
}

static bool rank_read_type_name(TSLexer *lexer) {
    if (question_skip_separators(lexer) < 0) return false;
    QuestionIdentifier name;
    if (!rank_read_identifier(lexer, &name) || !rank_identifier_allowed(&name, true)) return false;
    while (question_skip_separators(lexer) == '.')
        if (!rank_read_type_member(lexer)) return false;
    return true;
}

static bool rank_read_identifier(TSLexer *lexer, QuestionIdentifier *identifier) {
    bool verbatim = lexer->lookahead == '@';
    if (verbatim) advance(lexer);
    if (!is_id_start(lexer->lookahead) && lexer->lookahead != '\\') return false;
    return question_identifier(lexer, verbatim, identifier);
}

static bool rank_identifier_allowed(const QuestionIdentifier *word, bool type) {
    if (!word->keyword) return true;
    static const char *const forbidden[] = {
        "abstract", "as", "break", "case", "catch", "checked", "class", "const", "continue", "default", "delegate",
        "do", "else", "enum", "event", "explicit", "extern", "finally", "fixed", "for", "foreach", "goto", "if",
        "implicit", "in", "interface", "internal", "is", "lock", "namespace", "new", "operator", "out", "override",
        "params", "private", "protected", "public", "readonly", "ref", "return", "sealed", "sizeof", "stackalloc",
        "static", "struct", "switch", "throw", "try", "typeof", "unchecked", "unsafe", "using", "virtual", "volatile",
        "while", "await", "var"
    };
    for (unsigned i = 0; i < sizeof(forbidden) / sizeof(forbidden[0]); i++)
        if (!strcmp(word->word, forbidden[i])) return false;
    bool literal = !strcmp(word->word, "true") || !strcmp(word->word, "false") || !strcmp(word->word, "null") ||
        !strcmp(word->word, "this") || !strcmp(word->word, "base");
    return !type || !literal;
}

static bool rank_read_bracket(TSLexer *lexer, bool empty) {
    if (question_skip_separators(lexer) != '[') return false;
    advance(lexer);
    if (question_skip_separators(lexer) < 0) return false;
    if (!empty) return rank_read_delimited(lexer, '[', RANK_BODY_BRACKET);
    if (lexer->lookahead != ']') return false;
    advance(lexer);
    return true;
}

static bool rank_read_delimited(TSLexer *lexer, char opening, RankBodyMode mode) {
    RankGroups groups = array_new();
    array_push(&groups, opening);
    bool content = false;
    bool valid = false;
    while (!lexer->eof(lexer)) {
        int32_t c = question_skip_separators(lexer);
        if (c == -2 || c == '$' || c == '#' || lexer->eof(lexer)) break;
        if (c == -1) { content = true; continue; }
        if (c == ')' || c == ']' || c == '}') {
            char expected = c == ')' ? '(' : c == ']' ? '[' : '{';
            if (*array_back(&groups) != expected) break;
            array_pop(&groups);
            advance(lexer);
            if (!groups.size) { valid = content || mode == RANK_BODY_EXPRESSION; break; }
            continue;
        }
        content = true;
        if (!rank_skip_delimited_token(lexer, &groups, c)) break;
    }
    array_delete(&groups);
    return valid;
}

static bool rank_skip_delimited_token(TSLexer *lexer, RankGroups *groups, int32_t c) {
    if (c == '"' || c == '\'') return question_skip_quoted(lexer, false);
    if (c == '@') {
        advance(lexer);
        return lexer->lookahead != '"' || question_skip_quoted(lexer, true);
    }
    if (c == '?') {
        advance(lexer);
        return question_skip_separators(lexer) != '[';
    }
    if (c == '(' || c == '[' || c == '{') array_push(groups, (char)c);
    advance(lexer);
    return true;
}

static bool rank_read_stream(TSLexer *lexer, RankTokens *tokens, unsigned *colons) {
    bool atom = false;
    while (!lexer->eof(lexer)) {
        int32_t c = question_skip_separators(lexer);
        bool division = c == -1;
        if (c < 0 && (!division || atom)) return false;
        if (c == ';' || c == ')' || c == ']' || c == '}' || c == ',' || lexer->eof(lexer)) break;
        if (atom) {
            if (!rank_read_atom(lexer, tokens)) return false;
            atom = false;
        } else if (!rank_read_operator(lexer, tokens, colons, &atom, division)) {
            return false;
        }
    }
    if (atom) return false;
    array_push(tokens, ((RankToken){RANK_END, false}));
    return true;
}

static bool rank_read_operator(TSLexer *lexer, RankTokens *tokens, unsigned *colons, bool *atom, bool division) {
    int32_t c = lexer->lookahead;
    if (division) {
        if (c == '=' || !rank_read_binary_rhs(lexer, atom)) return false;
        array_push(tokens, ((RankToken){RANK_BINARY, false}));
    } else if (c == '?') {
        if (!rank_read_question(lexer, tokens, atom)) return false;
    } else if (c == ':') {
        advance(lexer);
        if (lexer->lookahead == ':') return false;
        *atom = true;
    } else if (c > 0 && c < 128 && strchr("+-*/%<>=!&^|", c)) {
        bool postfix = false;
        if (!rank_read_binary(lexer, c, &postfix, atom)) return false;
        array_push(tokens, ((RankToken){postfix ? RANK_CONTINUATION : RANK_BINARY, false}));
    } else if (c == 'a' || c == 's') {
        bool colon = false;
        bool parsed = c == 'a' ? rank_read_as(lexer, &colon) : rank_read_switch(lexer);
        if (!parsed) return false;
        array_push(tokens, ((RankToken){c == 'a' ? RANK_AS : RANK_SWITCH, false}));
        *atom = colon;
    } else {
        if (!rank_read_postfix(lexer, c)) return false;
        array_push(tokens, ((RankToken){RANK_CONTINUATION, false}));
    }
    if (*atom) {
        array_push(tokens, ((RankToken){RANK_COLON, false}));
        (*colons)++;
    }
    return true;
}

static bool rank_read_atom(TSLexer *lexer, RankTokens *tokens) {
    bool collection = lexer->lookahead == '[';
    if (collection) {
        if (!rank_read_bracket(lexer, false)) return false;
    } else {
        QuestionIdentifier name;
        if (!rank_read_identifier(lexer, &name) || !rank_identifier_allowed(&name, false)) return false;
    }
    array_push(tokens, ((RankToken){RANK_ATOM, collection}));
    return true;
}

static bool rank_read_postfix(TSLexer *lexer, int32_t c) {
    if (c == '[') return rank_read_bracket(lexer, false);
    if (c == '(') {
        advance(lexer);
        if (question_skip_separators(lexer) != ')') return false;
        advance(lexer);
        return true;
    }
    if (c != '.') return false;
    advance(lexer);
    if (question_skip_separators(lexer) < 0) return false;
    QuestionIdentifier name;
    return rank_read_identifier(lexer, &name);
}

static bool rank_read_as(TSLexer *lexer, bool *colon) {
    QuestionIdentifier word;
    return rank_read_identifier(lexer, &word) && word.keyword && !strcmp(word.word, "as") && rank_read_as_type(lexer, colon);
}

static bool rank_read_as_type(TSLexer *lexer, bool *colon) {
    if (question_skip_separators(lexer) < 0) return false;
    if (lexer->lookahead == '(') {
        advance(lexer);
        if (!rank_read_as_arguments(lexer, ')')) return false;
    } else if (!rank_read_as_name(lexer, colon)) return false;
    if (*colon) return true;
    bool nullable = false;
    for (;;) {
        int32_t c = question_skip_separators(lexer);
        switch (c) {
            case '?':
                if (nullable) return false;
                nullable = true;
                advance(lexer);
                c = question_skip_separators(lexer);
                if (c != '[' && !lexer->eof(lexer) && (c <= 0 || c >= 128 || !strchr(",>)]}:;", c))) return false;
                break;
            case '*':
                nullable = true;
                advance(lexer);
                break;
            case '[':
                if (!rank_read_as_rank(lexer)) return false;
                nullable = false;
                break;
            default:
                return c >= 0;
        }
    }
}

static bool rank_read_as_name(TSLexer *lexer, bool *colon) {
    for (;;) {
        if (!rank_read_as_name_part(lexer)) return false;
        int32_t c = question_skip_separators(lexer);
        if (c != '.' && c != ':') return c >= 0;
        advance(lexer);
        if (c == ':') {
            if (lexer->lookahead != ':') { *colon = true; return true; }
            advance(lexer);
        }
        if (question_skip_separators(lexer) < 0) return false;
    }
}

static bool rank_read_as_name_part(TSLexer *lexer) {
    QuestionIdentifier name;
    if (!rank_read_identifier(lexer, &name)) return false;
    bool function_pointer = name.keyword && !strcmp(name.word, "delegate");
    if (function_pointer) {
        if (question_skip_separators(lexer) != '*') return false;
        advance(lexer);
    } else if (!rank_identifier_allowed(&name, true)) return false;
    int32_t next = question_skip_separators(lexer);
    if (next != '<') return next >= 0 && !function_pointer;
    advance(lexer);
    return rank_read_as_arguments(lexer, '>');
}

static bool rank_read_as_arguments(TSLexer *lexer, int32_t close) {
    for (;;) {
        bool colon = false;
        if (!rank_read_as_type(lexer, &colon) || colon) return false;
        int32_t c = question_skip_separators(lexer);
        if (c != ',' && c != close) return false;
        advance(lexer);
        if (c == close) return true;
    }
}

static bool rank_read_as_rank(TSLexer *lexer) {
    advance(lexer);
    while (question_skip_separators(lexer) == ',') advance(lexer);
    if (lexer->lookahead != ']') return false;
    advance(lexer);
    return true;
}

static bool rank_read_switch(TSLexer *lexer) {
    QuestionIdentifier word;
    if (!rank_read_identifier(lexer, &word) || !word.keyword || strcmp(word.word, "switch")) return false;
    if (question_skip_separators(lexer) != '{') return false;
    advance(lexer);
    return rank_read_delimited(lexer, '{', RANK_BODY_EXPRESSION);
}

static bool rank_read_binary(TSLexer *lexer, int32_t c, bool *postfix, bool *colon) {
    if (!rank_skip_binary_operator(lexer, c, postfix, false)) return false;
    return *postfix || rank_read_binary_rhs(lexer, colon);
}

static bool rank_skip_binary_operator(TSLexer *lexer, int32_t c, bool *postfix, bool updates) {
    advance(lexer);
    if (c == '!' && lexer->lookahead != '=') {
        *postfix = true;
        return true;
    }
    if (c == '=' || c == '!') {
        if (lexer->lookahead != '=') return false;
        advance(lexer);
    } else if (c == '<' || c == '>') {
        unsigned count = 1;
        unsigned maximum = c == '<' ? 2 : 3;
        while (count < maximum && lexer->lookahead == c) {
            advance(lexer);
            count++;
        }
        if (count == 1 && lexer->lookahead == '=') advance(lexer);
    } else if ((c == '&' || c == '|') && lexer->lookahead == c) {
        advance(lexer);
    } else if ((c == '+' || c == '-') && lexer->lookahead == c) {
        if (!updates) return false;
        advance(lexer);
    }
    if (lexer->lookahead == '=') return false;
    return true;
}

static bool rank_read_binary_rhs(TSLexer *lexer, bool *colon) {
    bool content = false;
    bool possible_type_arguments = false;
    while (!lexer->eof(lexer)) {
        int32_t c = question_skip_separators(lexer);
        if (c == -2 || c == '$' || c == '#') return false;
        if (c == ',') return content && !possible_type_arguments && rank_read_terminal(lexer, colon);
        if (c == '<') possible_type_arguments = true;
        if (c == -1) {
            if (lexer->lookahead == '=') return false;
            content = true;
            continue;
        }
        if (c == ':') {
            advance(lexer);
            if (lexer->lookahead == ':') { advance(lexer); content = true; continue; }
            *colon = content;
            return content;
        }
        if (c == ';' || c == ')' || c == ']' || c == '}' || lexer->eof(lexer))
            return content && rank_read_terminal(lexer, colon);
        content = true;
        if (!rank_skip_rhs_token(lexer, c)) return false;
    }
    return content;
}

static bool rank_skip_rhs_token(TSLexer *lexer, int32_t c) {
    if (c == '"' || c == '\'') return question_skip_quoted(lexer, false);
    if (c == '@') {
        advance(lexer);
        return lexer->lookahead != '"' || question_skip_quoted(lexer, true);
    }
    if (c == '(' || c == '[' || c == '{') {
        advance(lexer);
        return rank_read_delimited(lexer, (char)c, RANK_BODY_EXPRESSION);
    }
    if (c == '?') return rank_skip_rhs_question(lexer);
    if (c > 0 && c < 128 && strchr("+-*/%<>=!&^|", c)) {
        bool postfix = false;
        return rank_skip_binary_operator(lexer, c, &postfix, true);
    }
    advance(lexer);
    return true;
}

static bool rank_skip_rhs_question(TSLexer *lexer) {
    advance(lexer);
    if (lexer->lookahead == '?') {
        advance(lexer);
        return lexer->lookahead != '=';
    }
    if (question_skip_separators(lexer) != '.') return false;
    advance(lexer);
    return lexer->lookahead != '.' && !(lexer->lookahead >= '0' && lexer->lookahead <= '9');
}

static bool rank_read_terminal(TSLexer *lexer, bool *colon) {
    int32_t next = question_skip_separators(lexer);
    if (next == ':') {
        advance(lexer);
        if (lexer->lookahead == ':') return false;
        *colon = true;
        return true;
    }
    return next == ';' || next == ')' || next == ']' || next == '}' || next == ',' || lexer->eof(lexer);
}

static bool rank_read_question(TSLexer *lexer, RankTokens *tokens, bool *colon) {
    advance(lexer);
    if (lexer->lookahead == '?') {
        advance(lexer);
        if (lexer->lookahead == '=' || !rank_read_binary_rhs(lexer, colon)) return false;
        array_push(tokens, ((RankToken){RANK_BINARY, false}));
        return true;
    }
    if (question_skip_separators(lexer) == '.') {
        if (!rank_read_postfix(lexer, '.')) return false;
        array_push(tokens, ((RankToken){RANK_CONTINUATION, false}));
    } else {
        if (!rank_read_bracket(lexer, false)) return false;
        array_push(tokens, ((RankToken){RANK_QUESTION, true}));
        array_push(tokens, ((RankToken){RANK_ATOM, true}));
    }
    return true;
}

static RankParse rank_evaluate(const RankTokens *tokens, unsigned target) {
    RankParse *memo = ts_calloc((size_t)tokens->size * 2, sizeof(RankParse));
    for (unsigned end = tokens->size; end > 0; end--) {
        unsigned start = end - 1;
        memo[start * 2 + 1] = rank_parse(tokens, memo, start, true, target);
        memo[start * 2] = rank_parse(tokens, memo, start, false, target);
    }
    RankParse result = memo[0];
    ts_free(memo);
    return result;
}

static RankParse rank_parse(const RankTokens *tokens, const RankParse *memo, unsigned start, bool force, unsigned target) {
    RankParse result = {.end = start, .valid = true};
    RankToken first = tokens->contents[start];
    unsigned pos = start;
    bool primary = first.kind == RANK_ATOM;
    if (primary) pos++;
    else if (first.kind == RANK_IS_TYPE) {
        unsigned question = pos + 1;
        RankParse after = memo[(question + 1) * 2 + force];
        if (tokens->contents[after.end].kind != RANK_COLON) {
            result.role = RANK_NULLABLE_LAST;
            pos = question + 2;
        } else pos = question;
    } else {
        result.valid = false;
        return result;
    }
    while (tokens->contents[pos].kind == RANK_QUESTION || tokens->contents[pos].kind == RANK_CONTINUATION || tokens->contents[pos].kind == RANK_AS || tokens->contents[pos].kind == RANK_SWITCH || tokens->contents[pos].kind == RANK_BINARY) {
        if (tokens->contents[pos].kind == RANK_AS || tokens->contents[pos].kind == RANK_SWITCH || tokens->contents[pos].kind == RANK_BINARY) {
            primary = false;
            pos++;
            continue;
        }
        if (tokens->contents[pos].kind == RANK_CONTINUATION) {
            if (!primary) { result.valid = false; break; }
            pos++;
            continue;
        }
        RankParse when_true = memo[(pos + 1) * 2 + force];
        if (primary && tokens->contents[pos].collection && (force || tokens->contents[when_true.end].kind != RANK_COLON)) {
            pos += 2;
            continue;
        }
        pos = rank_conditional(tokens, memo, pos, force, target, &result);
        primary = false;
    }
    result.end = pos;
    return result;
}

static unsigned rank_conditional(const RankTokens *tokens, const RankParse *memo, unsigned pos, bool force, unsigned target, RankParse *result) {
    RankParse when_true = memo[(pos + 1) * 2 + force];
    if (tokens->contents[when_true.end].kind != RANK_COLON && !force && when_true.collection_ternary) {
        RankParse retry = memo[(pos + 1) * 2 + 1];
        if (tokens->contents[retry.end].kind == RANK_COLON) when_true = retry;
    }
    if (pos == target) result->role = RANK_TERNARY;
    if (when_true.role) result->role = when_true.role;
    result->collection_ternary |= tokens->contents[pos + 1].kind == RANK_ATOM && tokens->contents[pos + 1].collection;
    result->collection_ternary |= when_true.collection_ternary;
    result->valid &= when_true.valid;
    if (tokens->contents[when_true.end].kind == RANK_COLON) {
        RankParse alternative = memo[(when_true.end + 1) * 2 + force];
        if (alternative.role) result->role = alternative.role;
        result->collection_ternary |= alternative.collection_ternary;
        result->valid &= alternative.valid;
        pos = alternative.end;
    } else {
        result->valid = false;
        pos = when_true.end;
    }
    return pos;
}

#endif
