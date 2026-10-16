#ifndef TREE_SITTER_C_SHARP_NULLABLE_TYPES_H_
#define TREE_SITTER_C_SHARP_NULLABLE_TYPES_H_

typedef struct { bool colon; bool comma; bool complex; bool question; bool coalesce; bool conditional; bool division; bool binary; bool has_word; QuestionIdentifier word; } RankTypeRead;

static bool rank_read_prefix(TSLexer *lexer, bool *simple);
static bool rank_read_identifier(TSLexer *lexer, QuestionIdentifier *identifier);
static bool rank_identifier_allowed(const QuestionIdentifier *word, bool type);
static int32_t rank_type_gap(TSLexer *lexer, RankTypeRead *read);
static bool rank_read_as_type(TSLexer *lexer, RankTypeRead *read);
static bool rank_read_type(TSLexer *lexer, RankTypeRead *read, bool tuple_element);
static bool rank_read_nullable_suffix(TSLexer *lexer, RankTypeRead *read, bool tuple_element);
static bool rank_read_nullable_boundary(TSLexer *lexer, RankTypeRead *read, bool tuple_element);
static bool rank_read_as_name(TSLexer *lexer, RankTypeRead *read);
static bool rank_read_as_name_tail(TSLexer *lexer, RankTypeRead *read, bool arguments_allowed);
static bool rank_read_as_name_part(TSLexer *lexer, RankTypeRead *read);
static bool rank_read_as_arguments(TSLexer *lexer, int32_t close, RankTypeRead *read);
static bool rank_read_as_rank(TSLexer *lexer);

static bool rank_read_prefix(TSLexer *lexer, bool *simple) {
    bool operand = true;
    unsigned words = 0;
    *simple = true;
    while (!lexer->eof(lexer)) {
        if (question_skip_separators(lexer) < 0) return false;
        if (!operand && lexer->lookahead == '?') return true;
        QuestionIdentifier word;
        if (!rank_read_identifier(lexer, &word)) return false;
        if (++words != 1 || lexer->lookahead != '?') *simple = false;
        bool logical = word.keyword && (!strcmp(word.word, "and") || !strcmp(word.word, "or"));
        if (!operand) {
            if (!logical) return false;
            operand = true;
            continue;
        }
        if (logical) return false;
        if (word.keyword && !strcmp(word.word, "not")) continue;
        RankTypeRead read = {0};
        if (!rank_identifier_allowed(&word, true) || !rank_read_as_name_tail(lexer, &read, true) ||
            read.question || read.colon || read.coalesce || read.conditional || read.division) return false;
        operand = false;
    }
    return false;
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

static int32_t rank_type_gap(TSLexer *lexer, RankTypeRead *read) {
    int32_t c = question_skip_separators(lexer);
    read->division |= c == -1;
    return c;
}

static bool rank_read_as_type(TSLexer *lexer, RankTypeRead *read) {
    return rank_read_type(lexer, read, false);
}

static bool rank_read_type(TSLexer *lexer, RankTypeRead *read, bool tuple_element) {
    if (question_skip_separators(lexer) < 0) return false;
    if (lexer->lookahead == '(') {
        read->complex = true;
        advance(lexer);
        if (!rank_read_as_arguments(lexer, ')', read)) return false;
    } else if (!rank_read_as_name(lexer, read)) return false;
    if (read->colon || read->division) return true;
    bool nullable = false;
    for (;;) {
        int32_t c = rank_type_gap(lexer, read);
        switch (c) {
            case '?':
                read->complex = true;
                if (nullable) return true;
                if (!rank_read_nullable_suffix(lexer, read, tuple_element)) return false;
                if (read->coalesce || read->conditional || read->binary || read->has_word || read->division) return true;
                nullable = true;
                break;
            case '*':
                read->complex = true;
                nullable = true;
                advance(lexer);
                break;
            case '[':
                read->complex = true;
                if (!rank_read_as_rank(lexer)) return false;
                nullable = false;
                break;
            default:
                return c >= -1;
        }
    }
}

static bool rank_read_nullable_suffix(TSLexer *lexer, RankTypeRead *read, bool tuple_element) {
    advance(lexer);
    if (lexer->lookahead == '?') {
        advance(lexer);
        read->coalesce = true;
        return lexer->lookahead != '=';
    }
    if (rank_type_gap(lexer, read) < -1 || !rank_read_nullable_boundary(lexer, read, tuple_element)) return false;
    if (!read->conditional) read->question = true;
    return true;
}

static bool rank_read_nullable_boundary(TSLexer *lexer, RankTypeRead *read, bool tuple_element) {
    int32_t c = lexer->lookahead;
    if (read->division || lexer->eof(lexer) || (c > 0 && c < 128 && strchr(",>)]}:;[?=<|%", c))) return true;
    if (is_id_start(c) || c == '@' || c == '\\') {
        if (tuple_element) return true;
        if (!rank_read_identifier(lexer, &read->word)) return false;
        read->has_word = true;
        read->conditional = !read->word.keyword || (strcmp(read->word.word, "is") && strcmp(read->word.word, "as"));
        return true;
    }
    if (c == '!' || c == '&') {
        advance(lexer);
        if (lexer->lookahead == (c == '!' ? '=' : '&')) {
            advance(lexer);
            read->binary = true;
            return true;
        }
    }
    read->conditional = true;
    return true;
}

static bool rank_read_as_name(TSLexer *lexer, RankTypeRead *read) {
    return rank_read_as_name_part(lexer, read) && rank_read_as_name_tail(lexer, read, false);
}

static bool rank_read_as_name_tail(TSLexer *lexer, RankTypeRead *read, bool arguments_allowed) {
    for (;;) {
        if (read->division) return true;
        int32_t c = rank_type_gap(lexer, read);
        if (c == '<' && arguments_allowed) {
            read->complex = true;
            advance(lexer);
            if (!rank_read_as_arguments(lexer, '>', read)) return false;
            arguments_allowed = false;
            continue;
        }
        if (c != '.' && c != ':') return c >= -1;
        advance(lexer);
        if (c == ':') {
            if (lexer->lookahead != ':') { read->colon = true; return true; }
            advance(lexer);
        }
        if (question_skip_separators(lexer) < 0 || !rank_read_as_name_part(lexer, read)) return false;
        arguments_allowed = false;
    }
}

static bool rank_read_as_name_part(TSLexer *lexer, RankTypeRead *read) {
    QuestionIdentifier name;
    if (!rank_read_identifier(lexer, &name)) return false;
    bool function_pointer = name.keyword && !strcmp(name.word, "delegate");
    if (function_pointer) {
        if (question_skip_separators(lexer) != '*') return false;
        advance(lexer);
    } else if (!rank_identifier_allowed(&name, true)) return false;
    int32_t next = rank_type_gap(lexer, read);
    if (next != '<') return next >= -1 && !function_pointer;
    read->complex = true;
    advance(lexer);
    return rank_read_as_arguments(lexer, '>', read);
}

static bool rank_read_as_arguments(TSLexer *lexer, int32_t close, RankTypeRead *read) {
    for (;;) {
        if (!rank_read_type(lexer, read, close == ')') || read->colon || read->coalesce || read->conditional || read->division || read->binary || read->has_word) return false;
        int32_t c = rank_type_gap(lexer, read);
        if (close == ')' && c != ',' && c != close) {
            QuestionIdentifier name;
            if (!rank_read_identifier(lexer, &name) || !rank_identifier_allowed(&name, true)) return false;
            c = rank_type_gap(lexer, read);
        }
        if (c != ',' && c != close) return false;
        if (c == ',') read->comma = true;
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

#endif
