#ifndef TREE_SITTER_C_SHARP_QUESTION_CONTEXT_H_
#define TREE_SITTER_C_SHARP_QUESTION_CONTEXT_H_

static bool question_context_idle(const Scanner *scanner);
static bool question_close_frame(Scanner *scanner, char closing);

static bool apply_question_events(Scanner *scanner, const char *events, unsigned count);

static int32_t question_skip_separators(TSLexer *lexer) {
    for (;;) {
        while (is_space_but_line_feed(lexer->lookahead) || is_line_terminator(lexer->lookahead)) advance(lexer);
        if (lexer->lookahead < 0) return -2;
        if (lexer->lookahead != '/') return lexer->lookahead;
        advance(lexer);
        if (lexer->lookahead == '/') skip_line_comment(lexer);
        else if (lexer->lookahead == '*') {
            if (!skip_block_comment(lexer)) return -2;
        } else return -1;
    }
}

static bool question_read_single_question(TSLexer *lexer) {
    if (lexer->lookahead != '?') return false;
    advance(lexer);
    return lexer->lookahead != '?';
}

static bool question_word_in(const char *word, const char *const *words, unsigned count) {
    for (unsigned i = 0; i < count; i++)
        if (!strcmp(word, words[i])) return true;
    return false;
}

typedef struct {
    int32_t token;
    bool member;
} QuestionFollowing;

static QuestionFollowing question_following(TSLexer *lexer) {
    QuestionFollowing following = {.token = lexer->lookahead};
    if (following.token != '.') return following;
    advance(lexer);
    if (lexer->lookahead >= '0' && lexer->lookahead <= '9') following.token = lexer->lookahead;
    else following.member = lexer->lookahead != '.';
    return following;
}

typedef struct {
    char word[16];
    unsigned length;
    bool keyword;
} QuestionIdentifier;

static bool question_unicode_escape(TSLexer *lexer, bool first, uint32_t *codepoint);
static unsigned question_hex_digit(int32_t c);

static bool question_identifier(TSLexer *lexer, bool verbatim, QuestionIdentifier *identifier) {
    *identifier = (QuestionIdentifier){.keyword = !verbatim};
    bool first = true;
    for (;;) {
        uint32_t codepoint = (uint32_t)lexer->lookahead;
        bool escaped = codepoint == '\\';
        if (escaped) {
            if (!question_unicode_escape(lexer, first, &codepoint)) return false;
        } else {
            bool identifier_character = first ? is_id_start((int32_t)codepoint) : is_id_continue((int32_t)codepoint);
            if (!identifier_character) return !first && (codepoint <= 127 ||
                is_space_but_line_feed((int32_t)codepoint) || is_line_terminator((int32_t)codepoint));
            advance(lexer);
        }
        if (escaped || codepoint > 127) identifier->keyword = false;
        if (identifier->length < sizeof(identifier->word) - 1) identifier->word[identifier->length] = (char)codepoint;
        if (identifier->length < sizeof(identifier->word)) identifier->length++;
        first = false;
    }
}

static bool question_unicode_escape(TSLexer *lexer, bool first, uint32_t *codepoint) {
    advance(lexer);
    unsigned digits = lexer->lookahead == 'u' ? 4 : lexer->lookahead == 'U' ? 8 : 0;
    if (!digits) return false;
    advance(lexer);
    *codepoint = 0;
    for (unsigned i = 0; i < digits; i++) {
        unsigned digit = question_hex_digit(lexer->lookahead);
        if (digit == 16) return false;
        *codepoint = (*codepoint << 4) | digit;
        advance(lexer);
    }
    if (*codepoint > 0x10FFFF || (*codepoint >= 0xD800 && *codepoint <= 0xDFFF)) return false;
    return first ? is_id_start((int32_t)*codepoint) : is_id_continue((int32_t)*codepoint);
}

static unsigned question_hex_digit(int32_t c) {
    if (c >= '0' && c <= '9') return (unsigned)(c - '0');
    if (c >= 'a' && c <= 'f') return (unsigned)(c - 'a' + 10);
    if (c >= 'A' && c <= 'F') return (unsigned)(c - 'A' + 10);
    return 16;
}

#include "nullableTypes.h"
#include "genericExpressions.h"
static void question_scope_init(Scanner *scope, const Scanner *source) {
    *scope = *source;
    scope->interpolation_stack.contents = NULL;
    scope->interpolation_stack.size = scope->interpolation_stack.capacity = 0;
    array_assign(&scope->interpolation_stack, &source->interpolation_stack);
}

static bool question_rank_scope(Scanner *, QuestionInput *, QuestionCheckpoint, unsigned, bool);
static bool question_apply_event(Scanner *, char);
static void question_end_lambda(QuestionFrame *);
static void question_clear_rank_from(Scanner *, unsigned);
#include "nullableRank.h"

typedef enum {
    QUESTION_EXPRESSION_RECEIVER = 1,
    QUESTION_CASE_COLON = 2,
    QUESTION_NULLABLE_ONLY = 4,
    QUESTION_ACCESS_ALTERNATIVE = 8,
    QUESTION_NULLABLE_ALLOWED = 16,
    QUESTION_DIMENSION_EXPRESSION = 32,
} QuestionContextFlags;

static const char *const question_predefined_types[] = {"bool", "byte", "sbyte", "char", "decimal", "double", "float", "int", "uint", "long", "ulong", "short", "ushort", "string", "object", "void"};

typedef struct {
    QuestionFollowing following;
    QuestionInput *input;
    bool syntax_only;
    bool discard_to_question;
    Scanner *scanner;
    Scanner *preview;
    unsigned preview_count;
    bool preview_ready;
    bool preview_valid;
    bool generic_declaration;
    int32_t consumed_token;
    uint32_t cached_count;
    uint32_t proven_nullable_questions;
    uint32_t reserved;
    uint64_t mandatory;
    uint64_t optional;
    uint64_t is_optional;
    uint64_t is_reserved;
    bool is_eligible;
    bool is_ternary_eligible;
    bool is_seen;
    bool type_operand;
    bool pending_as_role;
    bool as_operand;
    bool is_name_pending;
    bool allocation_type;
    bool allocation_rank;
    bool type_rank;
    bool is_later_alternative;
    bool is_as_phase;
    bool is_current_consumed;
    bool is_pending_bracket;
    int depth;
    unsigned brace_depth;
    uint8_t root_colons;
    bool root_binary;
    bool prefix_ordinary;
    bool future_root_question;
    bool own_as_seen;
    bool ordinary_is_seen;
    bool typed_ordinary_snapshot;
    uint64_t ordinary_optionals;
    bool argument_ended;
    bool lambda_boundary;
    bool cached_access;
    bool binding;
    QuestionSuffixBuilder suffix;
    bool entering_binding;
    bool nullable_only;
    bool nullable_allowed;
    bool omitted_rank_candidate;
    bool nullable_name_candidate;
    bool logical_name_candidate;
    bool role_known;
    bool own_is_unknown;
    bool context_known;
    bool proved_ternary;
    bool no_colons;
    bool cache_shaped;
    bool cache_type_uncertain;
    bool cache_colon;
    bool role_active;
    bool case_colon_possible;
    bool case_boundary;
    bool array_type_boundary;
    bool recording;
    bool ordinary;
    bool known_nullable;
    bool known_ternary;
    uint8_t rank_phase;
    bool nullable_terminator;
    bool definite_ternary;
    bool assignment_possible;
    bool first_word;
    bool ordinary_first_token;
    bool future_first_token;
    bool later_ordinary_operand;
    bool access_chain_value;
    bool ambiguous_binding_chain;
    unsigned binding_chain_depth;
    bool future_ternary_eligible;
    bool confirmation_operand;
    bool confirmation_type;
    bool ordinary_name_candidate;
    bool ordinary_colon_context;
    bool found_next_question;
    int32_t interpolation_depth;
    bool interpolation_end;
    bool nullable_context;
    bool access_alternative;
    RankGroups events;
    Array(char) groups;
    int32_t previous_token;
} QuestionWalk;

enum { QUESTION_ROLE_INVALID = 4 };
typedef enum { QUESTION_WALK_CONTINUE, QUESTION_WALK_STOP, QUESTION_WALK_UNKNOWN, QUESTION_WALK_INVALID } QuestionWalkStep;

static bool question_walk_role_known(const QuestionWalk *walk);

static bool question_array_type_boundary(const Scanner *, const QuestionWalk *, unsigned);

static QuestionWalk question_walk_create(Scanner *scanner, QuestionFollowing following, bool known_nullable, unsigned context_flags, uint8_t rank_phase);
static QuestionWalkStep question_walk_argument_end(TSLexer *lexer, QuestionWalk *walk);
static QuestionWalkStep question_walk_punctuation(Scanner *, TSLexer *, QuestionWalk *, int32_t);
static void question_walk_nullable_tail(QuestionWalk *walk, int32_t c);
static bool question_suffix_ordinary(QuestionFollowing next);
static void question_walk_logical_nullable(QuestionWalk *walk);
static bool question_pattern_only_start(int32_t c);

static QuestionWalkStep question_walk_step(Scanner *scanner, TSLexer *lexer, QuestionWalk *walk, int32_t c);
static bool question_walk_operator_context(TSLexer *lexer, QuestionWalk *walk, int32_t c, bool first);
static bool question_walk_binding_operator(TSLexer *lexer, QuestionWalk *walk, int32_t c);
static unsigned question_walk_finish(Scanner *scanner, TSLexer *lexer, QuestionWalk *walk);
static bool question_walk_proves_binding_ternary(const QuestionWalk *walk);
static unsigned question_walk_role(TSLexer *lexer, QuestionWalk *walk);
static unsigned question_walk_type_test_role(TSLexer *lexer, QuestionWalk *walk);
static void question_save_confirmation(Scanner *scanner, const Scanner *confirmed);
static void question_complete_context(Scanner *, bool, bool);
static bool question_walk_access_prefix(const QuestionWalk *walk);
static bool question_type_boundary(int32_t c);
static bool question_opening_group(int32_t c);
static bool question_closing_group(int32_t c);
static bool question_operator(int32_t c);
static QuestionWalkStep question_walk_literal(TSLexer *lexer, QuestionWalk *walk, int32_t c, bool first_identifier);
static QuestionWalkStep question_walk_string(TSLexer *, QuestionWalk *, bool);
static QuestionWalkStep question_walk_identifier(Scanner *scanner, TSLexer *lexer, QuestionWalk *walk, bool first_identifier, bool future_identifier);
static QuestionWalkStep question_walk_identifier_read(Scanner *, TSLexer *, QuestionWalk *, bool, bool, const QuestionCheckpoint *);
static void question_walk_type_operand(QuestionWalk *walk, bool future_identifier, bool is_or_as, const QuestionIdentifier *identifier, bool creation);
static bool question_keyword_incomplete(TSLexer *lexer, const QuestionWalk *walk, const QuestionIdentifier *identifier);
static QuestionWalkStep question_walk_creation_prefix(TSLexer *lexer, QuestionWalk *walk);
static QuestionWalkStep question_walk_creation_child(TSLexer *, QuestionWalk *);
static bool question_walk_creation_tuple(TSLexer *lexer, QuestionWalk *walk, bool *tuple);
static bool question_walk_is_name(TSLexer *, QuestionWalk *, const QuestionIdentifier *);
static bool question_walk_name_suffix(TSLexer *, QuestionWalk *, const QuestionIdentifier *, RankTypeRead *);
static void question_walk_is_name_operator(QuestionWalk *, int32_t);
static QuestionWalkStep question_walk_as_prefix(TSLexer *lexer, QuestionWalk *walk);
static QuestionWalkStep question_walk_identifier_operand(TSLexer *lexer, QuestionWalk *walk, const QuestionIdentifier *identifier, bool creation, const QuestionCheckpoint *);
static bool question_walk_future_lambda(TSLexer *, QuestionWalk *, const QuestionIdentifier *, const QuestionCheckpoint *);
static bool question_read_nullable_lambda_header(TSLexer *, QuestionInput *, RankTypeRead *, const QuestionCheckpoint *);
static bool question_read_lambda_modifiers(TSLexer *, QuestionInput *);

static void question_walk_keyword_context(Scanner *scanner, QuestionWalk *walk, const QuestionIdentifier *identifier, bool is_or_as);
static bool question_walk_type_keyword(QuestionWalk *walk, const QuestionIdentifier *identifier, bool is_or_as, bool case_colon);
static bool question_walk_independent_type(const QuestionWalk *, bool, bool);
static QuestionWalkStep question_walk_question(TSLexer *lexer, QuestionWalk *walk);
static void question_walk_coalescing(TSLexer *lexer, QuestionWalk *walk);
static bool question_walk_root_question(TSLexer *lexer, QuestionWalk *walk);
static QuestionWalkStep question_walk_assignment(TSLexer *lexer, QuestionWalk *walk);
static void question_walk_assignment_context(QuestionWalk *walk, bool comparison);
static QuestionWalkStep question_walk_delimiter(Scanner *scanner, TSLexer *lexer, QuestionWalk *walk, int32_t c);
static bool question_walk_operand_group(TSLexer *lexer, QuestionWalk *walk, int32_t c);
static void question_walk_creation_operator(QuestionWalk *, int32_t);
static bool question_walk_group(TSLexer *lexer, QuestionWalk *walk, int32_t c);
static void question_walk_type_rank_end(TSLexer *lexer, QuestionWalk *walk);
static bool question_walk_type_pattern(TSLexer *lexer, QuestionWalk *walk);
static bool question_walk_current_type_pattern(TSLexer *lexer, QuestionWalk *walk);
static bool question_walk_pattern_suffix(TSLexer *lexer, bool *nullable, uint32_t *questions);
static bool question_walk_pattern_tail(TSLexer *lexer, bool nullable);
static bool question_walk_type_follows(TSLexer *, QuestionWalk *);
static QuestionWalkStep question_walk_enter_binding(Scanner *scanner, TSLexer *lexer, QuestionWalk *walk);
static QuestionWalkStep question_walk_leading_commas(TSLexer *lexer, QuestionWalk *walk);
static bool question_walk_multidimensional_rank(TSLexer *lexer, QuestionWalk *walk, int32_t *first);
static bool question_walk_enter_pending_binding(TSLexer *lexer, QuestionWalk *walk);
static bool question_binding_start(TSLexer *lexer, int32_t first);
static bool question_invalid_binding_has_clause(TSLexer *lexer, const QuestionWalk *walk);
static bool question_expression_start(TSLexer *lexer, int32_t first);
static void question_walk_colon(QuestionWalk *walk);
static void question_walk_complete_colon(QuestionWalk *walk);
static void question_walk_future_question(QuestionWalk *walk, QuestionFollowing next);
static bool question_uncertain_keyword(const QuestionIdentifier *identifier);
static bool question_expression_keyword(const QuestionIdentifier *identifier);
static void question_walk_pending(QuestionWalk *walk, QuestionFrame *frame, bool proved_access);
static void question_walk_cache(Scanner *scanner, const QuestionWalk *walk, unsigned role);
static Interpolation *question_interpolation(Scanner *scanner);
static void interpolation_question_events(Scanner *scanner, const char *events, unsigned count);
static bool question_walk_interpolation_end(const QuestionWalk *walk, int32_t c);
static QuestionWalkStep question_walk_end_interpolation(Scanner *scanner, TSLexer *lexer, QuestionWalk *walk);
static bool interpolation_question_group(RankGroups *groups, uint16_t *depth, int32_t c);
static void interpolation_question_prefix(TSLexer *lexer, Interpolation *interpolation, uint16_t depth);

#include "questionOperands.h"

static bool question_suffix_context(const Scanner *scanner, bool known, bool known_nullable, uint8_t rank_phase) {
    const QuestionFrame *frame = &scanner->question_frames[scanner->question_frame_count - 1];
    return known && !known_nullable && !rank_phase && !scanner->interpolation_stack.size &&
        !frame->case_colon && !frame->force_barrier && !frame->query_pending && !frame->query_result && !frame->generic_pending;
}

static QuestionWalk question_walk_create(Scanner *scanner, QuestionFollowing following, bool known_nullable, unsigned context_flags, uint8_t rank_phase) {
    const QuestionFrame *frame = &scanner->question_frames[scanner->question_frame_count - 1];
    bool context_known = !scanner->question_unknown && !frame->unknown;
    bool type_context = scanner->question_type_uncertain && !(context_flags & QUESTION_DIMENSION_EXPRESSION);
    bool known = context_known && (!type_context || (context_flags & QUESTION_EXPRESSION_RECEIVER));
    const Interpolation *interpolation = question_interpolation(scanner);
    bool ternary_only = rank_phase == RANK_PATTERN_COMPLETE;
    bool cached = scanner->question_access_cache && following.token == '[' && !ternary_only &&
        (known || (scanner->question_unknown && !known_nullable && !(context_flags & QUESTION_NULLABLE_ONLY)));
    bool suffix_context = question_suffix_context(scanner, known, known_nullable, rank_phase);
    unsigned suffix_role = question_suffix_take(&scanner->suffix, following.token == '[',
        suffix_context && (following.token == '[' || question_suffix_ordinary(following)), scanner->question_frame_count, frame->pending);
    bool case_boundary = frame->case_colon && (frame->case_guard || !(context_flags & QUESTION_CASE_COLON));
    bool ordinary = following.token != '[' && !following.member;
    bool definite_ternary = ternary_only || (ordinary && !known_nullable && following.token >= '0' && following.token <= '9');
    QuestionWalk walk = {
        .suffix = {.role = suffix_role, .regular = !suffix_role && following.token == '[' && suffix_context},
        .following = following,
        .interpolation_depth = interpolation && interpolation->question_depth != UINT16_MAX ? interpolation->question_depth : -1,
        .nullable_context = type_context || rank_phase != RANK_NONE,
        .access_alternative = context_flags & QUESTION_ACCESS_ALTERNATIVE,
        .cached_count = scanner->question_access_cache,
        .reserved = frame->pending,
        .mandatory = (uint64_t)frame->pending + ordinary + case_boundary,
        .optional = following.token == '[',
        .is_optional = following.token == '[',
        .is_reserved = (uint64_t)frame->pending + case_boundary,
        .is_eligible = known && following.token == '[' && !cached,
        .is_ternary_eligible = true,
        .cached_access = cached,
        .entering_binding = following.token == '[',
        .nullable_only = context_flags & QUESTION_NULLABLE_ONLY,
        .nullable_allowed = context_flags & QUESTION_NULLABLE_ALLOWED,
        .omitted_rank_candidate = following.token == '[',
        .role_known = known,
        .context_known = context_known,
        .no_colons = true,
        .cache_shaped = following.token == '[' && !cached && !ternary_only,
        .role_active = !suffix_role && !following.member && !cached && !known_nullable && !definite_ternary,
        .case_colon_possible = context_flags & QUESTION_CASE_COLON,
        .case_boundary = case_boundary,
        .recording = true,
        .ordinary = ordinary,
        .ordinary_colon_context = !scanner->question_unknown && !frame->unknown && !frame->pending &&
            (!scanner->interpolation_stack.size || (interpolation && interpolation->question_depth > 0 &&
                interpolation->question_depth != UINT16_MAX)) &&
            !(context_flags & (QUESTION_NULLABLE_ONLY | QUESTION_CASE_COLON)),
        .known_nullable = known_nullable && !suffix_role,
        .known_ternary = definite_ternary || suffix_role == 2,
        .rank_phase = rank_phase,
        .nullable_terminator = question_type_boundary(following.token) || following.token == '}',
        .definite_ternary = definite_ternary,
        .first_word = true,
        .ordinary_first_token = ordinary && following.token != '/',
    };
    walk.array_type_boundary = question_array_type_boundary(scanner, &walk, context_flags);
    if (walk.suffix.regular) array_push(&walk.suffix.live, UINT32_MAX);
    scanner->question_access_cache = 0;
    return walk;
}

static bool question_array_type_boundary(const Scanner *scanner, const QuestionWalk *walk, unsigned context_flags) {
    unsigned type_flags = QUESTION_CASE_COLON | QUESTION_NULLABLE_ALLOWED;
    return walk->case_boundary && walk->rank_phase != RANK_PATTERN_COMPLETE && walk->following.token == '[' &&
        !scanner->question_type_uncertain &&
        (context_flags & (type_flags | QUESTION_ACCESS_ALTERNATIVE)) == type_flags;
}


static QuestionWalkStep question_walk_step(Scanner *scanner, TSLexer *lexer, QuestionWalk *walk, int32_t c) {
    if (question_walk_interpolation_end(walk, c)) return question_walk_end_interpolation(scanner, lexer, walk);
    question_walk_nullable_tail(walk, c);
    if (!is_id_start(c) && c != '\\' && c != '@') walk->generic_declaration = false;
    bool first_identifier = walk->ordinary_first_token;
    bool future_identifier = walk->future_first_token;
    walk->future_first_token = false;
    if (c == '?' && walk->ordinary_name_candidate && walk->recording && !walk->depth) {
        walk->known_ternary = true;
        walk->known_nullable = false;
        walk->definite_ternary = true;
    }
    walk->ordinary_first_token = false;
    if (question_walk_operator_context(lexer, walk, c, first_identifier)) return QUESTION_WALK_CONTINUE;
    if (c == '=') return question_walk_assignment(lexer, walk);
    if (!is_id_start(c) && c != '\\') walk->ordinary_name_candidate = false;
    if (c == -1) {
        if (walk->recording && !walk->depth && walk->ordinary) walk->definite_ternary = true;
        if (!walk->depth && walk->binding && !walk->cache_colon) walk->root_binary = true;
        return QUESTION_WALK_CONTINUE;
    }
    if (!walk->depth && walk->binding && !walk->cache_colon && question_walk_binding_operator(lexer, walk, c))
        return QUESTION_WALK_CONTINUE;
    if (c == '$' || c == '@' || c == '"' || c == '\'') return question_walk_literal(lexer, walk, c, first_identifier);
    if (c == 0 || c == '#') return QUESTION_WALK_UNKNOWN;
    if (is_id_start(c) || c == '\\') return question_walk_identifier(scanner, lexer, walk, first_identifier, future_identifier);
    if (c == '?') return question_walk_question(lexer, walk);
    return question_walk_punctuation(scanner, lexer, walk, c);
}

static QuestionWalkStep question_walk_punctuation(Scanner *scanner, TSLexer *lexer, QuestionWalk *walk, int32_t c) {
    if (walk->recording && !walk->depth && walk->ordinary && question_operator(c)) walk->definite_ternary = true;
    if (c == ':' || c == ';' || question_opening_group(c) || question_closing_group(c))
        return question_walk_delimiter(scanner, lexer, walk, c);
    if (c == '>' && walk->recording) array_push(&walk->events, 'h');
    if (c == ',' && walk->recording) array_push(&walk->events, ',');
    if (c == ',' && !walk->depth) return question_walk_argument_end(lexer, walk);
    advance(lexer);
    return QUESTION_WALK_CONTINUE;
}

static QuestionWalkStep question_walk_argument_end(TSLexer *lexer, QuestionWalk *walk) {
    if (walk->recording) {
        const QuestionFrame *prefix = question_walk_prefix_frame(walk);
        if (prefix && !prefix->generic_pending && !prefix->query_pending) walk->argument_ended = true;
    }
    walk->suffix.boundary = true;
    walk->is_eligible = walk->is_eligible && walk->is_later_alternative;
    walk->role_active = false;
    if (!walk->recording) return QUESTION_WALK_STOP;
    advance(lexer);
    return QUESTION_WALK_CONTINUE;
}

static void question_walk_nullable_tail(QuestionWalk *walk, int32_t c) {
    if (walk->logical_name_candidate && !walk->recording && !walk->depth &&
        question_pattern_only_start(c))
        question_walk_logical_nullable(walk);
    if (!is_id_start(c) && c != '\\' && c != '@') walk->logical_name_candidate = false;
    if (!walk->depth && (c == ')' || c == ',') &&
        (walk->omitted_rank_candidate || walk->nullable_name_candidate || walk->ordinary_name_candidate))
        walk->known_nullable = true;
    walk->nullable_name_candidate = walk->omitted_rank_candidate && !walk->depth &&
        (is_id_start(c) || c == '@' || c == '\\');
    if (walk->omitted_rank_candidate)
        walk->omitted_rank_candidate = (c == '[' && !walk->depth) ||
            ((c == ']' || c == ',') && walk->depth == 1);
}

static void question_walk_logical_nullable(QuestionWalk *walk) {
    if (walk->recording) walk->known_nullable = true;
    else walk->mandatory--;
}

static bool question_pattern_only_start(int32_t c) {
    return c == '{' || c == '$' || c == '"' || c == '\'' || (c >= '0' && c <= '9');
}

static bool question_walk_operator_context(TSLexer *lexer, QuestionWalk *walk, int32_t c, bool first) {
    if (!walk->depth && (question_operator(c) || c == -1)) {
        walk->access_chain_value = false;
    }
    question_walk_creation_operator(walk, c);
    question_walk_is_name_operator(walk, c);
    if (!walk->depth && (question_operator(c) || c == -1)) walk->as_operand = false;
    if (walk->ordinary_name_candidate && walk->recording && !walk->depth && !walk->nullable_only &&
        (question_operator(c) || c == '(' || c == '[' || c == '.' || c == '<' || c == '>' || c == -1)) {
        walk->known_ternary = true;
        walk->known_nullable = false;
        walk->definite_ternary = true;
    }
    if (!first || (c != '&' && c != '|')) return false;
    advance(lexer);
    if (lexer->lookahead == c) {
        advance(lexer);
        walk->known_nullable = true;
        walk->role_active = false;
    } else walk->definite_ternary = true;
    return true;
}

static bool question_walk_binding_operator(TSLexer *lexer, QuestionWalk *walk, int32_t c) {
        if (c == '*' || c == '%' || c == '&' || c == '|' || c == '^') walk->root_binary = true;
        if (c == '+' || c == '-' || c == '!' || c == '.') {
            advance(lexer);
            int32_t next = lexer->lookahead;
            if ((c == '+' || c == '-') && next != c && next != '=') walk->root_binary = true;
            if (c == '!' && next == '=') walk->root_binary = true;
            if (c == '.' && next == '.') walk->root_binary = true;
            return true;
        }
    return false;
}

static unsigned question_walk_finish(Scanner *scanner, TSLexer *lexer, QuestionWalk *walk) {
    QuestionFrame *frame = &scanner->question_frames[scanner->question_frame_count - 1];
    question_walk_finish_binding_chain(walk);
    if (question_walk_proves_binding_ternary(walk)) walk->known_ternary = true;
    unsigned role = question_walk_role(lexer, walk);
    bool confirmation_proved = walk->depth > 0 || walk->root_colons < 2 || !walk->optional ||
        (walk->optional == 1 && walk->confirmation_type);
    bool confirmable = !walk->lambda_boundary && !role && walk->ordinary && !walk->known_nullable && !walk->assignment_possible && confirmation_proved;
    Scanner confirmed;
    if (confirmable) {
        confirmed = *scanner;
        QuestionWalk ternary = *walk;
        ternary.known_ternary = true;
        question_walk_pending(&ternary, &confirmed.question_frames[confirmed.question_frame_count - 1], false);
        apply_question_events(&confirmed, walk->events.contents, walk->events.size);
    }
    question_walk_pending(walk, frame, role == 1 || role == 3);
    apply_question_events(scanner, walk->events.contents, walk->events.size);
    bool preserve_unknown = question_interpolation(scanner) && !walk->context_known;
    question_complete_context(scanner, walk->found_next_question, preserve_unknown);
    question_walk_cache(scanner, walk, role);
    if (!confirmable) return role;
    question_complete_context(&confirmed, walk->found_next_question, preserve_unknown);
    question_save_confirmation(scanner, &confirmed);
    return role;
}

static bool question_walk_proves_binding_ternary(const QuestionWalk *walk) {
    if (!walk->binding || walk->nullable_only || !walk->context_known) return false;
    if (walk->assignment_possible || walk->lambda_boundary || walk->case_colon_possible || walk->case_boundary) return false;
    return walk->proved_ternary && !walk->mandatory && !walk->optional;
}

static unsigned question_walk_role(TSLexer *lexer, QuestionWalk *walk) {
    if (walk->suffix.role) return walk->suffix.role;
    bool ambiguous_optional = (walk->reserved || walk->case_boundary) &&
        ((walk->optional > 1 && walk->prefix_ordinary) ||
         (walk->optional && !walk->is_eligible && walk->is_optional > walk->optional));
    if ((walk->pending_as_role && !walk->proved_ternary) ||
        (walk->mandatory && !walk->cached_access) ||
        (walk->root_colons && ((walk->is_seen && walk->is_eligible) || walk->own_as_seen) && ambiguous_optional)) walk->role_known = false;
    if (walk->known_ternary || (question_walk_role_known(walk) && walk->proved_ternary)) return 2;
    if (!walk->binding) return 0;
    if (walk->cached_access || question_walk_role_known(walk) || question_walk_access_prefix(walk)) return 1;
    return question_walk_type_test_role(lexer, walk);
}

static unsigned question_walk_type_test_role(TSLexer *lexer, QuestionWalk *walk) {
    bool complete = !walk->role_active || lexer->eof(lexer);
    bool is_proved = (!walk->pending_as_role || walk->proved_ternary) && walk->is_eligible && walk->is_seen &&
        !walk->is_reserved && !walk->is_pending_bracket && complete;
    bool is_access = is_proved && !walk->is_current_consumed;
    if (!is_access && !(is_proved && walk->is_ternary_eligible)) return 0;
    walk->known_ternary = walk->is_current_consumed && !walk->nullable_only;
    return walk->is_current_consumed ? 2 : 3;
}

static bool question_walk_access_prefix(const QuestionWalk *walk) {
    return walk->interpolation_depth >= 0 && !walk->context_known &&
        walk->cache_shaped && walk->optional && !walk->reserved && !walk->mandatory &&
        !walk->known_nullable && !walk->nullable_only && !walk->root_binary && !walk->proved_ternary;
}

static bool question_type_boundary(int32_t c) {
    return c == '>' || c == ',' || c == ')' || c == ']' || c == ';' || c == '=' || c == ':' || c == '*';
}

static bool question_opening_group(int32_t c) { return c == '(' || c == '[' || c == '{'; }
static bool question_closing_group(int32_t c) { return c == ')' || c == ']' || c == '}'; }
static bool question_operator(int32_t c) {
    return c == '+' || c == '-' || c == '/' || c == '%' || c == '&' || c == '|' || c == '^' || c == '!' || c == '~';
}

static bool question_keyword_incomplete(TSLexer *lexer, const QuestionWalk *walk, const QuestionIdentifier *identifier) {
    if (!identifier->keyword || !walk->role_active || !walk->binding) return false;
    static const char *const operands[] = {"new", "typeof", "sizeof", "checked", "unchecked", "delegate", "stackalloc"};
    bool required = question_word_in(identifier->word, operands, sizeof(operands) / sizeof(operands[0]));
    if (walk->depth == 1 && !walk->cache_type_uncertain)
        required |= question_word_in(identifier->word, question_predefined_types, sizeof(question_predefined_types) / sizeof(question_predefined_types[0]));
    if (!required) return false;
    int32_t next = question_skip_separators(lexer);
    return question_closing_group(next) || next == ':' || next == ';';
}

static bool question_walk_type_keyword(QuestionWalk *walk, const QuestionIdentifier *identifier, bool is_or_as, bool case_colon) {
    bool is_keyword = !strcmp(identifier->word, "is");
    bool root_is = is_keyword && !walk->depth;
    bool root_as = is_or_as && !walk->depth && !root_is;
    bool as_context = walk->case_boundary || (!walk->is_later_alternative && !walk->proved_ternary);
    if (!walk->depth) {
        walk->is_name_pending = root_is;
        walk->as_operand = root_as && walk->root_colons && as_context;
    }
    bool independent_type = question_walk_independent_type(walk, is_or_as, root_is);
    if (root_is && independent_type && walk->prefix_ordinary) {
        walk->ordinary_optionals = walk->optional;
        walk->typed_ordinary_snapshot = true;
    }
    if (is_or_as && !walk->depth) {
        walk->type_operand = true;
        walk->future_root_question = false;
    }
    if (root_as && walk->recording && !walk->root_colons) walk->own_as_seen = true;
    bool current_is = root_is && !independent_type;
    bool repeated_case_test = current_is && walk->is_seen && case_colon;
    walk->is_eligible = walk->is_eligible && !repeated_case_test;
    walk->is_seen = walk->is_seen || current_is;
    if (root_as && !walk->recording && walk->is_seen) walk->is_as_phase = true;
    else if (!root_is && !root_as && !independent_type) walk->is_eligible = false;
    return independent_type;
}

static bool question_walk_independent_type(const QuestionWalk *walk, bool is_or_as, bool root_is) {
    if (!is_or_as) return false;
    if (walk->depth || walk->is_later_alternative || walk->root_colons) return true;
    bool owned_type = walk->is_seen || (walk->own_as_seen && !walk->prefix_ordinary);
    return root_is && walk->future_root_question && owned_type;
}

static QuestionWalkStep question_walk_question(TSLexer *lexer, QuestionWalk *walk) {
    if (walk->syntax_only) {
        advance(lexer);
        if (lexer->lookahead == '?') advance(lexer);
        else if (walk->discard_to_question) {
            walk->discard_to_question = false;
            walk->events.size = 0;
            walk->preview_count = 0;
            walk->preview_ready = false;
        }
        return QUESTION_WALK_CONTINUE;
    }
    if (walk->cache_type_uncertain) walk->cache_shaped = false;
    if (walk->depth) walk->suffix.regular = false;
    if (walk->known_nullable || walk->known_ternary) walk->role_active = false;
    advance(lexer);
    if (lexer->lookahead == '?') {
        question_walk_coalescing(lexer, walk);
        return QUESTION_WALK_CONTINUE;
    }
    if (walk->role_active && walk->binding && walk->depth == 1 && walk->groups.size &&
        *array_back(&walk->groups) == '[' && !walk->cache_type_uncertain) {
        int32_t first = question_skip_separators(lexer);
        if (first == '#' || first == -2) return QUESTION_WALK_UNKNOWN;
        if (first != '>' && first != ',' && first != '.' && !question_expression_start(lexer, first)) return QUESTION_WALK_INVALID;
    }
    bool later_nullable = false;
    if (walk->role_active && walk->depth) walk->cache_shaped = false;
    if (walk->role_active && !walk->depth) later_nullable = question_walk_root_question(lexer, walk);
    if (walk->is_as_phase && !later_nullable) walk->is_eligible = false;
    walk->found_next_question = true;
    walk->recording = false;
    return walk->role_active ? QUESTION_WALK_CONTINUE : QUESTION_WALK_STOP;
}

static void question_walk_coalescing(TSLexer *lexer, QuestionWalk *walk) {
    if (!walk->depth) {
        walk->is_name_pending = false;
        walk->as_operand = false;
        walk->allocation_type = false;
        walk->allocation_rank = false;
    }
    if (walk->is_as_phase) walk->is_eligible = false;
    if (!walk->depth && walk->binding && !walk->cache_colon) walk->root_binary = true;
    advance(lexer);
    if (lexer->lookahead == '=') {
        question_walk_assignment_context(walk, false);
        advance(lexer);
    }
}

static bool question_walk_root_question(TSLexer *lexer, QuestionWalk *walk) {
    question_skip_separators(lexer);
    QuestionFollowing following = question_following(lexer);
    walk->is_name_pending = false;
    if (question_walk_nullable_marker(walk, following)) return true;
    walk->future_root_question = true;
    question_walk_access_chain(walk, following);
    walk->allocation_type = false;
    walk->allocation_rank = false;
    bool as_question = walk->as_operand && !following.member &&
        (following.token == '[' || following.token == '(' || following.token == '?' || question_type_boundary(following.token));
    if (as_question && walk->optional == 1) walk->pending_as_role = true;
    if (!as_question) walk->as_operand = false;
    if (following.token == '[') question_suffix_add(&walk->suffix, true);
    else if (!question_suffix_ordinary(following)) walk->suffix.regular = false;
    walk->future_first_token = following.token != '[' && !following.member;
    if (walk->recording && walk->root_colons && walk->binding && !walk->type_operand && !walk->allocation_type && following.token != '[' && !following.member) {
        walk->is_eligible &= !walk->is_seen;
    }
    if (following.token == '.' && !following.member && walk->binding && !walk->cache_colon)
        walk->root_binary = true;
    bool allocation_nullable = walk->allocation_type && (following.token == '[' || following.token == '(');
    bool later_nullable = allocation_nullable || (walk->is_later_alternative &&
        (following.token == '?' || following.token == ':' || question_closing_group(following.token) ||
         following.token == ',' || following.token == ';'));
    if (later_nullable) {
        walk->cache_shaped = false;
        walk->is_as_phase = false;
    }
    else {
        if (!walk->root_colons && following.token != '[' && !following.member) {
            walk->prefix_ordinary = true;
            walk->ordinary_is_seen = walk->is_seen;
            walk->ordinary_optionals = walk->optional;
            walk->typed_ordinary_snapshot = false;
        }
        walk->future_ternary_eligible = walk->is_ternary_eligible;
        question_walk_future_question(walk, following);
    }
    return later_nullable;
}

static QuestionWalkStep question_walk_assignment(TSLexer *lexer, QuestionWalk *walk) {
    advance(lexer);
    if (lexer->lookahead == '=' && walk->ordinary_name_candidate && walk->recording && !walk->depth && !walk->nullable_only) {
        walk->known_ternary = true;
        walk->known_nullable = false;
    }
    walk->ordinary_name_candidate = false;
    if (!walk->depth && walk->binding && !walk->cache_colon && lexer->lookahead == '=') walk->root_binary = true;
    if (lexer->lookahead == '>') {
        walk->suffix.regular = false;
        bool own_argument = !walk->depth && !walk->argument_ended && walk->recording;
        if (own_argument) walk->lambda_boundary = true;
        if (walk->recording) {
            array_push(&walk->events, 'l');
        }
        if (own_argument) {
            if (walk->context_known && !walk->interpolation_depth && walk->following.token == '(')
                walk->known_nullable = true;
            walk->cache_shaped = false;
            walk->role_active = false;
            walk->role_known = false;
            walk->is_eligible = false;
        }
        advance(lexer);
        return QUESTION_WALK_CONTINUE;
    }
    question_walk_assignment_context(walk, lexer->lookahead == '=');
    if (!walk->role_active || !walk->binding || walk->depth != 1) return QUESTION_WALK_CONTINUE;
    int32_t next = question_skip_separators(lexer);
    return question_closing_group(next) || next == ',' || next == ';' ? QUESTION_WALK_UNKNOWN : QUESTION_WALK_CONTINUE;
}

static void question_walk_assignment_context(QuestionWalk *walk, bool comparison) {
    if (!comparison) walk->suffix.regular = false;
    walk->access_chain_value = false;
    if (walk->depth) return;
    walk->as_operand = false;
    walk->is_name_pending = false;
    if (!comparison) walk->assignment_possible = true;
    else if (walk->recording) walk->definite_ternary = walk->ordinary;
}

static void question_walk_record_delimiter(QuestionWalk *walk, int32_t c) {
    if (!walk->recording) return;
    bool invocation = c == '(' && walk->groups.size && *array_back(&walk->groups) == 'p';
    array_push(&walk->events, invocation ? 'p' : (char)c);
}

static QuestionWalkStep question_walk_delimiter(Scanner *scanner, TSLexer *lexer, QuestionWalk *walk, int32_t c) {
    if (c == ';' && walk->role_active && walk->depth > 0 && !walk->brace_depth)
        return walk->nullable_context && question_invalid_binding_has_clause(lexer, walk) ? QUESTION_WALK_UNKNOWN : QUESTION_WALK_INVALID;
    if (c == '{') walk->brace_depth++;
    if (c == '}' && walk->brace_depth) walk->brace_depth--;
    advance(lexer);
    if (!question_walk_operand_group(lexer, walk, c)) return QUESTION_WALK_UNKNOWN;
    if (c == ':' && lexer->lookahead == ':') {
        advance(lexer);
        return QUESTION_WALK_CONTINUE;
    }
    if (walk->role_active && c == ':') question_walk_colon(walk);
    if (walk->entering_binding && c == '[') {
        QuestionWalkStep step = question_walk_enter_binding(scanner, lexer, walk);
        if (step != QUESTION_WALK_CONTINUE) return step;
    }
    if (walk->is_pending_bracket && !walk->depth && c == '[' && !question_walk_enter_pending_binding(lexer, walk))
        return QUESTION_WALK_UNKNOWN;
    question_walk_record_delimiter(walk, c);
    if (question_opening_group(c)) walk->depth++;
    else if (question_closing_group(c)) walk->depth--;
    bool statement_end = c == ';' && walk->depth <= 0;
    if (statement_end || walk->depth < 0) { walk->role_active = false; walk->suffix.boundary = true; }
    bool root_statement_end = statement_end && walk->depth + scanner->question_frame_count <= 1;
    return root_statement_end || (!walk->role_active && !walk->recording) ? QUESTION_WALK_STOP : QUESTION_WALK_CONTINUE;
}

static bool question_walk_enter_pending_binding(TSLexer *lexer, QuestionWalk *walk) {
    int32_t first = question_skip_separators(lexer);
    walk->is_pending_bracket = false;
    if (!walk->depth && !walk->type_operand) walk->binding_chain_depth = 1;
    if (first == '#' || first == -2) return false;
    if (first == ',' && walk->type_operand) {
        do { advance(lexer); } while (question_skip_separators(lexer) == ',');
        if (lexer->lookahead != ']') return false;
        if (walk->optional) walk->optional--;
        return true;
    }
    if (first == ']' && walk->type_operand) {
        walk->type_rank = true;
        return true;
    }
    if (first < 0 || lexer->eof(lexer)) walk->is_eligible = false;
    else if (first != ',') {
        if (walk->is_optional == UINT64_MAX) walk->is_eligible = false;
        else walk->is_optional++;
    }
    return question_binding_start(lexer, first);
}

static bool question_invalid_binding_has_clause(TSLexer *lexer, const QuestionWalk *walk) {
    unsigned brackets = 1;
    while (!lexer->eof(lexer)) {
        int32_t c = lexer->lookahead;
        if (is_line_terminator(c) || c == '"' || c == '\'' || c == '?') return false;
        advance(lexer);
        if (c == '[') brackets++;
        if (c == ']' && --brackets == 0) {
            int32_t next = question_skip_separators(lexer);
            return next == ':' || (next == ',' && walk->access_alternative);
        }
    }
    return false;
}

static bool question_binding_start(TSLexer *lexer, int32_t first) {
    return first == ']' || first == ',' || question_expression_start(lexer, first);
}

static bool question_expression_start(TSLexer *lexer, int32_t first) {
    if (first < 0 || lexer->eof(lexer)) return false;
    if (first == '.') {
        advance(lexer);
        return lexer->lookahead == '.' || (lexer->lookahead >= '0' && lexer->lookahead <= '9');
    }
    return is_id_start(first) || (first >= '0' && first <= '9') ||
        (first > 0 && first < 128 && strchr("(@$'\"[!~+-*&^\\", first));
}

static void question_walk_colon(QuestionWalk *walk) {
    walk->cache_colon = true;
    if (walk->depth) {
        walk->cache_shaped = false;
        return;
    }
    walk->as_operand = false;
    walk->is_name_pending = false;
    walk->later_ordinary_operand = false;
    walk->access_chain_value = false;
    bool first_root_colon = !walk->root_colons && walk->mandatory == 1 && !walk->optional;
    if (walk->ordinary_colon_context && walk->ordinary && (walk->recording || first_root_colon) && !walk->known_nullable) {
        walk->known_ternary = true;
        walk->definite_ternary = true;
    }
    walk->is_as_phase = false;
    if (!walk->future_root_question) walk->typed_ordinary_snapshot = false;
    walk->type_operand = false;
    walk->allocation_type = false;
    walk->allocation_rank = false;
    walk->confirmation_operand = false;
    if (walk->root_colons < 2) walk->root_colons++;
    bool later_obligation = walk->mandatory > walk->is_reserved ||
        walk->optional > (walk->following.token == '[' ? 1u : 0u);
    if (walk->is_eligible && later_obligation)
        walk->is_later_alternative = true;
    if (walk->is_eligible && walk->mandatory == walk->is_reserved) {
        if (walk->is_reserved) walk->is_reserved--;
        else if (walk->is_optional) {
            if (walk->is_optional == 1) walk->is_current_consumed = true;
            walk->is_optional--;
        } else walk->is_eligible = false;
    }
    if (walk->recording) walk->definite_ternary = walk->ordinary;
    walk->no_colons = false;
    if (walk->mandatory) walk->mandatory--;
    else if (walk->optional) {
        question_suffix_colon(&walk->suffix);
        if (walk->optional == 1 && walk->following.token == '[') walk->proved_ternary = true;
        walk->optional--;
    } else walk->role_known = false;
    if (!walk->optional) walk->confirmation_type = false;
    question_walk_complete_colon(walk);
}

static void question_walk_complete_colon(QuestionWalk *walk) {
    if (walk->array_type_boundary) {
        walk->known_nullable = true;
        walk->role_known = false;
        walk->known_ternary = false;
        walk->role_active = false;
        return;
    }
    if (walk->case_boundary && !walk->case_colon_possible && walk->nullable_allowed && !walk->mandatory && walk->following.token == '[' && !walk->access_alternative) walk->role_active = false;
    bool known_ordinary = walk->ordinary && question_walk_role_known(walk) && !walk->nullable_only;
    bool nullable_group = walk->nullable_allowed && walk->following.token == '(' && walk->reserved;
    bool ordinary_complete = known_ordinary && !nullable_group && !walk->optional && walk->mandatory == walk->reserved;
    if (ordinary_complete || ((walk->recording || walk->ordinary) && !walk->mandatory && !walk->optional)) {
        if (walk->case_colon_possible && !walk->case_boundary && !walk->known_ternary) walk->role_known = false;
        if (known_ordinary && question_walk_role_known(walk)) walk->known_ternary = true;
        walk->role_active = false;
    }
    if (question_walk_role_known(walk) && walk->proved_ternary && (!walk->binding || walk->case_boundary)) walk->known_ternary = true;
}

static void question_walk_future_question(QuestionWalk *walk, QuestionFollowing next) {
    if (walk->ordinary_is_seen && (!walk->root_colons || walk->typed_ordinary_snapshot) && walk->prefix_ordinary &&
        walk->optional > walk->ordinary_optionals && next.token == '[') {
        walk->is_eligible = false;
        if (!walk->typed_ordinary_snapshot) walk->own_is_unknown = false;
    }
    if (next.token == '[') walk->is_pending_bracket = true;
    else if (!next.member) walk->is_ternary_eligible = false;
    if (walk->cache_colon || next.token != '[') walk->cache_shaped = false;
    if (question_type_boundary(next.token) || next.token == '?') {
        walk->role_known = false;
        walk->is_eligible = false;
    }
    if (!next.member) walk->confirmation_operand = next.token == '[';
    if (next.token == '[') walk->optional++;
    else if (!next.member) walk->mandatory++;
}

// These spellings need syntactic type/pattern context that this lexical proof does not establish.
static bool question_uncertain_keyword(const QuestionIdentifier *identifier) {
    if (!identifier->keyword || identifier->length >= sizeof(identifier->word)) return false;
    const char *word = identifier->word;
    return !strcmp(word, "where") || !strcmp(word, "class") || !strcmp(word, "operator") ||
        !strcmp(word, "is") || !strcmp(word, "as");
}

static bool question_expression_keyword(const QuestionIdentifier *identifier) {
    if (!identifier->keyword) return false;
    const char *word = identifier->word;
    return !strcmp(word, "true") || !strcmp(word, "false") || !strcmp(word, "null") ||
        !strcmp(word, "new") || !strcmp(word, "base");
}

static void question_walk_pending(QuestionWalk *walk, QuestionFrame *frame, bool proved_access) {
    if (walk->known_nullable || proved_access) return;
    if (walk->known_ternary) {
        if (frame->pending == UINT32_MAX) frame->unknown = true;
        else frame->pending++;
        return;
    }
    bool ordinary_pending = walk->ordinary && walk->definite_ternary && !walk->assignment_possible && !walk->nullable_terminator;
    bool known_access = walk->following.token == '[' && (question_walk_role_known(walk) || walk->cached_access);
    if (ordinary_pending || (known_access && walk->proved_ternary)) {
        if (frame->pending == UINT32_MAX) frame->unknown = true;
        else frame->pending++;
    } else if (!known_access && !walk->following.member) frame->unknown = true;
}




static bool question_walk_interpolation_end(const QuestionWalk *walk, int32_t c) {
    return (c == ':' || c == '}') && walk->interpolation_depth >= 0 &&
        walk->depth + walk->interpolation_depth == 0;
}

static QuestionWalkStep question_walk_end_interpolation(Scanner *scanner, TSLexer *lexer, QuestionWalk *walk) {
    walk->interpolation_end = true;
    bool format = lexer->lookahead == ':';
    advance(lexer);
    if (format && is_regular(question_interpolation(scanner)) &&
        (is_line_terminator(lexer->lookahead) || lexer->eof(lexer))) {
        walk->context_known = false;
        walk->nullable_context = false;
        walk->known_nullable = false;
        walk->is_eligible = false;
        walk->cache_shaped = false;
    }
    if (!walk->interpolation_depth) {
        if (walk->nullable_context)
            walk->known_nullable |= walk->omitted_rank_candidate || walk->nullable_name_candidate || walk->ordinary_name_candidate;
        walk->known_ternary = false;
        walk->proved_ternary = false;
        walk->role_known = walk->context_known;
        walk->own_is_unknown = false;
        walk->role_active = false;
        walk->mandatory = 0;
    }
    return QUESTION_WALK_STOP;
}

static Interpolation *question_interpolation(Scanner *scanner) {
    if (!scanner->interpolation_stack.size) return NULL;
    Interpolation *interpolation = array_back(&scanner->interpolation_stack);
    return interpolation->open_brace_count ? interpolation : NULL;
}

static void interpolation_question_events(Scanner *scanner, const char *events, unsigned count) {
    Interpolation *interpolation = question_interpolation(scanner);
    if (!interpolation || interpolation->question_depth == UINT16_MAX) return;
    int32_t depth = interpolation->question_depth;
    for (unsigned i = 0; i < count; i++) {
        if (events[i] == 'p' || question_opening_group(events[i])) depth++;
        else if (question_closing_group(events[i])) depth--;
        if (depth < 0 || depth >= UINT16_MAX) {
            interpolation->question_depth = UINT16_MAX;
            return;
        }
    }
    interpolation->question_depth = (uint16_t)depth;
}

static void interpolation_question_prefix(TSLexer *lexer, Interpolation *interpolation, uint16_t depth) {
    if (depth == UINT16_MAX) return;
    RankGroups groups = array_new();
    interpolation->question_depth = UINT16_MAX;
    while (!lexer->eof(lexer)) {
        int32_t c = question_skip_separators(lexer);
        if (c == -2 || c == '#' || lexer->eof(lexer)) break;
        if (c == -1) continue;
        if (c == '?') {
            if (question_read_single_question(lexer)) {
                interpolation->question_depth = depth + (uint16_t)groups.size;
                break;
            }
            advance(lexer);
            if (lexer->lookahead == '=') advance(lexer);
            continue;
        }
        if (!depth && !groups.size && (c == ':' || c == '}')) break;
        RankReadStep literal = rank_skip_literal(lexer, c, RANK_BODY_EXPRESSION, NULL, 2 * UINT8_MAX);
        if (literal == RANK_READ_UNKNOWN) break;
        if (literal != RANK_READ_TOKEN || c == '@') continue;
        if (!interpolation_question_group(&groups, &depth, c)) break;
        advance(lexer);
    }
    array_delete(&groups);
}

static bool interpolation_question_group(RankGroups *groups, uint16_t *depth, int32_t c) {
    if (question_opening_group(c)) {
        if (*depth + groups->size == UINT16_MAX - 1) return false;
        array_push(groups, (char)c);
    } else if (question_closing_group(c)) {
        if (!groups->size && *depth) {
            (*depth)--;
            return true;
        }
        char opening = c == ')' ? '(' : c == ']' ? '[' : '{';
        if (!groups->size || *array_back(groups) != opening) return false;
        array_pop(groups);
    }
    return true;
}

static bool question_walk_role_known(const QuestionWalk *walk) { return walk->role_known && !walk->own_is_unknown; }

#endif
