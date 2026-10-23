#ifndef TREE_SITTER_C_SHARP_NULLABLE_RANK_H_
#define TREE_SITTER_C_SHARP_NULLABLE_RANK_H_

#include "nullableTypes.h"
#include "questionLiterals.h"

typedef enum {
    RANK_NONE,
    RANK_NULLABLE_LAST,
    RANK_NULLABLE_NEXT,
    RANK_TERNARY,
    RANK_AFTER_NULLABLE,
    RANK_PATTERN_COMPLETE,
} NullableRankRole;

typedef struct { QuestionInput *input; QuestionCheckpoint prefix, tail; unsigned end; bool prefix_questions; } RankScopeRead;

typedef enum { RANK_ATOM, RANK_NONPRIMARY_ATOM, RANK_LAMBDA, RANK_IS_TYPE, RANK_DEFINITE_TYPE, RANK_QUESTION, RANK_COLON, RANK_CONTINUATION, RANK_AS, RANK_SWITCH, RANK_BINARY, RANK_BINARY_PRIMARY, RANK_NESTED_ATOM, RANK_END } RankTokenKind;
typedef enum { RANK_CERT_START, RANK_CERT_INVALID, RANK_CERT_DECIMAL, RANK_CERT_NAME, RANK_CERT_IS, RANK_CERT_TYPE } RankCertificate;
typedef struct { unsigned end; uint8_t role; bool collection_ternary; bool valid; } RankParse;
typedef struct { RankTokenKind kind; bool collection; bool force_unsafe; RankCertificate certificate; RankParse nested[2]; } RankToken;
typedef Array(RankToken) RankTokens;
typedef enum { RANK_HEADER_START, RANK_HEADER_MODIFIER, RANK_HEADER_NAME, RANK_HEADER_PARAMETERS, RANK_HEADER_DELEGATE, RANK_HEADER_DELEGATE_PARAMETERS, RANK_HEADER_INVALID } RankLambdaHeader;
typedef struct { unsigned token; RankLambdaHeader header; bool content; bool primary; bool type_pending; bool type_complete; bool pattern; bool member; bool colon; bool conditional; bool nullable_type; bool division; bool has_word; QuestionIdentifier word; unsigned nullable_event; } RankExpression;

static bool question_type_boundary(int32_t c);
static uint8_t rank_stream_role(TSLexer *lexer, Scanner *scanner, uint32_t *questions);
static bool rank_numeric_type_chain(const RankTokens *tokens);
static RankCertificate rank_certify_character(RankCertificate certificate, int32_t c);
static RankCertificate rank_certify_word(RankCertificate certificate, const QuestionIdentifier *name);
static bool rank_read_omitted_ranks(TSLexer *lexer, RankTokens *tail, bool *definite);
static bool rank_read_bracket(TSLexer *lexer);
static bool rank_read_stream(TSLexer *lexer, RankTokens *tokens, unsigned *colons);
static bool rank_read_stream_from(TSLexer *, RankTokens *, unsigned *, bool);
static bool rank_complete_arguments(TSLexer *, RankScopeRead *, Scanner *);
static bool rank_complete_sibling(TSLexer *, Scanner *, QuestionInput *);
static bool rank_prepare_arguments(const Scanner *, RankScopeRead *, Scanner *);
static bool rank_apply_transfer(const QuestionFrame *, RankParse [2]);
static void rank_save_transfer(QuestionFrame *, const RankParse [2], const RankParse [2]);
static bool rank_read_atom(TSLexer *lexer, RankTokens *tokens, bool *colon);
static bool rank_read_collection(TSLexer *lexer, RankTokens *tokens);
static bool rank_read_operator(TSLexer *lexer, RankTokens *tokens, unsigned *colons, bool *atom, bool division);
static bool rank_read_postfix(TSLexer *lexer, int32_t c);
static bool rank_read_as(TSLexer *lexer, RankTokens *tokens, bool *colon);
static bool rank_read_switch(TSLexer *lexer, bool *force_unsafe);
static bool rank_read_binary(TSLexer *lexer, int32_t c, RankTokens *tokens, bool *colon);
static bool rank_binary_start(int32_t c);
static bool rank_skip_binary_operator(TSLexer *lexer, int32_t c, bool *postfix, bool updates, bool *high);
static RankReadStep rank_start_binary_rhs(TSLexer *lexer, int32_t c, RankTokens *tokens, RankExpression *expression);
static void rank_mark_nonprimary(RankTokens *tokens, unsigned expression);
static bool rank_read_expression(TSLexer *lexer, RankTokens *tokens, bool *colon, RankTokenKind kind);
static bool rank_read_is(TSLexer *lexer, RankTokens *tokens, bool *colon);
static bool rank_read_expression_tail(TSLexer *lexer, RankTokens *tokens, bool *colon, RankExpression *expression);
static RankReadStep rank_start_conditional_operand(TSLexer *lexer, RankTokens *tokens, RankExpression *expression);
static RankReadStep rank_read_expression_name(TSLexer *lexer, RankTokens *tokens, bool *colon, RankExpression *expression);
static bool rank_read_expression_word(TSLexer *lexer, RankTokens *tokens, RankExpression *expression);
static bool rank_apply_expression_word(TSLexer *lexer, RankTokens *tokens, RankExpression *expression, QuestionIdentifier name);
static bool rank_read_creation(TSLexer *lexer, bool *force_unsafe);
static RankReadStep rank_read_pattern_word(TSLexer *lexer, const QuestionIdentifier *name, RankExpression *expression, RankCertificate *certificate);
static void rank_start_lambda(RankTokens *tokens, unsigned *expression);
static bool rank_read_lambda_arrow(TSLexer *lexer, RankTokens *tokens, unsigned *expression, RankLambdaHeader *header, bool *content, bool *primary);
static RankLambdaHeader rank_expression_group(RankTokens *tokens, unsigned *expression, RankLambdaHeader header, int32_t c, bool *primary);
static RankReadStep rank_read_expression_token(TSLexer *lexer, RankTokens *tokens, bool *colon, int32_t c, RankExpression *expression);
static RankReadStep rank_read_expression_type_question(TSLexer *lexer, RankTokens *tokens, RankExpression *expression);
static RankReadStep rank_read_expression_rank(TSLexer *lexer, RankTokens *tokens, RankExpression *expression);
static RankReadStep rank_read_expression_end(TSLexer *lexer, int32_t c, bool content, bool *colon);
static RankReadStep rank_read_expression_question(TSLexer *lexer, RankTokens *tokens, RankExpression *expression);
static bool rank_skip_rhs_token(TSLexer *lexer, int32_t c, RankExpression *expression, bool *force_unsafe, bool prefix);
static bool rank_read_rhs_generic(TSLexer *lexer, bool *colon, bool *generic, bool *high);
static bool rank_read_terminal(TSLexer *lexer, bool *colon);
static bool rank_read_question(TSLexer *lexer, RankTokens *tokens, bool *colon);
static void rank_evaluate_modes(const RankTokens *tokens, unsigned target, RankParse modes[2]);
static uint8_t rank_stream_result(TSLexer *lexer, Scanner *scanner, const RankTokens *tokens, unsigned target, bool has_next, RankScopeRead *);
static void rank_complete_modes(TSLexer *, Scanner *, RankParse [2], RankScopeRead *);

static void rank_enclosing_modes(TSLexer *lexer, Scanner *scanner, RankParse modes[2], bool);
static unsigned rank_enclosing_boundary(const Scanner *scanner, unsigned frame);
static RankParse rank_parse(const RankTokens *tokens, const RankParse *memo, unsigned start, bool force, unsigned target);
static RankParse rank_atom_summary(RankToken atom, bool force);
static unsigned rank_parse_type(const RankTokens *tokens, const RankParse *memo, unsigned pos, bool force, unsigned target, RankParse *result);
static unsigned rank_conditional(const RankTokens *tokens, const RankParse *memo, unsigned pos, bool force, unsigned target, RankParse *result);

static uint8_t rank_stream_input(TSLexer *, Scanner *, uint32_t *, QuestionInput *);

static uint8_t rank_stream_role(TSLexer *lexer, Scanner *scanner, uint32_t *questions) {
    QuestionInput input = question_input_create(lexer);
    uint8_t role = rank_stream_input(&input.lexer, scanner, questions, &input);
    array_delete(&input.characters);
    return role;
}

static uint8_t rank_stream_input(TSLexer *lexer, Scanner *scanner, uint32_t *questions, QuestionInput *input) {
    QuestionCheckpoint prefix = question_input_checkpoint(input);
    uint32_t prior_questions = *questions;
    uint32_t pending = scanner->question_frames[scanner->question_frame_count - 1].pending;
    int32_t first = question_skip_separators(lexer);
    if (first == '(' || first == '[' || first == '{') {
        advance(lexer);
        if (!rank_read_question_prefix(lexer, first, questions)) return RANK_NONE;
        return question_skip_separators(lexer) == '?' && question_read_single_question(lexer)
            ? RANK_PATTERN_COMPLETE : RANK_NONE;
    }
    bool simple_type = false;
    if (!rank_read_prefix(lexer, &simple_type, questions)) return RANK_NONE;
    advance(lexer);
    if (question_skip_separators(lexer) != '[') return RANK_NONE;
    advance(lexer);
    int32_t bracket_first = question_skip_separators(lexer);
    if (bracket_first < 0 || lexer->eof(lexer)) return RANK_NONE;
    if (bracket_first != ']' && bracket_first != ',') return RANK_TERNARY;
    RankTokens tail = array_new();
    bool definite = false;
    unsigned colons = 0;
    if (!rank_read_omitted_ranks(lexer, &tail, &definite)) { array_delete(&tail); return RANK_NONE; }
    RankScopeRead scope_read = {.input = input, .prefix = prefix,
        .tail = {.cursor = input->cursor, .capturing = input->capturing}, .prefix_questions = *questions > prior_questions};
    if (!rank_read_stream(lexer, &tail, &colons) || pending > colons) {
        array_delete(&tail);
        return RANK_NONE;
    }
    scope_read.end = input->cursor;
    if (!pending && simple_type && !definite &&
        (lexer->lookahead == ';' || lexer->eof(lexer)) && rank_numeric_type_chain(&tail)) {
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
    uint8_t result = rank_stream_result(lexer, scanner, &tokens, target, has_next, &scope_read);
    array_delete(&tokens);
    array_delete(&tail);
    return result;
}

static uint8_t rank_stream_result(TSLexer *lexer, Scanner *scanner, const RankTokens *tokens, unsigned target, bool has_next, RankScopeRead *scope) {
    RankParse modes[2];
    rank_evaluate_modes(tokens, target, modes);
    bool complete = modes[0].valid && modes[0].end == tokens->size - 1 &&
        modes[1].valid && modes[1].end == tokens->size - 1;
    if (complete && modes[0].role != modes[1].role) rank_complete_modes(lexer, scanner, modes, scope);
    RankParse parsed = modes[0];
    uint8_t result = RANK_NONE;
    if (parsed.valid && (complete || parsed.end == tokens->size - 1)) {
        if (parsed.role == RANK_TERNARY) result = RANK_TERNARY;
        else if (parsed.role == RANK_NULLABLE_LAST) result = has_next ? RANK_NULLABLE_NEXT : RANK_NULLABLE_LAST;
    }
    return result;
}

static void rank_complete_modes(TSLexer *lexer, Scanner *scanner, RankParse modes[2], RankScopeRead *scope) {
    Scanner context;
    bool has_siblings = lexer->lookahead == ',';
    bool scope_attempted = scope && (has_siblings || lexer->lookahead == ')');
    bool arguments_complete = scope_attempted && rank_prepare_arguments(scanner, scope, &context);
    QuestionFrame *frame = arguments_complete ? &context.question_frames[context.question_frame_count - 1] : NULL;
    RankParse original[2] = {modes[0], modes[1]};
    bool transferable = frame && context.question_frame_count - 1 >
        rank_enclosing_boundary(&context, context.question_frame_count - 1);
    bool cached = transferable && rank_apply_transfer(frame, modes);
    if (!cached) {
        arguments_complete = arguments_complete && has_siblings && rank_complete_arguments(lexer, scope, &context);
        rank_enclosing_modes(lexer, arguments_complete ? &context : scanner, modes, arguments_complete);
        if (arguments_complete && transferable)
            rank_save_transfer(&scanner->question_frames[context.question_frame_count - 1], original, modes);
    }
    if (scope_attempted) array_delete(&context.interpolation_stack);
}

static bool rank_apply_transfer(const QuestionFrame *frame, RankParse modes[2]) {
    if (!modes[0].role || !modes[1].role || modes[0].role == modes[1].role) return false;
    unsigned key = modes[0].collection_ternary | (modes[1].collection_ternary << 1);
    unsigned encoded = frame->rank_modes[key];
    if (!encoded) return false;
    RankParse input[2] = {modes[0], modes[1]};
    for (unsigned i = 0; i < 2; i++) {
        unsigned value = (encoded >> (i * 4)) & 15;
        unsigned origin = value & 3;
        modes[i].role = origin ? input[origin - 1].role : 0;
        modes[i].valid = (value & 4) != 0;
        modes[i].collection_ternary = (value & 8) != 0;
    }
    return true;
}

static void rank_save_transfer(QuestionFrame *frame, const RankParse input[2], const RankParse output[2]) {
    if (frame->group != 'p' || !input[0].role || !input[1].role || input[0].role == input[1].role) return;
    unsigned encoded = 256;
    for (unsigned i = 0; i < 2; i++) {
        unsigned origin = !output[i].role ? 0 : output[i].role == input[0].role ? 1 : output[i].role == input[1].role ? 2 : 3;
        if (origin == 3 || !output[i].valid) return;
        encoded |= (origin | 4 | (output[i].collection_ternary ? 8 : 0)) << (i * 4);
    }
    unsigned key = input[0].collection_ternary | (input[1].collection_ternary << 1);
    frame->rank_modes[key] = (uint16_t)encoded;
}

static void rank_enclosing_modes(TSLexer *lexer, Scanner *scanner, RankParse modes[2], bool arguments_complete) {
    unsigned frame = scanner->question_frame_count - 1;
    unsigned boundary = rank_enclosing_boundary(scanner, frame);
    while (frame > boundary && (scanner->question_frames[frame].group == '(' || scanner->question_frames[frame].group == 'p') &&
        !scanner->question_frames[frame].force_barrier && lexer->lookahead == ')') {
        QuestionFrame *parent = &scanner->question_frames[frame - 1];
        if (parent->unknown || parent->case_colon || parent->force_barrier) return;
        if (arguments_complete && parent->group && parent->group != '(' && parent->group != 'p') return;
        advance(lexer);
        RankTokens tail = array_new();
        array_push(&tail, ((RankToken){.kind = RANK_NESTED_ATOM, .nested = {modes[0], modes[1]}}));
        unsigned colons = 0;
        bool read = rank_read_stream(lexer, &tail, &colons);
        if (arguments_complete && lexer->lookahead == ',') { array_delete(&tail); return; }
        if (!read || parent->pending > colons) {
            if (read) { parent->unknown = true; question_clear_rank_from(scanner, frame); }
            array_delete(&tail);
            return;
        }
        RankTokens tokens = array_new();
        for (uint32_t i = 0; i < parent->pending; i++) {
            array_push(&tokens, ((RankToken){RANK_ATOM, false}));
            array_push(&tokens, ((RankToken){RANK_QUESTION, false}));
        }
        for (unsigned i = 0; i < tail.size; i++) array_push(&tokens, tail.contents[i]);
        array_delete(&tail);
        RankParse next[2];
        rank_evaluate_modes(&tokens, ((unsigned)-1), next);
        bool valid = next[0].valid && next[0].end == tokens.size - 1 &&
            next[1].valid && next[1].end == tokens.size - 1;
        array_delete(&tokens);
        if (!valid) return;
        modes[0] = next[0];
        modes[1] = next[1];
        frame--;
    }
}

static unsigned rank_enclosing_boundary(const Scanner *scanner, unsigned frame) {
    if (!scanner->interpolation_stack.size) return 0;
    const Interpolation *interpolation = array_back(&scanner->interpolation_stack);
    unsigned depth = interpolation->question_depth;
    if (!interpolation->open_brace_count || !depth || depth == UINT16_MAX) return frame;
    return depth > frame ? 0 : frame - depth + 1;
}

static bool rank_numeric_type_chain(const RankTokens *tokens) {
    unsigned pos = 0;
    while (pos + 4 < tokens->size) {
        RankToken question = tokens->contents[pos++];
        RankToken consequence = tokens->contents[pos++];
        RankToken colon = tokens->contents[pos++];
        if (question.kind != RANK_QUESTION || question.collection ||
            consequence.kind != RANK_ATOM || consequence.certificate != RANK_CERT_DECIMAL ||
            colon.kind != RANK_COLON) return false;
        RankToken alternative = tokens->contents[pos++];
        if (alternative.kind == RANK_ATOM && alternative.certificate == RANK_CERT_DECIMAL)
            return pos + 1 == tokens->size && tokens->contents[pos].kind == RANK_END;
        if (alternative.kind != RANK_NONPRIMARY_ATOM || alternative.certificate != RANK_CERT_TYPE ||
            pos + 3 >= tokens->size) return false;
        RankToken type = tokens->contents[pos++];
        RankToken nullable = tokens->contents[pos++];
        RankToken rank = tokens->contents[pos++];
        if (type.kind != RANK_IS_TYPE || nullable.kind != RANK_QUESTION || !nullable.collection ||
            rank.kind != RANK_ATOM || !rank.collection) return false;
    }
    return false;
}

static RankCertificate rank_certify_character(RankCertificate certificate, int32_t c) {
    if (c >= '0' && c <= '9' && (certificate == RANK_CERT_START || certificate == RANK_CERT_DECIMAL))
        return RANK_CERT_DECIMAL;
    if (!is_id_start(c) && c != '\\' && !(c == '?' && certificate == RANK_CERT_TYPE))
        return RANK_CERT_INVALID;
    return certificate;
}

static RankCertificate rank_certify_word(RankCertificate certificate, const QuestionIdentifier *name) {
    if (certificate == RANK_CERT_START && rank_identifier_allowed(name, true)) return RANK_CERT_NAME;
    if (certificate == RANK_CERT_NAME && name->keyword && !strcmp(name->word, "is")) return RANK_CERT_IS;
    if (certificate == RANK_CERT_IS && rank_identifier_allowed(name, true)) return RANK_CERT_TYPE;
    return RANK_CERT_INVALID;
}

static bool rank_read_omitted_ranks(TSLexer *lexer, RankTokens *tail, bool *definite) {
    unsigned count = 0;
    for (;;) {
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
        if (question_skip_separators(lexer) != '[') return true;
        advance(lexer);
    }
}

static bool rank_read_bracket(TSLexer *lexer) {
    if (question_skip_separators(lexer) != '[') return false;
    advance(lexer);
    if (question_skip_separators(lexer) < 0) return false;
    return rank_read_delimited(lexer, '[', RANK_BODY_BRACKET, NULL);
}

static bool rank_read_stream(TSLexer *lexer, RankTokens *tokens, unsigned *colons) {
    return rank_read_stream_from(lexer, tokens, colons, false);
}

static bool rank_read_stream_from(TSLexer *lexer, RankTokens *tokens, unsigned *colons, bool atom) {
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
    } else if (c == 'a') {
        if (!rank_read_as(lexer, tokens, atom)) return false;
    } else if (c == 's') {
        bool force_unsafe = false;
        if (!rank_read_switch(lexer, &force_unsafe)) return false;
        array_push(tokens, ((RankToken){RANK_SWITCH, false, force_unsafe}));
        *atom = false;
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
    return rank_read_collection(lexer, tokens);
}

static bool rank_read_collection(TSLexer *lexer, RankTokens *tokens) {
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

static bool rank_read_as(TSLexer *lexer, RankTokens *tokens, bool *colon) {
    QuestionIdentifier word;
    if (!rank_read_identifier(lexer, &word) || !word.keyword || strcmp(word.word, "as")) return false;
    RankExpression expression = {.token = tokens->size, .header = RANK_HEADER_INVALID, .content = true,
        .has_word = true, .word = word, .nullable_event = ((unsigned)-1)};
    array_push(tokens, ((RankToken){RANK_BINARY, false}));
    RankReadStep step = rank_read_expression_name(lexer, tokens, colon, &expression);
    if (step != RANK_READ_MORE) return step == RANK_READ_DONE;
    return rank_read_expression_tail(lexer, tokens, colon, &expression);
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
    while (expression->has_word || !lexer->eof(lexer)) {
        RankReadStep step;
        if (expression->has_word) {
            step = rank_read_expression_name(lexer, tokens, colon, expression);
        } else {
            int32_t c = question_skip_separators(lexer);
            if (c == -2 || c == '#') return false;
            step = rank_read_expression_end(lexer, c, expression->content, colon);
            if (step == RANK_READ_TOKEN) step = rank_read_expression_token(lexer, tokens, colon, c, expression);
        }
        if (step != RANK_READ_MORE) return step == RANK_READ_DONE;
    }
    return expression->content;
}

static RankReadStep rank_start_conditional_operand(TSLexer *lexer, RankTokens *tokens, RankExpression *expression) {
    if (!expression->has_word && lexer->lookahead == '[')
        return rank_read_collection(lexer, tokens) ? RANK_READ_DONE : RANK_READ_UNKNOWN;
    *expression = (RankExpression){.token = tokens->size, .header = RANK_HEADER_START, .primary = true,
        .has_word = expression->has_word, .word = expression->word, .nullable_event = ((unsigned)-1)};
    array_push(tokens, ((RankToken){RANK_ATOM, false}));
    return RANK_READ_MORE;
}

static RankReadStep rank_read_expression_token(TSLexer *lexer, RankTokens *tokens, bool *colon, int32_t c, RankExpression *expression) {
    RankCertificate *certificate = &tokens->contents[expression->token].certificate;
    *certificate = rank_certify_character(*certificate, c);
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
            return expression->content ? rank_read_expression_question(lexer, tokens, expression) : RANK_READ_UNKNOWN;
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
        return rank_start_conditional_operand(lexer, tokens, expression);
    }
    return RANK_READ_MORE;
}

static bool rank_read_expression_word(TSLexer *lexer, RankTokens *tokens, RankExpression *expression) {
    do {
        QuestionIdentifier name = expression->word;
        if (!expression->has_word && !rank_read_identifier(lexer, &name)) return false;
        expression->has_word = false;
        if (!rank_apply_expression_word(lexer, tokens, expression, name)) return false;
    } while (expression->has_word && !expression->conditional);
    return true;
}

static bool rank_apply_expression_word(TSLexer *lexer, RankTokens *tokens, RankExpression *expression, QuestionIdentifier name) {
    RankCertificate *certificate = &tokens->contents[expression->token].certificate;
    *certificate = rank_certify_word(*certificate, &name);

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
        expression->division = read.division || read.binary;
        expression->has_word = read.has_word;
        expression->word = read.word;
        expression->header = RANK_HEADER_INVALID;
        return true;
    }
    RankReadStep pattern = rank_read_pattern_word(lexer, &name, expression, certificate);
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

static RankReadStep rank_read_pattern_word(TSLexer *lexer, const QuestionIdentifier *name, RankExpression *expression, RankCertificate *certificate) {
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
        expression->type_complete = rank_read_as_name_tail(lexer, &read, true);
        if (*certificate == RANK_CERT_TYPE && read.initial_suffix != '?') *certificate = RANK_CERT_INVALID;
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

static RankReadStep rank_read_expression_question(TSLexer *lexer, RankTokens *tokens, RankExpression *expression) {
    unsigned binary = expression->token;
    bool primary = expression->primary;
    advance(lexer);
    if (lexer->lookahead == '?') {
        tokens->contents[binary].certificate = RANK_CERT_INVALID;
        expression->pattern = false;
        advance(lexer);
        return lexer->lookahead != '=' ? RANK_READ_MORE : RANK_READ_UNKNOWN;
    }
    if (question_skip_separators(lexer) == '.') {
        tokens->contents[binary].certificate = RANK_CERT_INVALID;
        return rank_read_postfix(lexer, '.') ? RANK_READ_MORE : RANK_READ_UNKNOWN;
    }
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
        return rank_start_conditional_operand(lexer, tokens, expression);
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
    if (!rank_read_omitted_ranks(lexer, &ranks, &definite)) { array_delete(&ranks); return RANK_READ_UNKNOWN; }
    if (definite || ranks.size) tokens->contents[expression->token].certificate = RANK_CERT_INVALID;
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
    RankReadStep literal = rank_skip_literal(lexer, c, RANK_BODY_EXPRESSION, force_unsafe, 0);
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
    } else if (lexer->lookahead != '[') {
        array_push(tokens, ((RankToken){RANK_QUESTION, false}));
        return rank_read_atom(lexer, tokens, colon);
    } else {
        advance(lexer);
        bool empty = question_skip_separators(lexer) == ']';
        bool force_unsafe = false;
        if (!rank_read_delimited(lexer, '[', RANK_BODY_EXPRESSION, &force_unsafe)) return false;
        array_push(tokens, ((RankToken){RANK_QUESTION, !empty}));
        array_push(tokens, ((RankToken){RANK_ATOM, true, force_unsafe}));
    }
    return true;
}

static void rank_evaluate_modes(const RankTokens *tokens, unsigned target, RankParse modes[2]) {
    RankParse *memo = ts_calloc((size_t)tokens->size * 2, sizeof(RankParse));
    for (unsigned end = tokens->size; end > 0; end--) {
        unsigned start = end - 1;
        memo[start * 2 + 1] = rank_parse(tokens, memo, start, true, target);
        memo[start * 2] = rank_parse(tokens, memo, start, false, target);
    }
    modes[0] = memo[0];
    modes[1] = memo[1];
    ts_free(memo);
}

static RankParse rank_parse(const RankTokens *tokens, const RankParse *memo, unsigned start, bool force, unsigned target) {
    RankParse result = {.end = start, .valid = true};
    RankToken first = tokens->contents[start];
    unsigned pos = start;
    bool nested = first.kind == RANK_NESTED_ATOM;
    bool primary = first.kind == RANK_ATOM || nested;
    if (first.kind == RANK_LAMBDA) return memo[(start + 1) * 2];
    if (primary || first.kind == RANK_NONPRIMARY_ATOM) {
        result = rank_atom_summary(first, force);
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

static RankParse rank_atom_summary(RankToken atom, bool force) {
    if (atom.kind == RANK_NESTED_ATOM) return atom.nested[force];
    return (RankParse){.valid = !force || !atom.force_unsafe, .collection_ternary = atom.force_unsafe};
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
