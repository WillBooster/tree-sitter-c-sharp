#ifndef TREE_SITTER_C_SHARP_GENERIC_EXPRESSIONS_H_
#define TREE_SITTER_C_SHARP_GENERIC_EXPRESSIONS_H_

typedef struct { int32_t value; TSLexerPosition position; uint8_t generic; } QuestionCharacter;
typedef struct { unsigned cursor; bool capturing; } QuestionCheckpoint;
typedef struct {
    TSLexer lexer;
    TSLexer *source;
    Array(QuestionCharacter) characters;
    unsigned cursor;
    bool capturing;
    uint32_t failed_until;
} QuestionInput;

static void question_input_advance(TSLexer *lexer, bool skip) {
    QuestionInput *input = (QuestionInput *)lexer;
    if (input->cursor < input->characters.size) input->cursor++;
    else {
        if (input->capturing) {
            QuestionCharacter c = {.value = input->source->lookahead};
            input->source->get_position(input->source, &c.position);
            array_push(&input->characters, c);
            input->cursor++;
        }
        input->source->advance(input->source, skip);
    }
    lexer->lookahead = input->cursor < input->characters.size
        ? input->characters.contents[input->cursor].value : input->source->lookahead;
    if (!input->capturing && input->cursor == input->characters.size) {
        array_clear(&input->characters);
        input->cursor = 0;
    }
}

static bool question_input_eof(const TSLexer *lexer) {
    const QuestionInput *input = (const QuestionInput *)lexer;
    return input->cursor == input->characters.size && input->source->eof(input->source);
}

static void question_input_position(const TSLexer *lexer, TSLexerPosition *position) {
    const QuestionInput *input = (const QuestionInput *)lexer;
    if (input->cursor < input->characters.size) *position = input->characters.contents[input->cursor].position;
    else input->source->get_position(input->source, position);
}

static uint32_t question_input_column(TSLexer *lexer) {
    TSLexerPosition position;
    question_input_position(lexer, &position);
    return position.column;
}

static QuestionInput question_input_create(TSLexer *source) {
    return (QuestionInput){.lexer = {.lookahead = source->lookahead, .advance = question_input_advance,
        .eof = question_input_eof, .get_position = question_input_position, .get_column = question_input_column},
        .source = source, .characters = array_new()};
}

static QuestionCheckpoint question_input_checkpoint(QuestionInput *input) {
    QuestionCheckpoint checkpoint = {.cursor = input->cursor, .capturing = input->capturing};
    input->capturing = true;
    return checkpoint;
}

static void question_input_restore(QuestionInput *input, QuestionCheckpoint checkpoint) {
    input->cursor = checkpoint.cursor;
    input->lexer.lookahead = input->cursor < input->characters.size
        ? input->characters.contents[input->cursor].value : input->source->lookahead;
    input->capturing = checkpoint.capturing;
}

typedef enum { GENERIC_NOT_FOLLOWING, GENERIC_TOKEN, GENERIC_IDENTIFIER, GENERIC_QUERY = 4, GENERIC_TUPLE_COMMA = 8 } GenericFollowing;
static bool expression_generic_following(TSLexer *lexer);
static bool expression_generic_following_read(TSLexer *, GenericFollowing *);
static bool expression_generic_word_following(TSLexer *, GenericFollowing *);

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
    return expression_generic_following_read(lexer, NULL);
}

static bool expression_generic_following_read(TSLexer *lexer, GenericFollowing *kind) {
    if (kind) *kind = GENERIC_TOKEN;
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
    return expression_generic_word_following(lexer, kind);
}

static bool expression_generic_word_following(TSLexer *lexer, GenericFollowing *kind) {
    QuestionIdentifier word;
    if (!rank_read_identifier(lexer, &word)) return false;
    if (word.keyword && (!strcmp(word.word, "is") || !strcmp(word.word, "as"))) return true;
    if (word.keyword && (!strcmp(word.word, "with") || !rank_identifier_allowed(&word, false))) return false;
    static const char *const query[] = {"from", "join", "on", "equals", "by", "into", "where", "select", "group", "orderby", "let", "ascending", "descending"};
    if (kind) {
        unsigned flags = GENERIC_IDENTIFIER;
        if (word.keyword && question_word_in(word.word, query, sizeof(query) / sizeof(query[0]))) flags |= GENERIC_QUERY;
        if (question_skip_separators(lexer) == ',') flags |= GENERIC_TUPLE_COMMA;
        *kind = (GenericFollowing)flags;
    }
    return true;
}

#endif
