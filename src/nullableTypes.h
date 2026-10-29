#ifndef TREE_SITTER_C_SHARP_NULLABLE_TYPES_H_
#define TREE_SITTER_C_SHARP_NULLABLE_TYPES_H_

#include "questionLiterals.h"

typedef struct { void *generic_context; unsigned (*generic_open)(TSLexer *, void *); void (*generic_close)(TSLexer *, void *, unsigned); unsigned generic_start; bool allow_omitted; bool allocation_prefix; bool expression_ranks; bool sized_rank; uint32_t expression_questions; uint32_t prefix_questions; uint32_t question_bits; uint32_t questions; int32_t initial_suffix; bool colon; bool comma; bool root_comma; RankGroups *groups; RankGroups *prefix; bool prefix_done; bool prefix_all; bool verbatim_literal; bool complex; bool question; bool coalesce; bool conditional; bool division; bool binary; bool has_word; bool pointer_suffix; QuestionIdentifier word; } RankTypeRead;

typedef enum { RANK_TYPE_START, RANK_TYPE_SUFFIX, RANK_TYPE_NAME, RANK_TYPE_TAIL, RANK_TYPE_ARGUMENT, RANK_TYPE_ARGUMENT_END } RankTypeStage;
typedef struct { RankTypeStage stage; int32_t close; bool flag; bool function_pointer; unsigned opening; } RankTypeFrame;
typedef Array(RankTypeFrame) RankTypeFrames;
static bool rank_read_type_frames(TSLexer *, RankTypeRead *, RankTypeFrame);
static bool rank_read_type_step(TSLexer *, RankTypeRead *, RankTypeFrames *, RankTypeFrame);
static bool rank_read_type_name_step(TSLexer *, RankTypeRead *, RankTypeFrames *, unsigned);
static bool rank_read_type_tail_step(TSLexer *, RankTypeRead *, RankTypeFrames *, bool, unsigned);
static bool rank_read_type_argument_end(TSLexer *, RankTypeRead *, RankTypeFrames *, int32_t, unsigned, bool);
static bool rank_prepare_name_suffix(TSLexer *, RankTypeRead *, const QuestionIdentifier *, bool *);

static bool rank_read_prefix(TSLexer *lexer, bool *simple, uint32_t *questions);
static bool rank_read_prefix_suffix(TSLexer *lexer, const QuestionIdentifier *name, bool *simple, uint32_t *questions);
static bool rank_read_identifier(TSLexer *lexer, QuestionIdentifier *identifier);
static bool rank_read_type_identifier(TSLexer *, QuestionIdentifier *, RankTypeRead *);
static bool rank_identifier_allowed(const QuestionIdentifier *word, bool type);
static int32_t rank_type_gap(TSLexer *lexer, RankTypeRead *read);
static bool rank_read_as_type(TSLexer *lexer, RankTypeRead *read);
static bool rank_read_type_suffix(TSLexer *lexer, RankTypeRead *read, bool tuple_element, bool function_pointer);
static bool rank_read_nullable_suffix(TSLexer *lexer, RankTypeRead *read, bool tuple_element);
static bool rank_read_nullable_boundary(TSLexer *lexer, RankTypeRead *read, bool tuple_element);
static bool rank_read_as_name(TSLexer *lexer, RankTypeRead *read);
static bool rank_read_as_name_tail(TSLexer *lexer, RankTypeRead *read, bool arguments_allowed);
static bool rank_read_as_name_suffix(TSLexer *lexer, RankTypeRead *read, const QuestionIdentifier *name);
static bool rank_read_calling_convention(TSLexer *lexer, RankTypeRead *read);
static bool rank_read_as_arguments(TSLexer *lexer, int32_t close, RankTypeRead *read);
static void rank_type_open(RankTypeRead *, char);
static void rank_type_close(RankTypeRead *, char);
static bool rank_read_type_rank(TSLexer *lexer, RankTypeRead *read);
static bool rank_read_as_rank(TSLexer *lexer);

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
    while ((next = question_skip_separators(lexer)) == '[') {
        *simple = false;
        if (!rank_read_type_rank(lexer, &read)) return false;
    }
    return next >= 0;
}

static bool rank_read_identifier(TSLexer *lexer, QuestionIdentifier *identifier) {
    return rank_read_type_identifier(lexer, identifier, NULL);
}

static bool rank_read_type_identifier(TSLexer *lexer, QuestionIdentifier *identifier, RankTypeRead *read) {
    if (read) read->verbatim_literal = false;
    bool verbatim = lexer->lookahead == '@';
    if (verbatim) advance(lexer);
    if (!is_id_start(lexer->lookahead) && lexer->lookahead != '\\') {
        if (read && verbatim && (lexer->lookahead == '"' || lexer->lookahead == '$')) read->verbatim_literal = true;
        return false;
    }
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

static int32_t rank_type_gap(TSLexer *lexer, RankTypeRead *read) {
    int32_t c = question_skip_separators(lexer);
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
        case RANK_TYPE_START: {
            if (question_skip_separators(lexer) < 0) return false;
            unsigned suffix = frames->size + 1;
            array_push(frames, ((RankTypeFrame){.stage = RANK_TYPE_SUFFIX, .flag = frame.flag}));
            if (lexer->lookahead == '(') {
                read->complex = true;
                rank_type_open(read, '(');
                advance(lexer);
                array_push(frames, ((RankTypeFrame){.stage = RANK_TYPE_ARGUMENT, .close = ')'}));
            } else {
                array_push(frames, ((RankTypeFrame){.stage = RANK_TYPE_TAIL, .opening = suffix}));
                array_push(frames, ((RankTypeFrame){.stage = RANK_TYPE_NAME, .opening = suffix}));
            }
            return true;
        }
        case RANK_TYPE_SUFFIX:
            return rank_read_type_suffix(lexer, read, frame.flag, frame.function_pointer);
        case RANK_TYPE_NAME:
            return rank_read_type_name_step(lexer, read, frames, frame.opening);
        case RANK_TYPE_TAIL:
            return rank_read_type_tail_step(lexer, read, frames, frame.flag, frame.opening);
        case RANK_TYPE_ARGUMENT:
            array_push(frames, ((RankTypeFrame){.stage = RANK_TYPE_ARGUMENT_END, .close = frame.close, .opening = frame.opening, .flag = frame.flag}));
            if (frame.close != '>' || !read->allow_omitted ||
                (question_skip_separators(lexer) != ',' && lexer->lookahead != '>'))
                array_push(frames, ((RankTypeFrame){.stage = RANK_TYPE_START, .flag = frame.close == ')'}));
            return true;
        case RANK_TYPE_ARGUMENT_END:
            return rank_read_type_argument_end(lexer, read, frames, frame.close, frame.opening, frame.flag);
    }
    return false;
}

static bool rank_read_type_name_step(TSLexer *lexer, RankTypeRead *read, RankTypeFrames *frames, unsigned suffix) {
    QuestionIdentifier name;
    bool arguments = false;
    if (!rank_read_type_identifier(lexer, &name, read) || !rank_prepare_name_suffix(lexer, read, &name, &arguments)) return false;
    if (read->allocation_prefix && name.keyword && !strcmp(name.word, "delegate")) {
        if (!suffix || suffix > frames->size || frames->contents[suffix - 1].stage != RANK_TYPE_SUFFIX) return false;
        frames->contents[suffix - 1].function_pointer = true;
    }
    if (arguments) array_push(frames, ((RankTypeFrame){.stage = RANK_TYPE_ARGUMENT, .close = '>', .opening = read->generic_start}));
    return true;
}

static bool rank_read_type_tail_step(TSLexer *lexer, RankTypeRead *read, RankTypeFrames *frames, bool arguments_allowed, unsigned suffix) {
    if (read->division) return true;
    int32_t c = rank_type_gap(lexer, read);
    if (c == '<' && arguments_allowed) {
        read->complex = true;
        if (read->allocation_prefix && read->groups) array_push(read->groups, 'g');
        unsigned opening = read->generic_open ? read->generic_open(lexer, read->generic_context) : 0;
        if (read->prefix && (!read->prefix_done || read->prefix_all)) array_push(read->prefix, 'g');
        advance(lexer);
        array_push(frames, ((RankTypeFrame){.stage = RANK_TYPE_TAIL, .opening = suffix}));
        array_push(frames, ((RankTypeFrame){.stage = RANK_TYPE_ARGUMENT, .close = '>', .opening = opening}));
        return true;
    }
    if (c != '.' && c != ':') return c >= -1;
    advance(lexer);
    if (c == ':') {
        if (lexer->lookahead != ':') {
            read->colon = true;
            if (read->prefix && (!read->prefix_done || read->prefix_all)) array_push(read->prefix, ':');
            return true;
        }
        advance(lexer);
    }
    if (question_skip_separators(lexer) < 0) return false;
    array_push(frames, ((RankTypeFrame){.stage = RANK_TYPE_TAIL, .opening = suffix}));
    array_push(frames, ((RankTypeFrame){.stage = RANK_TYPE_NAME, .opening = suffix}));
    return true;
}

static bool rank_read_type_argument_end(TSLexer *lexer, RankTypeRead *read, RankTypeFrames *frames, int32_t close, unsigned opening, bool comma_seen) {
    if (read->colon || read->coalesce || read->conditional || read->division || read->binary || read->has_word) return false;
    int32_t c = rank_type_gap(lexer, read);
    if (close == ')' && c != ',' && c != close) {
        QuestionIdentifier name;
        if (!rank_read_type_identifier(lexer, &name, read) || !rank_identifier_allowed(&name, true)) return false;
        c = rank_type_gap(lexer, read);
    }
    if (c != ',' && c != close) return false;
    if (read->allocation_prefix && close == ')' && c == ')' && !comma_seen) return false;
    bool root_tuple = close == ')' && read->groups && read->groups->size == 1;
    if (c == ',') {
        read->comma = true;
        read->root_comma |= root_tuple;
        if (close == ')' && read->prefix && (!read->prefix_done || read->prefix_all)) array_push(read->prefix, ',');
    } else if (close == ')') rank_type_close(read, ')');
    else if (close == '>' && read->prefix && (!read->prefix_done || read->prefix_all)) array_push(read->prefix, 'h');
    if (c == '>' && read->allocation_prefix && read->groups) array_pop(read->groups);
    advance(lexer);
    if (c != close) array_push(frames, ((RankTypeFrame){.stage = RANK_TYPE_ARGUMENT, .close = close, .opening = opening, .flag = true}));
    else if (close == '>' && read->generic_close) read->generic_close(lexer, read->generic_context, opening);
    return true;
}

static bool rank_read_type_suffix(TSLexer *lexer, RankTypeRead *read, bool tuple_element, bool function_pointer) {
    if (read->colon || read->division) return true;
    read->pointer_suffix = false;
    bool nullable = read->allocation_prefix && function_pointer;
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
                read->pointer_suffix = true;
                nullable = true;
                advance(lexer);
                break;
            case '[':
                read->complex = true;
                if (!rank_read_type_rank(lexer, read)) return false;
                read->pointer_suffix = false;
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
    read->prefix_done = true;
    if (rank_type_gap(lexer, read) < -1 || !rank_read_nullable_boundary(lexer, read, tuple_element)) return false;
    if (!read->conditional) {
        if (read->questions == UINT32_MAX) return false;
        if (read->allocation_prefix && read->questions <= UINT32_MAX - read->expression_questions &&
            read->questions + read->expression_questions < 31)
            read->question_bits |= 1U << (read->questions + read->expression_questions);
        read->questions++;
        read->question = true;
    }
    return true;
}

static bool rank_read_nullable_boundary(TSLexer *lexer, RankTypeRead *read, bool tuple_element) {
    int32_t c = lexer->lookahead;
    if (read->allocation_prefix && c == '*') return true;
    if (read->division || lexer->eof(lexer) || (c > 0 && c < 128 && strchr(",>)]}:;[?=<|%", c))) return true;
    if (is_id_start(c) || c == '@' || c == '\\') {
        if (tuple_element) return true;
        if (!rank_read_type_identifier(lexer, &read->word, read)) return false;
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
        if (question_skip_separators(lexer) != '*') return false;
        advance(lexer);
        if (!rank_read_calling_convention(lexer, read)) return false;
    } else if (!rank_identifier_allowed(name, true)) return false;
    int32_t next = rank_type_gap(lexer, read);
    if (next != '<') return next >= -1 && !function_pointer;
    read->complex = true;
    if (read->allocation_prefix && read->groups) array_push(read->groups, 'g');
    if (read->generic_open) read->generic_start = read->generic_open(lexer, read->generic_context);
    if (read->prefix && (!read->prefix_done || read->prefix_all)) array_push(read->prefix, 'g');
    advance(lexer);
    *arguments = true;
    return true;
}

static bool rank_read_calling_convention(TSLexer *lexer, RankTypeRead *read) {
    if (question_skip_separators(lexer) == '<') return true;
    QuestionIdentifier convention;
    if (!rank_read_type_identifier(lexer, &convention, read) || !convention.keyword) return false;
    bool unmanaged = !strcmp(convention.word, "unmanaged");
    if (!unmanaged && strcmp(convention.word, "managed")) return false;
    if (question_skip_separators(lexer) != '[') return lexer->lookahead == '<';
    if (!unmanaged) return false;
    rank_type_open(read, '[');
    do {
        advance(lexer);
        if (question_skip_separators(lexer) < 0 || !rank_read_type_identifier(lexer, &convention, read) ||
            !rank_identifier_allowed(&convention, true)) return false;
    } while (question_skip_separators(lexer) == ',');
    if (lexer->lookahead != ']') return false;
    rank_type_close(read, ']');
    advance(lexer);
    return question_skip_separators(lexer) == '<';
}

static bool rank_read_as_arguments(TSLexer *lexer, int32_t close, RankTypeRead *read) {
    return rank_read_type_frames(lexer, read, (RankTypeFrame){.stage = RANK_TYPE_ARGUMENT, .close = close, .opening = read->generic_start});
}

static void rank_type_open(RankTypeRead *read, char opening) {
    if (read->groups) array_push(read->groups, opening);
    if (read->prefix && (!read->prefix_done || read->prefix_all)) array_push(read->prefix, opening);
}

static void rank_type_close(RankTypeRead *read, char closing) {
    if (read->groups) array_pop(read->groups);
    if (read->prefix && (!read->prefix_done || read->prefix_all)) array_push(read->prefix, closing);
}

static bool rank_read_type_rank(TSLexer *lexer, RankTypeRead *read) {
    rank_type_open(read, '[');
    if (!rank_read_as_rank(lexer)) {
        if (!read->expression_ranks && (!read->allocation_prefix || !read->groups || read->groups->size == 1)) {
            read->sized_rank = read->allocation_prefix;
            return false;
        }
        RankLiteralFrames frames = array_new();
        rank_push_code(&frames, '[', RANK_BODY_TYPE_DIMENSION, 0);
        uint32_t questions = 0;
        if (!rank_read_frames(lexer, &frames, NULL, 0, NULL, &questions) ||
            UINT32_MAX - read->expression_questions < questions) return false;
        if (questions && !read->expression_questions) read->prefix_questions = read->questions;
        read->expression_questions += questions;
        read->sized_rank |= read->expression_ranks;
    }
    rank_type_close(read, ']');
    return true;
}

static bool rank_read_as_rank(TSLexer *lexer) {
    advance(lexer);
    while (question_skip_separators(lexer) == ',') advance(lexer);
    if (lexer->lookahead != ']') return false;
    advance(lexer);
    return true;
}

#endif
