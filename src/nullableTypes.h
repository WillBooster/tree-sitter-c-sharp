#ifndef TREE_SITTER_C_SHARP_NULLABLE_TYPES_H_
#define TREE_SITTER_C_SHARP_NULLABLE_TYPES_H_

typedef struct { uint32_t questions; int32_t initial_suffix; bool generic_call; bool colon; bool comma; bool complex; bool question; bool coalesce; bool conditional; bool division; bool binary; bool has_word; QuestionIdentifier word; } RankTypeRead;

typedef enum { RANK_TYPE_START, RANK_TYPE_SUFFIX, RANK_TYPE_NAME, RANK_TYPE_TAIL, RANK_TYPE_ARGUMENT, RANK_TYPE_ARGUMENT_END } RankTypeStage;
typedef struct { RankTypeStage stage; int32_t close; bool flag; } RankTypeFrame;
typedef Array(RankTypeFrame) RankTypeFrames;
static bool rank_read_type_frames(TSLexer *, RankTypeRead *, RankTypeFrame);
static bool rank_read_type_step(TSLexer *, RankTypeRead *, RankTypeFrames *, RankTypeFrame);
static bool rank_read_type_name_step(TSLexer *, RankTypeRead *, RankTypeFrames *);
static bool rank_read_type_tail_step(TSLexer *, RankTypeRead *, RankTypeFrames *, bool);
static bool rank_read_type_argument_end(TSLexer *, RankTypeRead *, RankTypeFrames *, int32_t, bool);
static bool rank_prepare_name_suffix(TSLexer *, RankTypeRead *, const QuestionIdentifier *, bool *);
static bool rank_type_name_allowed(const RankTypeRead *, const QuestionIdentifier *);
static bool rank_read_generic_type_prefix(TSLexer *, RankTypeRead *, QuestionIdentifier *, bool *);
static bool rank_identifier_start(int32_t);

static bool rank_read_prefix(TSLexer *lexer, bool *simple, uint32_t *questions);
static bool rank_read_prefix_suffix(TSLexer *lexer, const QuestionIdentifier *name, bool *simple, uint32_t *questions);
static bool rank_read_identifier(TSLexer *lexer, QuestionIdentifier *identifier);
static bool rank_identifier_allowed(const QuestionIdentifier *word, bool type);
static int32_t rank_type_separators(TSLexer *lexer, const RankTypeRead *read);
static bool rank_skip_type_directive(TSLexer *lexer);
static int32_t rank_type_gap(TSLexer *lexer, RankTypeRead *read);
static bool rank_read_as_type(TSLexer *lexer, RankTypeRead *read);
static bool rank_read_type_suffix(TSLexer *lexer, RankTypeRead *read, bool tuple_element);
static bool rank_read_nullable_suffix(TSLexer *lexer, RankTypeRead *read, bool tuple_element);
static bool rank_read_nullable_boundary(TSLexer *lexer, RankTypeRead *read, bool tuple_element);
static bool rank_read_as_name(TSLexer *lexer, RankTypeRead *read);
static bool rank_read_as_name_tail(TSLexer *lexer, RankTypeRead *read, bool arguments_allowed);
static bool rank_read_as_name_suffix(TSLexer *lexer, RankTypeRead *read, const QuestionIdentifier *name);
static bool rank_read_calling_convention(TSLexer *lexer, const RankTypeRead *read);
static bool rank_read_as_arguments(TSLexer *lexer, int32_t close, RankTypeRead *read);
static bool rank_read_as_rank(TSLexer *lexer, const RankTypeRead *read);

static bool rank_read_prefix(TSLexer *lexer, bool *simple, uint32_t *questions) {
    bool operand = true;
    unsigned words = 0;
    *simple = true;
    while (!lexer->eof(lexer)) {
        if (question_skip_separators(lexer) < 0) return false;
        if (!operand && lexer->lookahead == '?') return true;
        QuestionIdentifier word;
        if (!rank_read_identifier(lexer, &word)) return false;
        if (++words != 1) *simple = false;
        bool logical = word.keyword && (!strcmp(word.word, "and") || !strcmp(word.word, "or"));
        if (!operand) {
            if (!logical) return false;
            operand = true;
            continue;
        }
        if (logical) return false;
        if (word.keyword && !strcmp(word.word, "not")) continue;
        if (!rank_read_prefix_suffix(lexer, &word, simple, questions)) return false;
        operand = false;
    }
    return false;
}

static bool rank_read_prefix_suffix(TSLexer *lexer, const QuestionIdentifier *name, bool *simple, uint32_t *questions) {
    RankTypeRead read = {0};
    if (!rank_read_as_name_suffix(lexer, &read, name)) return false;
    if (read.initial_suffix != '?') *simple = false;
    if (!rank_read_as_name_tail(lexer, &read, false) || read.colon ||
        read.coalesce || read.conditional || read.division) return false;
    if (UINT32_MAX - *questions < read.questions) return false;
    *questions += read.questions;
    int32_t next;
    while ((next = rank_type_separators(lexer, &read)) == '[') {
        *simple = false;
        if (!rank_read_as_rank(lexer, &read)) return false;
    }
    return next >= 0;
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
    if (question_word_in(word->word, forbidden, sizeof(forbidden) / sizeof(forbidden[0]))) return false;
    bool literal = !strcmp(word->word, "true") || !strcmp(word->word, "false") || !strcmp(word->word, "null") ||
        !strcmp(word->word, "this") || !strcmp(word->word, "base");
    return !type || !literal;
}

static int32_t rank_type_separators(TSLexer *lexer, const RankTypeRead *read) {
    int32_t c;
    while ((c = question_skip_separators(lexer)) == '#' && read->generic_call) {
        if (!rank_skip_type_directive(lexer)) return -2;
    }
    return c;
}

static bool rank_skip_type_directive(TSLexer *lexer) {
    advance(lexer);
    while (is_space_but_line_feed(lexer->lookahead)) advance(lexer);
    if (lexer->lookahead != ':') {
        QuestionIdentifier name;
        if (!question_identifier(lexer, false, &name) || !name.keyword) return false;
        static const char *const extras[] = {
            "region", "endregion", "line", "pragma", "nullable", "error", "warning", "define", "undef"
        };
        if (!question_word_in(name.word, extras, sizeof(extras) / sizeof(extras[0]))) return false;
    }
    while (!lexer->eof(lexer) && !is_line_terminator(lexer->lookahead)) advance(lexer);
    return true;
}

static int32_t rank_type_gap(TSLexer *lexer, RankTypeRead *read) {
    int32_t c = rank_type_separators(lexer, read);
    if (!read->initial_suffix) read->initial_suffix = c;
    read->division |= c == -1;
    return c;
}

static bool rank_read_as_type(TSLexer *lexer, RankTypeRead *read) {
    return rank_read_type_frames(lexer, read, (RankTypeFrame){.stage = RANK_TYPE_START});
}

static bool rank_read_type_frames(TSLexer *lexer, RankTypeRead *read, RankTypeFrame initial) {
    RankTypeFrames frames = array_new();
    array_push(&frames, initial);
    bool valid = true;
    while (frames.size) {
        RankTypeFrame frame = array_pop(&frames);
        if (!rank_read_type_step(lexer, read, &frames, frame)) { valid = false; break; }
    }
    array_delete(&frames);
    return valid;
}

static bool rank_read_type_step(TSLexer *lexer, RankTypeRead *read, RankTypeFrames *frames, RankTypeFrame frame) {
    switch (frame.stage) {
        case RANK_TYPE_START:
            if (rank_type_separators(lexer, read) < 0) return false;
            array_push(frames, ((RankTypeFrame){.stage = RANK_TYPE_SUFFIX, .flag = frame.flag}));
            if (lexer->lookahead == '(') {
                read->complex = true;
                advance(lexer);
                array_push(frames, ((RankTypeFrame){.stage = RANK_TYPE_ARGUMENT, .close = ')', .flag = read->generic_call}));
            } else {
                array_push(frames, ((RankTypeFrame){.stage = RANK_TYPE_TAIL}));
                array_push(frames, ((RankTypeFrame){.stage = RANK_TYPE_NAME}));
            }
            return true;
        case RANK_TYPE_SUFFIX:
            return rank_read_type_suffix(lexer, read, frame.flag);
        case RANK_TYPE_NAME:
            return rank_read_type_name_step(lexer, read, frames);
        case RANK_TYPE_TAIL:
            return rank_read_type_tail_step(lexer, read, frames, frame.flag);
        case RANK_TYPE_ARGUMENT:
            array_push(frames, ((RankTypeFrame){.stage = RANK_TYPE_ARGUMENT_END, .close = frame.close, .flag = frame.flag}));
            array_push(frames, ((RankTypeFrame){.stage = RANK_TYPE_START, .flag = frame.close == ')'}));
            return true;
        case RANK_TYPE_ARGUMENT_END:
            return rank_read_type_argument_end(lexer, read, frames, frame.close, frame.flag);
    }
    return false;
}

static bool rank_read_type_name_step(TSLexer *lexer, RankTypeRead *read, RankTypeFrames *frames) {
    QuestionIdentifier name;
    bool arguments = false;
    if (!rank_read_identifier(lexer, &name)) return false;
    bool nested_type = false;
    if (read->generic_call && !rank_read_generic_type_prefix(lexer, read, &name, &nested_type)) return false;
    if (nested_type) {
        array_push(frames, ((RankTypeFrame){.stage = RANK_TYPE_START}));
        return true;
    }
    if (!rank_prepare_name_suffix(lexer, read, &name, &arguments)) return false;
    if (arguments) array_push(frames, ((RankTypeFrame){.stage = RANK_TYPE_ARGUMENT, .close = '>'}));
    return true;
}

static bool rank_read_generic_type_prefix(TSLexer *lexer, RankTypeRead *read, QuestionIdentifier *name, bool *nested_type) {
    if (!name->keyword) return true;
    if (!strcmp(name->word, "scoped")) {
        int32_t c = rank_type_separators(lexer, read);
        if (!rank_identifier_start(c)) return c >= 0;
        if (!rank_read_identifier(lexer, name) || !name->keyword || strcmp(name->word, "ref")) return false;
    }
    bool reference = !strcmp(name->word, "ref");
    if (!reference && strcmp(name->word, "in") && strcmp(name->word, "out")) return true;
    int32_t c = rank_type_separators(lexer, read);
    if (c < 0) return false;
    if (!rank_identifier_start(c)) {
        *nested_type = true;
        return true;
    }
    if (!rank_read_identifier(lexer, name)) return false;
    *nested_type = reference && name->keyword && !strcmp(name->word, "readonly");
    return !*nested_type || rank_type_separators(lexer, read) >= 0;
}

static bool rank_identifier_start(int32_t c) {
    return is_id_start(c) || c == '@' || c == '\\';
}

static bool rank_read_type_tail_step(TSLexer *lexer, RankTypeRead *read, RankTypeFrames *frames, bool arguments_allowed) {
    if (read->division) return true;
    int32_t c = rank_type_gap(lexer, read);
    if (c == '<' && arguments_allowed) {
        read->complex = true;
        advance(lexer);
        array_push(frames, ((RankTypeFrame){.stage = RANK_TYPE_TAIL}));
        array_push(frames, ((RankTypeFrame){.stage = RANK_TYPE_ARGUMENT, .close = '>'}));
        return true;
    }
    if (c != '.' && c != ':') return c >= -1;
    advance(lexer);
    if (c == ':') {
        if (lexer->lookahead != ':') { read->colon = true; return true; }
        advance(lexer);
    }
    if (rank_type_separators(lexer, read) < 0) return false;
    array_push(frames, ((RankTypeFrame){.stage = RANK_TYPE_TAIL}));
    array_push(frames, ((RankTypeFrame){.stage = RANK_TYPE_NAME}));
    return true;
}

static bool rank_read_type_argument_end(TSLexer *lexer, RankTypeRead *read, RankTypeFrames *frames, int32_t close, bool require_comma) {
    if (read->colon || read->coalesce || read->conditional || read->division || read->binary || read->has_word) return false;
    int32_t c = rank_type_gap(lexer, read);
    if (close == ')' && c != ',' && c != close) {
        QuestionIdentifier name;
        if (!rank_read_identifier(lexer, &name) || !rank_type_name_allowed(read, &name)) return false;
        c = rank_type_gap(lexer, read);
    }
    if ((require_comma && c != ',') || (c != ',' && c != close)) return false;
    if (c == ',') read->comma = true;
    advance(lexer);
    if (c != close) array_push(frames, ((RankTypeFrame){.stage = RANK_TYPE_ARGUMENT, .close = close}));
    return true;
}

static bool rank_read_type_suffix(TSLexer *lexer, RankTypeRead *read, bool tuple_element) {
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
                if (!rank_read_as_rank(lexer, read)) return false;
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
    if (!read->conditional) {
        if (read->questions == UINT32_MAX) return false;
        read->questions++;
        read->question = true;
    }
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
    return rank_read_type_frames(lexer, read, (RankTypeFrame){.stage = RANK_TYPE_NAME}) &&
        rank_read_as_name_tail(lexer, read, false);
}

static bool rank_read_as_name_tail(TSLexer *lexer, RankTypeRead *read, bool arguments_allowed) {
    return rank_read_type_frames(lexer, read, (RankTypeFrame){.stage = RANK_TYPE_TAIL, .flag = arguments_allowed});
}

static bool rank_read_as_name_suffix(TSLexer *lexer, RankTypeRead *read, const QuestionIdentifier *name) {
    bool arguments = false;
    if (!rank_prepare_name_suffix(lexer, read, name, &arguments)) return false;
    return !arguments || rank_read_as_arguments(lexer, '>', read);
}

static bool rank_prepare_name_suffix(TSLexer *lexer, RankTypeRead *read, const QuestionIdentifier *name, bool *arguments) {
    bool function_pointer = name->keyword && !strcmp(name->word, "delegate");
    if (function_pointer) {
        if (rank_type_separators(lexer, read) != '*') return false;
        advance(lexer);
        if (!rank_read_calling_convention(lexer, read)) return false;
    } else if (!rank_type_name_allowed(read, name)) return false;
    int32_t next = rank_type_gap(lexer, read);
    if (next != '<') return next >= -1 && !function_pointer;
    read->complex = true;
    advance(lexer);
    *arguments = true;
    return true;
}

static bool rank_type_name_allowed(const RankTypeRead *read, const QuestionIdentifier *name) {
    return rank_identifier_allowed(name, true) || (read->generic_call && name->keyword && !strcmp(name->word, "var"));
}

static bool rank_read_calling_convention(TSLexer *lexer, const RankTypeRead *read) {
    if (rank_type_separators(lexer, read) == '<') return true;
    QuestionIdentifier convention;
    if (!rank_read_identifier(lexer, &convention) || !convention.keyword) return false;
    bool unmanaged = !strcmp(convention.word, "unmanaged");
    if (!unmanaged && strcmp(convention.word, "managed")) return false;
    if (rank_type_separators(lexer, read) != '[') return lexer->lookahead == '<';
    if (!unmanaged) return false;
    do {
        advance(lexer);
        if (rank_type_separators(lexer, read) < 0 || !rank_read_identifier(lexer, &convention) ||
            !rank_identifier_allowed(&convention, true)) return false;
    } while (rank_type_separators(lexer, read) == ',');
    if (lexer->lookahead != ']') return false;
    advance(lexer);
    return rank_type_separators(lexer, read) == '<';
}

static bool rank_read_as_arguments(TSLexer *lexer, int32_t close, RankTypeRead *read) {
    return rank_read_type_frames(lexer, read, (RankTypeFrame){.stage = RANK_TYPE_ARGUMENT, .close = close});
}

static bool rank_read_as_rank(TSLexer *lexer, const RankTypeRead *read) {
    advance(lexer);
    while (rank_type_separators(lexer, read) == ',') advance(lexer);
    if (lexer->lookahead != ']') return false;
    advance(lexer);
    return true;
}

#endif
