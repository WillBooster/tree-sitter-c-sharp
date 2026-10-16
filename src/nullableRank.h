#ifndef TREE_SITTER_C_SHARP_NULLABLE_RANK_H_
#define TREE_SITTER_C_SHARP_NULLABLE_RANK_H_

#include "nullableTypes.h"

typedef enum {
    RANK_NONE,
    RANK_NULLABLE_LAST,
    RANK_NULLABLE_NEXT,
    RANK_TERNARY,
    RANK_AFTER_NULLABLE,
} NullableRankRole;

typedef enum { RANK_ATOM, RANK_NONPRIMARY_ATOM, RANK_LAMBDA, RANK_IS_TYPE, RANK_DEFINITE_TYPE, RANK_QUESTION, RANK_COLON, RANK_CONTINUATION, RANK_AS, RANK_SWITCH, RANK_BINARY, RANK_BINARY_PRIMARY, RANK_END } RankTokenKind;
typedef struct { RankTokenKind kind; bool collection; bool force_unsafe; } RankToken;
typedef Array(RankToken) RankTokens;
typedef Array(char) RankGroups;
typedef enum { RANK_HEADER_START, RANK_HEADER_MODIFIER, RANK_HEADER_NAME, RANK_HEADER_PARAMETERS, RANK_HEADER_DELEGATE, RANK_HEADER_DELEGATE_PARAMETERS, RANK_HEADER_INVALID } RankLambdaHeader;
typedef struct { unsigned token; RankLambdaHeader header; bool content; bool primary; bool type_pending; bool type_complete; bool pattern; bool member; bool colon; bool conditional; bool nullable_type; bool division; unsigned nullable_event; } RankExpression;
typedef enum { RANK_READ_UNKNOWN, RANK_READ_MORE, RANK_READ_DONE, RANK_READ_TOKEN } RankReadStep;
typedef enum { RANK_BODY_BRACKET, RANK_BODY_EXPRESSION } RankBodyMode;
typedef struct { unsigned end; uint8_t role; bool collection_ternary; bool valid; } RankParse;

static bool question_type_boundary(int32_t c);
static uint8_t rank_stream_role(TSLexer *lexer, uint32_t pending);
static bool rank_read_omitted_ranks(TSLexer *lexer, RankTokens *tail, bool *definite, bool opened);
static bool rank_read_bracket(TSLexer *lexer);
static bool rank_read_delimited(TSLexer *lexer, char opening, RankBodyMode mode, bool *force_unsafe);
static bool rank_skip_delimited_token(TSLexer *lexer, RankGroups *groups, int32_t c, bool expression, bool *access, bool *force_unsafe);
static bool rank_read_stream(TSLexer *lexer, RankTokens *tokens, unsigned *colons);
static bool rank_read_atom(TSLexer *lexer, RankTokens *tokens, bool *colon);
static bool rank_read_operator(TSLexer *lexer, RankTokens *tokens, unsigned *colons, bool *atom, bool division);
static bool rank_read_postfix(TSLexer *lexer, int32_t c);
static bool rank_read_as(TSLexer *lexer, bool *colon);
static bool rank_read_switch(TSLexer *lexer, bool *force_unsafe);
static bool rank_read_binary(TSLexer *lexer, int32_t c, RankTokens *tokens, bool *colon);
static bool rank_binary_start(int32_t c);
static bool rank_skip_binary_operator(TSLexer *lexer, int32_t c, bool *postfix, bool updates, bool *high);
static RankReadStep rank_start_binary_rhs(TSLexer *lexer, int32_t c, RankTokens *tokens, RankExpression *expression);
static void rank_mark_nonprimary(RankTokens *tokens, unsigned expression);
static bool rank_read_expression(TSLexer *lexer, RankTokens *tokens, bool *colon, RankTokenKind kind);
static bool rank_read_is(TSLexer *lexer, RankTokens *tokens, bool *colon);
static bool rank_read_expression_tail(TSLexer *lexer, RankTokens *tokens, bool *colon, RankExpression *expression);
static RankReadStep rank_read_expression_name(TSLexer *lexer, RankTokens *tokens, bool *colon, RankExpression *expression);
static bool rank_read_expression_word(TSLexer *lexer, RankTokens *tokens, RankExpression *expression);
static bool rank_read_creation(TSLexer *lexer, bool *force_unsafe);
static RankReadStep rank_read_pattern_word(TSLexer *lexer, const QuestionIdentifier *name, RankExpression *expression);
static void rank_start_lambda(RankTokens *tokens, unsigned *expression);
static bool rank_read_lambda_arrow(TSLexer *lexer, RankTokens *tokens, unsigned *expression, RankLambdaHeader *header, bool *content, bool *primary);
static RankLambdaHeader rank_expression_group(RankTokens *tokens, unsigned *expression, RankLambdaHeader header, int32_t c, bool *primary);
static RankReadStep rank_read_expression_token(TSLexer *lexer, RankTokens *tokens, bool *colon, int32_t c, RankExpression *expression);
static RankReadStep rank_read_expression_type_question(TSLexer *lexer, RankTokens *tokens, RankExpression *expression);
static RankReadStep rank_read_expression_rank(TSLexer *lexer, RankTokens *tokens, RankExpression *expression);
static RankReadStep rank_read_expression_end(TSLexer *lexer, int32_t c, bool content, bool *colon);
static RankReadStep rank_read_expression_question(TSLexer *lexer, RankTokens *tokens, RankExpression *expression, bool *colon);
static bool rank_skip_rhs_token(TSLexer *lexer, int32_t c, RankExpression *expression, bool *force_unsafe, bool prefix);
static RankReadStep rank_skip_literal(TSLexer *lexer, int32_t c, bool *force_unsafe);
static bool rank_skip_interpolated(TSLexer *lexer, bool verbatim, bool *force_unsafe);
static bool rank_skip_interpolated_body(TSLexer *lexer, bool verbatim, bool *force_unsafe);
static bool rank_skip_raw_interpolated(TSLexer *lexer, unsigned quotes, unsigned dollars, bool *force_unsafe);
static bool rank_skip_raw_hole(TSLexer *lexer, unsigned braces, unsigned dollars, bool *force_unsafe);
static unsigned rank_read_character_run(TSLexer *lexer, int32_t character);
static bool rank_read_rhs_generic(TSLexer *lexer, bool *colon, bool *generic, bool *high);
static bool rank_read_terminal(TSLexer *lexer, bool *colon);
static bool rank_read_question(TSLexer *lexer, RankTokens *tokens, bool *colon);
static RankParse rank_evaluate(const RankTokens *tokens, unsigned target);
static RankParse rank_parse(const RankTokens *tokens, const RankParse *memo, unsigned start, bool force, unsigned target);
static unsigned rank_parse_type(const RankTokens *tokens, const RankParse *memo, unsigned pos, bool force, unsigned target, RankParse *result);
static unsigned rank_conditional(const RankTokens *tokens, const RankParse *memo, unsigned pos, bool force, unsigned target, RankParse *result);

static uint8_t rank_stream_role(TSLexer *lexer, uint32_t pending) {
    if (!rank_read_prefix(lexer)) return RANK_NONE;
    advance(lexer);
    RankTokens tail = array_new();
    bool definite = false;
    unsigned colons = 0;
    if (!rank_read_omitted_ranks(lexer, &tail, &definite, false) || !rank_read_stream(lexer, &tail, &colons) || pending > colons) {
        array_delete(&tail);
        return RANK_NONE;
    }
    RankTokens tokens = array_new();
    for (uint32_t i = 0; i < pending; i++) {
        array_push(&tokens, ((RankToken){RANK_ATOM, false}));
        array_push(&tokens, ((RankToken){RANK_QUESTION, false}));
    }
    array_push(&tokens, ((RankToken){definite ? RANK_DEFINITE_TYPE : RANK_IS_TYPE, false}));
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

static bool rank_read_omitted_ranks(TSLexer *lexer, RankTokens *tail, bool *definite, bool opened) {
    unsigned count = 0;
    while (opened || question_skip_separators(lexer) == '[') {
        if (!opened) advance(lexer);
        opened = false;
        int32_t first = question_skip_separators(lexer);
        if (first != ',' && first != ']') {
            if (count != 1 || *definite || !rank_read_delimited(lexer, '[', RANK_BODY_BRACKET, NULL)) return false;
            array_push(tail, ((RankToken){RANK_CONTINUATION, false}));
            return true;
        }
        bool comma = first == ',';
        while (lexer->lookahead == ',') {
            advance(lexer);
            if (question_skip_separators(lexer) < 0) return false;
        }
        if (lexer->lookahead != ']') return false;
        advance(lexer);
        count++;
        *definite |= comma || count > 1;
    }
    return count > 0;
}

static bool rank_read_bracket(TSLexer *lexer) {
    if (question_skip_separators(lexer) != '[') return false;
    advance(lexer);
    if (question_skip_separators(lexer) < 0) return false;
    return rank_read_delimited(lexer, '[', RANK_BODY_BRACKET, NULL);
}

static bool rank_read_delimited(TSLexer *lexer, char opening, RankBodyMode mode, bool *force_unsafe) {
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
            char expected = c == ')' ? '(' : c == ']' ? '[' : '{';
            if (*array_back(&groups) != expected) break;
            array_pop(&groups);
            advance(lexer);
            if (!groups.size) { valid = content || mode == RANK_BODY_EXPRESSION; break; }
            continue;
        }
        content = true;
        if (c == ':') colon = true;
        if (!rank_skip_delimited_token(lexer, &groups, c, mode == RANK_BODY_EXPRESSION, &access, force_unsafe)) break;
    }
    array_delete(&groups);
    if (force_unsafe) *force_unsafe |= access && colon;
    return valid;
}

static bool rank_skip_delimited_token(TSLexer *lexer, RankGroups *groups, int32_t c, bool expression, bool *access, bool *force_unsafe) {
    RankReadStep literal = rank_skip_literal(lexer, c, force_unsafe);
    if (literal != RANK_READ_TOKEN) return literal == RANK_READ_MORE;
    if (c == '@') return true;
    if (c == '?') {
        advance(lexer);
        bool binding = question_skip_separators(lexer) == '[';
        *access |= binding;
        return expression || !binding;
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
            atom = false;
            if (!rank_read_atom(lexer, tokens, &atom)) return false;
            if (atom) {
                array_push(tokens, ((RankToken){RANK_COLON, false}));
                (*colons)++;
            }
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
        if (c == '=' || !rank_read_expression(lexer, tokens, atom, RANK_BINARY)) return false;
    } else if (c == '?') {
        if (!rank_read_question(lexer, tokens, atom)) return false;
    } else if (c == ':') {
        advance(lexer);
        if (lexer->lookahead == ':') return false;
        *atom = true;
    } else if (rank_binary_start(c)) {
        if (!rank_read_binary(lexer, c, tokens, atom)) return false;
    } else if (c == 'i') {
        if (!rank_read_is(lexer, tokens, atom)) return false;
    } else if (c == 'a' || c == 's') {
        bool colon = false;
        bool force_unsafe = false;
        bool parsed = c == 'a' ? rank_read_as(lexer, &colon) : rank_read_switch(lexer, &force_unsafe);
        if (!parsed) return false;
        array_push(tokens, ((RankToken){c == 'a' ? RANK_AS : RANK_SWITCH, false, force_unsafe}));
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

static bool rank_read_atom(TSLexer *lexer, RankTokens *tokens, bool *colon) {
    if (lexer->lookahead != '[') return rank_read_expression(lexer, tokens, colon, RANK_ATOM);
    advance(lexer);
    bool force_unsafe = false;
    if (!rank_read_delimited(lexer, '[', RANK_BODY_EXPRESSION, &force_unsafe)) return false;
    array_push(tokens, ((RankToken){RANK_ATOM, true, force_unsafe}));
    return true;
}

static bool rank_read_postfix(TSLexer *lexer, int32_t c) {
    if (c == '[') return rank_read_bracket(lexer);
    if (c == '(') {
        advance(lexer);
        return rank_read_delimited(lexer, '(', RANK_BODY_EXPRESSION, NULL);
    }
    if (c != '.') return false;
    advance(lexer);
    if (question_skip_separators(lexer) < 0) return false;
    QuestionIdentifier name;
    return rank_read_identifier(lexer, &name);
}

static bool rank_read_as(TSLexer *lexer, bool *colon) {
    QuestionIdentifier word;
    if (!rank_read_identifier(lexer, &word) || !word.keyword || strcmp(word.word, "as")) return false;
    RankTypeRead read = {0};
    bool valid = rank_read_as_type(lexer, &read);
    *colon = read.colon;
    return valid && !read.coalesce && !read.conditional && !read.division;
}

static bool rank_read_switch(TSLexer *lexer, bool *force_unsafe) {
    QuestionIdentifier word;
    if (!rank_read_identifier(lexer, &word) || !word.keyword || strcmp(word.word, "switch")) return false;
    if (question_skip_separators(lexer) != '{') return false;
    advance(lexer);
    return rank_read_delimited(lexer, '{', RANK_BODY_EXPRESSION, force_unsafe);
}

static bool rank_read_binary(TSLexer *lexer, int32_t c, RankTokens *tokens, bool *colon) {
    bool postfix = false;
    bool high = false;
    if (!rank_skip_binary_operator(lexer, c, &postfix, false, &high)) return false;
    if (!postfix) return rank_read_expression(lexer, tokens, colon, RANK_BINARY);
    array_push(tokens, ((RankToken){RANK_CONTINUATION, false}));
    return true;
}

static bool rank_binary_start(int32_t c) {
    return c > 0 && c < 128 && strchr("+-*/%<>=!&^|", c);
}

static bool rank_skip_binary_operator(TSLexer *lexer, int32_t c, bool *postfix, bool updates, bool *high) {
    *high = c == '!' || c == '+' || c == '-' || c == '*' || c == '/' || c == '%';
    advance(lexer);
    if (c == '!' && lexer->lookahead != '=') {
        *postfix = true;
        return true;
    }
    if (c == '=' || c == '!') {
        *high = false;
        if (lexer->lookahead != '=') return false;
        advance(lexer);
    } else if (c == '<' || c == '>') {
        unsigned count = 1;
        unsigned maximum = c == '<' ? 2 : 3;
        while (count < maximum && lexer->lookahead == c) {
            advance(lexer);
            count++;
        }
        *high = count > 1;
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

static RankReadStep rank_start_binary_rhs(TSLexer *lexer, int32_t c, RankTokens *tokens, RankExpression *expression) {
    bool postfix = false, high = false;
    if (c != -1 && (!rank_skip_binary_operator(lexer, c, &postfix, false, &high) || postfix)) return RANK_READ_UNKNOWN;
    rank_mark_nonprimary(tokens, expression->token);
    *expression = (RankExpression){.token = tokens->size, .header = RANK_HEADER_INVALID, .primary = true, .nullable_event = ((unsigned)-1)};
    array_push(tokens, ((RankToken){RANK_BINARY, false}));
    return RANK_READ_MORE;
}

static void rank_mark_nonprimary(RankTokens *tokens, unsigned expression) {
    if (tokens->contents[expression].kind == RANK_ATOM) tokens->contents[expression].kind = RANK_NONPRIMARY_ATOM;
}

static bool rank_read_expression(TSLexer *lexer, RankTokens *tokens, bool *colon, RankTokenKind kind) {
    RankExpression expression = {.token = tokens->size, .header = kind == RANK_ATOM ? RANK_HEADER_START : RANK_HEADER_INVALID, .primary = true, .nullable_event = ((unsigned)-1)};
    array_push(tokens, ((RankToken){kind, false}));
    return rank_read_expression_tail(lexer, tokens, colon, &expression);
}

static bool rank_read_is(TSLexer *lexer, RankTokens *tokens, bool *colon) {
    QuestionIdentifier word;
    if (!rank_read_identifier(lexer, &word) || !word.keyword || strcmp(word.word, "is")) return false;
    RankExpression expression = {.token = tokens->size, .header = RANK_HEADER_INVALID, .pattern = true, .type_pending = true, .nullable_event = ((unsigned)-1)};
    array_push(tokens, ((RankToken){RANK_BINARY, false}));
    return rank_read_expression_tail(lexer, tokens, colon, &expression);
}

static bool rank_read_expression_tail(TSLexer *lexer, RankTokens *tokens, bool *colon, RankExpression *expression) {
    while (!lexer->eof(lexer)) {
        int32_t c = question_skip_separators(lexer);
        if (c == -2 || c == '#') return false;
        RankReadStep step = rank_read_expression_end(lexer, c, expression->content, colon);
        if (step == RANK_READ_TOKEN) step = rank_read_expression_token(lexer, tokens, colon, c, expression);
        if (step != RANK_READ_MORE) return step == RANK_READ_DONE;
    }
    return expression->content;
}

static RankReadStep rank_read_expression_token(TSLexer *lexer, RankTokens *tokens, bool *colon, int32_t c, RankExpression *expression) {
    if (is_id_start(c) || c == '\\') return rank_read_expression_name(lexer, tokens, colon, expression);
    if (c == '[' && expression->type_complete) return rank_read_expression_rank(lexer, tokens, expression);
    if (expression->type_complete && !expression->pattern && rank_binary_start(c)) {
        return rank_start_binary_rhs(lexer, c, tokens, expression);
    }
    bool prefix = expression->type_pending;
    if (c != '?') { expression->type_pending = false; expression->type_complete = false; }
    if (c >= '0' && c <= '9') expression->primary = true;
    switch (c) {
        case '=':
            expression->pattern = false;
            return rank_read_lambda_arrow(lexer, tokens, &expression->token, &expression->header, &expression->content, &expression->primary) ? RANK_READ_MORE : RANK_READ_UNKNOWN;
        case '<': {
            expression->header = RANK_HEADER_INVALID;
            bool generic = false;
            bool high = false;
            if (!rank_read_rhs_generic(lexer, colon, &generic, &high)) return RANK_READ_UNKNOWN;
            expression->primary &= generic;
            if (!prefix && !high) expression->pattern = false;
            return *colon ? (expression->content ? RANK_READ_DONE : RANK_READ_UNKNOWN) : RANK_READ_MORE;
        }
        case -1:
            expression->header = RANK_HEADER_INVALID;
            expression->content = true;
            return lexer->lookahead != '=' ? RANK_READ_MORE : RANK_READ_UNKNOWN;
        case '?':
            return expression->content ? rank_read_expression_question(lexer, tokens, expression, colon) : RANK_READ_UNKNOWN;
        default:
            expression->header = rank_expression_group(tokens, &expression->token, expression->header, c, &expression->primary);
            expression->content = true;
            return rank_skip_rhs_token(lexer, c, expression, &tokens->contents[expression->token].force_unsafe, prefix) ? RANK_READ_MORE : RANK_READ_UNKNOWN;
    }
}

static RankReadStep rank_read_expression_name(TSLexer *lexer, RankTokens *tokens, bool *colon, RankExpression *expression) {
    expression->content = true;
    if (!rank_read_expression_word(lexer, tokens, expression)) return RANK_READ_UNKNOWN;
    if (expression->colon) { *colon = true; return RANK_READ_DONE; }
    if (expression->division) return rank_start_binary_rhs(lexer, -1, tokens, expression);
    if (expression->conditional) {
        rank_mark_nonprimary(tokens, expression->token);
        array_push(tokens, ((RankToken){RANK_QUESTION, false}));
        return rank_read_atom(lexer, tokens, colon) ? RANK_READ_DONE : RANK_READ_UNKNOWN;
    }
    return RANK_READ_MORE;
}

static bool rank_read_expression_word(TSLexer *lexer, RankTokens *tokens, RankExpression *expression) {
    QuestionIdentifier name;
    if (!rank_read_identifier(lexer, &name)) return false;
    if (expression->member) {
        expression->member = false;
        expression->header = RANK_HEADER_INVALID;
        return true;
    }
    if (name.keyword && (!strcmp(name.word, "new") || !strcmp(name.word, "stackalloc"))) {
        if (!rank_read_creation(lexer, &tokens->contents[expression->token].force_unsafe)) return false;
        expression->primary = true;
        expression->header = RANK_HEADER_INVALID;
        return true;
    }
    if (name.keyword && !strcmp(name.word, "await")) {
        expression->primary = true;
        expression->header = RANK_HEADER_INVALID;
        return true;
    }
    if (name.keyword && !strcmp(name.word, "as")) {
        RankTypeRead read = {0};
        if (!rank_read_as_type(lexer, &read)) return false;
        expression->pattern = false;
        expression->primary = read.coalesce;
        expression->type_complete = !read.coalesce;
        expression->nullable_type = true;
        expression->colon = read.colon;
        expression->conditional = read.conditional;
        expression->division = read.division;
        expression->header = RANK_HEADER_INVALID;
        return true;
    }
    RankReadStep pattern = rank_read_pattern_word(lexer, &name, expression);
    if (pattern != RANK_READ_TOKEN) return pattern == RANK_READ_MORE;
    if (expression->type_complete && expression->nullable_event != ((unsigned)-1) && rank_identifier_allowed(&name, true)) {
        tokens->contents[expression->nullable_event].kind = RANK_DEFINITE_TYPE;
        expression->nullable_event = ((unsigned)-1);
    }
    expression->type_complete = false;
    if (!rank_identifier_allowed(&name, false) || (name.keyword && !strcmp(name.word, "with"))) expression->primary = false;
    if (expression->header != RANK_HEADER_START && expression->header != RANK_HEADER_MODIFIER) expression->header = RANK_HEADER_INVALID;
    else if (name.keyword && (!strcmp(name.word, "static") || !strcmp(name.word, "async"))) expression->header = RANK_HEADER_MODIFIER;
    else if (name.keyword && !strcmp(name.word, "delegate")) expression->header = RANK_HEADER_DELEGATE;
    else expression->header = rank_identifier_allowed(&name, true) ? RANK_HEADER_NAME : RANK_HEADER_INVALID;
    return true;
}

static bool rank_read_creation(TSLexer *lexer, bool *force_unsafe) {
    int32_t c = question_skip_separators(lexer);
    if (c != '(' && c != '[' && c != '{') {
        RankTypeRead read = {0};
        if (!rank_read_as_name(lexer, &read) || read.colon || read.division) return false;
        c = question_skip_separators(lexer);
        while (c == '?' || c == '*') {
            advance(lexer);
            c = question_skip_separators(lexer);
        }
    }
    if (c != '(' && c != '[' && c != '{') return false;
    advance(lexer);
    return rank_read_delimited(lexer, (char)c, RANK_BODY_EXPRESSION, force_unsafe);
}

static RankReadStep rank_read_pattern_word(TSLexer *lexer, const QuestionIdentifier *name, RankExpression *expression) {
    bool logical = name->keyword && (!strcmp(name->word, "and") || !strcmp(name->word, "or"));
    if ((name->keyword && !strcmp(name->word, "is")) || (expression->pattern && logical)) {
        expression->pattern = true;
        expression->type_pending = true;
        expression->type_complete = false;
        expression->primary = false;
        expression->header = RANK_HEADER_INVALID;
        return RANK_READ_MORE;
    }
    if (expression->type_pending) {
        if (name->keyword && !strcmp(name->word, "not")) return RANK_READ_MORE;
        expression->type_pending = false;
        expression->type_complete = false;
        if (!rank_identifier_allowed(name, true)) {
            expression->primary = rank_identifier_allowed(name, false);
            return RANK_READ_MORE;
        }
        expression->primary = false;
        RankTypeRead read = {0};
        expression->type_complete = rank_read_as_name_tail(lexer, &read);
        expression->colon = read.colon;
        return expression->type_complete ? RANK_READ_MORE : RANK_READ_UNKNOWN;
    }
    return RANK_READ_TOKEN;
}

static void rank_start_lambda(RankTokens *tokens, unsigned *expression) {
    tokens->contents[*expression] = (RankToken){RANK_LAMBDA, false};
    *expression = tokens->size;
    array_push(tokens, ((RankToken){RANK_ATOM, false}));
}

static bool rank_read_lambda_arrow(TSLexer *lexer, RankTokens *tokens, unsigned *expression, RankLambdaHeader *header, bool *content, bool *primary) {
    advance(lexer);
    if (lexer->lookahead == '=') {
        advance(lexer);
        *header = RANK_HEADER_INVALID;
        return true;
    }
    if (lexer->lookahead != '>' || (*header != RANK_HEADER_NAME && *header != RANK_HEADER_PARAMETERS)) return false;
    advance(lexer);
    rank_start_lambda(tokens, expression);
    *content = false;
    *primary = true;
    *header = RANK_HEADER_START;
    return true;
}

static RankLambdaHeader rank_expression_group(RankTokens *tokens, unsigned *expression, RankLambdaHeader header, int32_t c, bool *primary) {
    if (c == '{' && (header == RANK_HEADER_DELEGATE || header == RANK_HEADER_DELEGATE_PARAMETERS)) {
        rank_start_lambda(tokens, expression);
        *primary = true;
        return RANK_HEADER_INVALID;
    }
    if (c != '(') return RANK_HEADER_INVALID;
    if (header == RANK_HEADER_START || header == RANK_HEADER_MODIFIER) return RANK_HEADER_PARAMETERS;
    return header == RANK_HEADER_DELEGATE ? RANK_HEADER_DELEGATE_PARAMETERS : RANK_HEADER_INVALID;
}

static RankReadStep rank_read_expression_end(TSLexer *lexer, int32_t c, bool content, bool *colon) {
    if (c == ':') {
        advance(lexer);
        if (lexer->lookahead == ':') { advance(lexer); return RANK_READ_MORE; }
        *colon = content;
        return content ? RANK_READ_DONE : RANK_READ_UNKNOWN;
    }
    if (c != ',' && c != ';' && c != ')' && c != ']' && c != '}' && !lexer->eof(lexer)) return RANK_READ_TOKEN;
    return content && rank_read_terminal(lexer, colon) ? RANK_READ_DONE : RANK_READ_UNKNOWN;
}

static RankReadStep rank_read_expression_question(TSLexer *lexer, RankTokens *tokens, RankExpression *expression, bool *colon) {
    unsigned binary = expression->token;
    bool primary = expression->primary;
    advance(lexer);
    if (lexer->lookahead == '?') {
        expression->pattern = false;
        advance(lexer);
        return lexer->lookahead != '=' ? RANK_READ_MORE : RANK_READ_UNKNOWN;
    }
    if (question_skip_separators(lexer) == '.')
        return rank_read_postfix(lexer, '.') ? RANK_READ_MORE : RANK_READ_UNKNOWN;
    bool collection = lexer->lookahead == '[';
    if (expression->type_complete && !expression->nullable_type && !collection &&
        (lexer->lookahead == '?' || question_type_boundary(lexer->lookahead) || lexer->eof(lexer))) {
        expression->nullable_type = true;
        return RANK_READ_MORE;
    }
    if (!primary && collection && !expression->type_complete) return RANK_READ_UNKNOWN;
    if (!primary) rank_mark_nonprimary(tokens, binary);
    if (primary && tokens->contents[binary].kind == RANK_BINARY) tokens->contents[binary].kind = RANK_BINARY_PRIMARY;
    if (!collection) {
        array_push(tokens, ((RankToken){RANK_QUESTION, false}));
        return rank_read_atom(lexer, tokens, colon) ? RANK_READ_DONE : RANK_READ_UNKNOWN;
    }
    if (expression->type_complete && !expression->nullable_type)
        return rank_read_expression_type_question(lexer, tokens, expression);

    advance(lexer);
    if (question_skip_separators(lexer) < 0 || !rank_read_delimited(lexer, '[', RANK_BODY_EXPRESSION, NULL)) return RANK_READ_UNKNOWN;
    array_push(tokens, ((RankToken){RANK_QUESTION, true}));
    array_push(tokens, ((RankToken){RANK_ATOM, true}));
    return RANK_READ_DONE;
}

static RankReadStep rank_read_expression_type_question(TSLexer *lexer, RankTokens *tokens, RankExpression *expression) {
    advance(lexer);
    int32_t first = question_skip_separators(lexer);
    if (first != ',' && first != ']') {
        bool force_unsafe = false;
        if (first < 0 || !rank_read_delimited(lexer, '[', RANK_BODY_EXPRESSION, &force_unsafe)) return RANK_READ_UNKNOWN;
        array_push(tokens, ((RankToken){RANK_QUESTION, true}));
        array_push(tokens, ((RankToken){RANK_ATOM, true, force_unsafe}));
        return RANK_READ_DONE;
    }
    RankTokens ranks = array_new();
    bool definite = false;
    if (!rank_read_omitted_ranks(lexer, &ranks, &definite, true)) { array_delete(&ranks); return RANK_READ_UNKNOWN; }
    expression->nullable_event = tokens->size;
    array_push(tokens, ((RankToken){definite ? RANK_DEFINITE_TYPE : RANK_IS_TYPE, false}));
    array_push(tokens, ((RankToken){RANK_QUESTION, true}));
    array_push(tokens, ((RankToken){RANK_ATOM, true}));
    for (unsigned i = 0; i < ranks.size; i++) array_push(tokens, ranks.contents[i]);
    expression->type_complete = ranks.size == 0;
    array_delete(&ranks);
    expression->nullable_type = false;
    return RANK_READ_MORE;
}

static RankReadStep rank_read_expression_rank(TSLexer *lexer, RankTokens *tokens, RankExpression *expression) {
    advance(lexer);
    int32_t first = question_skip_separators(lexer);
    if (first < 0) return RANK_READ_UNKNOWN;
    bool omitted = first == ',' || first == ']';
    bool force_unsafe = false;
    if (!rank_read_delimited(lexer, '[', RANK_BODY_EXPRESSION, &force_unsafe)) return RANK_READ_UNKNOWN;
    tokens->contents[expression->token].force_unsafe |= force_unsafe;
    expression->type_complete = omitted;
    expression->nullable_type = false;
    if (expression->nullable_event != ((unsigned)-1)) {
        if (omitted) tokens->contents[expression->nullable_event].kind = RANK_DEFINITE_TYPE;
        else array_push(tokens, ((RankToken){RANK_CONTINUATION, false}));
    }
    return RANK_READ_MORE;
}

static bool rank_skip_rhs_token(TSLexer *lexer, int32_t c, RankExpression *expression, bool *force_unsafe, bool prefix) {
    RankReadStep literal = rank_skip_literal(lexer, c, force_unsafe);
    if (literal != RANK_READ_TOKEN) {
        if (literal == RANK_READ_MORE) expression->primary = true;
        return literal == RANK_READ_MORE;
    }
    if (c == '@') {
        QuestionIdentifier name;
        return question_identifier(lexer, true, &name);
    }
    if (c == '(' || c == '[' || c == '{') {
        advance(lexer);
        return rank_read_delimited(lexer, (char)c, RANK_BODY_EXPRESSION, force_unsafe);
    }
    if (rank_binary_start(c)) {
        bool postfix = false;
        bool high = false;
        bool valid = rank_skip_binary_operator(lexer, c, &postfix, true, &high);
        if (!prefix && !high) expression->pattern = false;
        return valid;
    }
    advance(lexer);
    expression->member = c == '.' && lexer->lookahead != '.';
    return true;
}

static bool rank_read_rhs_generic(TSLexer *lexer, bool *colon, bool *generic, bool *high) {
    *high = false;
    advance(lexer);
    if (lexer->lookahead == '=' || lexer->lookahead == '<') {
        *high = lexer->lookahead == '<';
        advance(lexer);
        return lexer->lookahead != '=';
    }
    RankTypeRead read = {0};
    bool valid = rank_read_as_arguments(lexer, '>', &read);
    *colon = read.colon;
    if (!valid) return !read.comma && !read.complex;
    int32_t next = question_skip_separators(lexer);
    *generic = next == '(' || next == '.';
    *high = *generic;
    return next >= 0 && (!read.comma || *generic);
}

static RankReadStep rank_skip_literal(TSLexer *lexer, int32_t c, bool *force_unsafe) {
    if (c == '"' || c == '\'')
        return question_skip_quoted(lexer, false) ? RANK_READ_MORE : RANK_READ_UNKNOWN;
    if (c == '$') return rank_skip_interpolated(lexer, false, force_unsafe) ? RANK_READ_MORE : RANK_READ_UNKNOWN;
    if (c != '@') return RANK_READ_TOKEN;
    advance(lexer);
    if (lexer->lookahead == '$')
        return rank_skip_interpolated(lexer, true, force_unsafe) ? RANK_READ_MORE : RANK_READ_UNKNOWN;
    if (lexer->lookahead == '"')
        return question_skip_quoted(lexer, true) ? RANK_READ_MORE : RANK_READ_UNKNOWN;
    return RANK_READ_TOKEN;
}

static bool rank_skip_interpolated(TSLexer *lexer, bool verbatim, bool *force_unsafe) {
    unsigned dollars = rank_read_character_run(lexer, '$');
    if (!verbatim && lexer->lookahead == '@') { verbatim = true; advance(lexer); }
    if (lexer->lookahead != '"') return false;
    if (verbatim) {
        if (dollars != 1) return false;
        advance(lexer);
        return rank_skip_interpolated_body(lexer, true, force_unsafe);
    }
    unsigned quotes = rank_read_character_run(lexer, '"');
    if (quotes >= 3) return rank_skip_raw_interpolated(lexer, quotes, dollars, force_unsafe);
    if (dollars != 1) return false;
    return quotes == 2 || rank_skip_interpolated_body(lexer, false, force_unsafe);
}

static bool rank_skip_raw_interpolated(TSLexer *lexer, unsigned quotes, unsigned dollars, bool *force_unsafe) {
    while (!lexer->eof(lexer)) {
        int32_t c = lexer->lookahead;
        if (c == '"') {
            unsigned count = rank_read_character_run(lexer, c);
            if (count >= quotes) return count == quotes;
        } else if (c == '{') {
            unsigned count = rank_read_character_run(lexer, c);
            if (!rank_skip_raw_hole(lexer, count, dollars, force_unsafe)) return false;
        } else if (c == '}') {
            if (rank_read_character_run(lexer, c) >= dollars) return false;
        } else {
            advance(lexer);
        }
    }
    return false;
}

static bool rank_skip_raw_hole(TSLexer *lexer, unsigned braces, unsigned dollars, bool *force_unsafe) {
    if (braces < dollars) return true;
    if (braces - dollars >= dollars) return false;
    if (!rank_read_delimited(lexer, '{', RANK_BODY_EXPRESSION, force_unsafe)) return false;
    for (unsigned i = 1; i < dollars; i++) {
        if (lexer->lookahead != '}') return false;
        advance(lexer);
    }
    return true;
}

static unsigned rank_read_character_run(TSLexer *lexer, int32_t character) {
    unsigned count = 0;
    while (lexer->lookahead == character && !lexer->eof(lexer)) {
        count++;
        advance(lexer);
    }
    return count;
}

static bool rank_skip_interpolated_body(TSLexer *lexer, bool verbatim, bool *force_unsafe) {
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
            else if (!rank_read_delimited(lexer, '{', RANK_BODY_EXPRESSION, force_unsafe)) return false;
        } else if (c == '}') {
            if (lexer->lookahead != '}') return false;
            advance(lexer);
        } else if (!verbatim && is_line_terminator(c)) return false;
    }
    return false;
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
        if (lexer->lookahead == '=' || !rank_read_expression(lexer, tokens, colon, RANK_BINARY)) return false;
        return true;
    }
    if (question_skip_separators(lexer) == '.') {
        if (!rank_read_postfix(lexer, '.')) return false;
        array_push(tokens, ((RankToken){RANK_CONTINUATION, false}));
    } else {
        if (lexer->lookahead != '[') return false;
        advance(lexer);
        bool empty = question_skip_separators(lexer) == ']';
        bool force_unsafe = false;
        if (!rank_read_delimited(lexer, '[', RANK_BODY_EXPRESSION, &force_unsafe)) return false;
        array_push(tokens, ((RankToken){RANK_QUESTION, !empty}));
        array_push(tokens, ((RankToken){RANK_ATOM, true, force_unsafe}));
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
    if (first.kind == RANK_LAMBDA) return memo[(start + 1) * 2];
    if (primary || first.kind == RANK_NONPRIMARY_ATOM) {
        result.valid = !force || !first.force_unsafe;
        result.collection_ternary = first.force_unsafe;
        pos++;
    }
    else if (first.kind == RANK_DEFINITE_TYPE || first.kind == RANK_IS_TYPE) {
        pos = rank_parse_type(tokens, memo, pos, force, target, &result);
    } else {
        result.valid = false;
        return result;
    }
    while (result.valid && (tokens->contents[pos].kind == RANK_DEFINITE_TYPE || tokens->contents[pos].kind == RANK_IS_TYPE || tokens->contents[pos].kind == RANK_QUESTION || tokens->contents[pos].kind == RANK_CONTINUATION || tokens->contents[pos].kind == RANK_AS || tokens->contents[pos].kind == RANK_SWITCH || tokens->contents[pos].kind == RANK_BINARY || tokens->contents[pos].kind == RANK_BINARY_PRIMARY)) {
        if (tokens->contents[pos].kind == RANK_DEFINITE_TYPE || tokens->contents[pos].kind == RANK_IS_TYPE) {
            RankParse suffix = memo[pos * 2 + force];
            result.valid &= suffix.valid;
            result.collection_ternary |= suffix.collection_ternary;
            if (suffix.role) result.role = suffix.role;
            result.end = suffix.end;
            return result;
        }
        if (tokens->contents[pos].kind == RANK_AS || tokens->contents[pos].kind == RANK_SWITCH || tokens->contents[pos].kind == RANK_BINARY || tokens->contents[pos].kind == RANK_BINARY_PRIMARY) {
            result.valid &= !force || !tokens->contents[pos].force_unsafe;
            result.collection_ternary |= tokens->contents[pos].force_unsafe;
            primary = tokens->contents[pos].kind == RANK_BINARY_PRIMARY;
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

static unsigned rank_parse_type(const RankTokens *tokens, const RankParse *memo, unsigned pos, bool force, unsigned target, RankParse *result) {
    unsigned question = pos + 1;
    if (tokens->contents[pos].kind != RANK_DEFINITE_TYPE) {
        RankParse after = memo[(question + 1) * 2 + force];
        if (!after.valid) { result->valid = false; return after.end; }
        if (tokens->contents[after.end].kind == RANK_COLON) return question;
    }
    if (question == target) result->role = RANK_NULLABLE_LAST;
    return question + 2;
}

static unsigned rank_conditional(const RankTokens *tokens, const RankParse *memo, unsigned pos, bool force, unsigned target, RankParse *result) {
    RankParse when_true = memo[(pos + 1) * 2 + force];
    if (tokens->contents[when_true.end].kind != RANK_COLON && !force && when_true.collection_ternary) {
        RankParse retry = memo[(pos + 1) * 2 + 1];
        if (retry.valid && tokens->contents[retry.end].kind == RANK_COLON) when_true = retry;
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
