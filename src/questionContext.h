#ifndef TREE_SITTER_C_SHARP_QUESTION_CONTEXT_H_
#define TREE_SITTER_C_SHARP_QUESTION_CONTEXT_H_

static bool question_context_idle(const Scanner *scanner);
static bool question_close_frame(Scanner *scanner, char closing);

static void apply_question_events(Scanner *scanner, const char *events, unsigned count) {
    for (unsigned i = 0; i < count; i++) {
        char c = events[i];
        QuestionFrame *frame = &scanner->question_frames[scanner->question_frame_count - 1];
        if (c == '(' || c == '[' || c == '{') {
            if (scanner->question_frame_count == QUESTION_FRAME_LIMIT) {
                scanner->question_unknown = true; scanner->question_access_cache = 0;
                return;
            }
            scanner->question_frames[scanner->question_frame_count++] = (QuestionFrame){.group = (uint8_t)c};
            continue;
        }
        if (c == ')' || c == ']' || c == '}') {
            if (!question_close_frame(scanner, c)) {
                scanner->question_unknown = true; scanner->question_access_cache = 0;
                return;
            }
            continue;
        }
        if (c == ':' && frame->pending) frame->pending--;
        if (c != ';') continue;
        frame->pending = 0;
        frame->unknown = false;
        if (scanner->question_frame_count == 1) reset_question_context(scanner);
    }
}

static bool question_close_frame(Scanner *scanner, char closing) {
    QuestionFrame *frame = &scanner->question_frames[scanner->question_frame_count - 1];
    bool root = scanner->question_frame_count == 1;
    if (root && question_context_idle(scanner) && !scanner->question_unknown) return true;
    char opening = closing == ')' ? '(' : closing == ']' ? '[' : '{';
    if (root || frame->group != opening) return false;
    scanner->question_frame_count--;
    return true;
}

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
static bool question_skip_raw_quoted(TSLexer *lexer, unsigned count);
static bool question_skip_regular_quoted(TSLexer *lexer, int32_t quote, bool verbatim);

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

static bool question_skip_quoted(TSLexer *lexer, bool verbatim) {
    int32_t quote = lexer->lookahead;
    advance(lexer);
    unsigned count = 1;
    if (!verbatim && quote == '"') {
        while (lexer->lookahead == '"') { count++; advance(lexer); }
        if (count == 2) return true;
    }
    if (count >= 3) return question_skip_raw_quoted(lexer, count);
    return question_skip_regular_quoted(lexer, quote, verbatim);
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

static bool question_skip_raw_quoted(TSLexer *lexer, unsigned count) {
    unsigned closing = 0;
    while (!lexer->eof(lexer)) {
        if (lexer->lookahead == '"') closing++; else closing = 0;
        advance(lexer);
        if (closing == count) return lexer->lookahead != '"';
    }
    return false;
}

static bool question_skip_regular_quoted(TSLexer *lexer, int32_t quote, bool verbatim) {
    while (!lexer->eof(lexer)) {
        int32_t c = lexer->lookahead;
        advance(lexer);
        if (c == quote) {
            if (!verbatim || lexer->lookahead != quote) return true;
            advance(lexer);
            continue;
        }
        if (c == '\\' && !verbatim) {
            if (lexer->eof(lexer)) return false;
            advance(lexer);
            continue;
        }
        if (!verbatim && is_line_terminator(c)) return false;
    }
    return false;
}

#include "nullableRank.h"

typedef enum {
    QUESTION_EXPRESSION_RECEIVER = 1,
    QUESTION_CASE_COLON = 2,
    QUESTION_NULLABLE_ONLY = 4,
} QuestionContextFlags;

typedef struct {
    QuestionFollowing following;
    uint32_t cached_count;
    uint32_t reserved;
    uint64_t mandatory;
    uint64_t optional;
    uint64_t is_optional;
    uint64_t is_reserved;
    bool is_eligible;
    bool is_ternary_eligible;
    bool is_seen;
    bool is_as_phase;
    bool is_current_consumed;
    bool is_pending_bracket;
    int depth;
    uint8_t root_colons;
    bool root_binary;
    bool cached_access;
    bool binding;
    bool entering_binding;
    bool nullable_only;
    bool role_known;
    bool proved_ternary;
    bool no_colons;
    bool cache_shaped;
    bool cache_colon;
    bool role_active;
    bool case_colon_possible;
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
    bool ordinary_name_candidate;
    bool found_next_question;
    Array(char) events;
} QuestionWalk;

typedef enum { QUESTION_WALK_CONTINUE, QUESTION_WALK_STOP, QUESTION_WALK_UNKNOWN } QuestionWalkStep;

static QuestionWalk question_walk_create(Scanner *scanner, QuestionFollowing following, bool known_nullable, unsigned context_flags, uint8_t rank_phase);
static QuestionWalkStep question_walk_step(Scanner *scanner, TSLexer *lexer, QuestionWalk *walk, int32_t c);
static bool question_walk_binding_operator(TSLexer *lexer, QuestionWalk *walk, int32_t c);
static unsigned question_walk_finish(Scanner *scanner, TSLexer *lexer, QuestionWalk *walk);
static bool question_type_boundary(int32_t c);
static bool question_opening_group(int32_t c);
static bool question_closing_group(int32_t c);
static bool question_operator(int32_t c);
static QuestionWalkStep question_walk_literal(TSLexer *lexer, QuestionWalk *walk, int32_t c, bool first_identifier);
static QuestionWalkStep question_walk_identifier(Scanner *scanner, TSLexer *lexer, QuestionWalk *walk, bool first_identifier);
static void question_walk_keyword_context(Scanner *scanner, QuestionWalk *walk, const QuestionIdentifier *identifier, bool is_or_as);
static QuestionWalkStep question_walk_question(TSLexer *lexer, QuestionWalk *walk);
static QuestionWalkStep question_walk_assignment(TSLexer *lexer, QuestionWalk *walk);
static QuestionWalkStep question_walk_delimiter(Scanner *scanner, TSLexer *lexer, QuestionWalk *walk, int32_t c);
static void question_walk_enter_binding(Scanner *scanner, TSLexer *lexer, QuestionWalk *walk);
static void question_walk_colon(QuestionWalk *walk);
static void question_walk_future_question(QuestionWalk *walk, QuestionFollowing next);
static bool question_uncertain_keyword(const QuestionIdentifier *identifier);
static bool question_expression_keyword(const QuestionIdentifier *identifier);
static void question_walk_pending(QuestionWalk *walk, QuestionFrame *frame, bool proved_access);
static void question_walk_cache(Scanner *scanner, const QuestionWalk *walk);

// Role proof may read farther, but only events before the next question prepare its saved context.
static unsigned prepare_question_context(Scanner *scanner, TSLexer *lexer, QuestionFollowing following, bool *known_nullable, unsigned context_flags, uint8_t rank_phase, bool *known_ternary) {
    QuestionWalk walk = question_walk_create(scanner, following, *known_nullable, context_flags, rank_phase);
    unsigned result = 0;
    while (!lexer->eof(lexer)) {
        int32_t c = question_skip_separators(lexer);
        if (c == -2) goto unknown;
        if (lexer->eof(lexer)) break;
        QuestionWalkStep step = question_walk_step(scanner, lexer, &walk, c);
        if (step == QUESTION_WALK_UNKNOWN) goto unknown;
        if (step == QUESTION_WALK_STOP) break;
    }
    result = question_walk_finish(scanner, lexer, &walk);
    *known_nullable = walk.known_nullable;
    if (walk.known_nullable && rank_phase == RANK_NULLABLE_NEXT && !scanner->question_unknown &&
        !scanner->question_frames[scanner->question_frame_count - 1].unknown)
        scanner->question_rank_role = RANK_AFTER_NULLABLE;
    *known_ternary = walk.known_ternary;
    array_delete(&walk.events);
    return result;
unknown:
    scanner->question_unknown = true;
    scanner->question_access_cache = 0;
    array_delete(&walk.events);
    *known_nullable = walk.known_nullable;
    *known_ternary = walk.known_ternary;
    return walk.known_ternary ? 2 : 0;
}

static QuestionWalk question_walk_create(Scanner *scanner, QuestionFollowing following, bool known_nullable, unsigned context_flags, uint8_t rank_phase) {
    const QuestionFrame *frame = &scanner->question_frames[scanner->question_frame_count - 1];
    bool known = !scanner->question_unknown && (!scanner->question_type_uncertain || (context_flags & QUESTION_EXPRESSION_RECEIVER)) && !frame->unknown;
    bool ternary_only = rank_phase == RANK_PATTERN_COMPLETE;
    bool cached = scanner->question_access_cache && following.token == '[' && known && !ternary_only;
    bool ordinary = following.token != '[' && !following.member;
    bool definite_ternary = ternary_only || (ordinary && !known_nullable && following.token >= '0' && following.token <= '9');
    QuestionWalk walk = {
        .following = following,
        .cached_count = scanner->question_access_cache,
        .reserved = frame->pending,
        .mandatory = (uint64_t)frame->pending + ordinary,
        .optional = following.token == '[',
        .is_optional = following.token == '[',
        .is_reserved = frame->pending,
        .is_eligible = known && following.token == '[' && !cached,
        .is_ternary_eligible = true,
        .cached_access = cached,
        .entering_binding = following.token == '[',
        .nullable_only = context_flags & QUESTION_NULLABLE_ONLY,
        .role_known = known,
        .no_colons = true,
        .cache_shaped = following.token == '[' && !cached && !ternary_only,
        .role_active = !following.member && !cached && !known_nullable && !definite_ternary,
        .case_colon_possible = context_flags & QUESTION_CASE_COLON,
        .recording = true,
        .ordinary = ordinary,
        .known_nullable = known_nullable,
        .known_ternary = definite_ternary,
        .rank_phase = rank_phase,
        .nullable_terminator = question_type_boundary(following.token) || following.token == '}',
        .definite_ternary = definite_ternary,
        .first_word = true,
        .ordinary_first_token = ordinary && following.token != '/',
    };
    scanner->question_access_cache = 0;
    return walk;
}

static QuestionWalkStep question_walk_step(Scanner *scanner, TSLexer *lexer, QuestionWalk *walk, int32_t c) {
    bool first_identifier = walk->ordinary_first_token;
    if (c == '?' && walk->ordinary_name_candidate && walk->recording && !walk->depth) {
        walk->known_ternary = true;
        walk->known_nullable = false;
        walk->definite_ternary = true;
    }
    walk->ordinary_first_token = false;
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
    if (is_id_start(c) || c == '\\') return question_walk_identifier(scanner, lexer, walk, first_identifier);
    if (c == '?') return question_walk_question(lexer, walk);
    if (c == '=') return question_walk_assignment(lexer, walk);
    if (walk->recording && !walk->depth && walk->ordinary && question_operator(c)) walk->definite_ternary = true;
    if (c == ':' || c == ';' || question_opening_group(c) || question_closing_group(c))
        return question_walk_delimiter(scanner, lexer, walk, c);
    if (c == ',' && !walk->depth) {
        walk->is_eligible = false;
        walk->role_active = false;
        if (!walk->recording) return QUESTION_WALK_STOP;
    }
    advance(lexer);
    return QUESTION_WALK_CONTINUE;
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
    if (walk->mandatory && !walk->cached_access) walk->role_known = false;
    unsigned role = 0;
    if (walk->known_ternary || (walk->role_known && walk->proved_ternary)) role = 2;
    else if (walk->binding) {
        if (walk->cached_access || walk->role_known) role = 1;
        else {
            bool complete = !walk->role_active || lexer->eof(lexer);
            bool is_proved = walk->is_eligible && walk->is_seen &&
                !walk->is_reserved && !walk->is_pending_bracket && complete;
            bool is_access = is_proved && !walk->is_current_consumed;
            if (lexer->log) lexer->log(lexer, "is_access_proof eligible=%d seen=%d consumed=%d reserved=%llu optional=%llu complete=%d result=%d", walk->is_eligible, walk->is_seen, walk->is_current_consumed, (unsigned long long)walk->is_reserved, (unsigned long long)walk->is_optional, complete, is_access);
            if (is_access || (is_proved && walk->is_ternary_eligible)) {
                walk->known_ternary = walk->is_current_consumed;
                role = walk->known_ternary ? 2 : 3;
            }
        }
    }
    question_walk_pending(walk, frame, role == 1 || role == 3);
    apply_question_events(scanner, walk->events.contents, walk->events.size);
    if (!walk->found_next_question && question_context_idle(scanner)) reset_question_context(scanner);
    question_walk_cache(scanner, walk);
    return role;
}

static bool question_type_boundary(int32_t c) {
    return c == '>' || c == ',' || c == ')' || c == ']' || c == ';' || c == '=' || c == ':' || c == '*';
}

static bool question_opening_group(int32_t c) { return c == '(' || c == '[' || c == '{'; }
static bool question_closing_group(int32_t c) { return c == ')' || c == ']' || c == '}'; }
static bool question_operator(int32_t c) {
    return c == '+' || c == '-' || c == '/' || c == '%' || c == '&' || c == '|' || c == '^' || c == '!' || c == '~';
}

static QuestionWalkStep question_walk_literal(TSLexer *lexer, QuestionWalk *walk, int32_t c, bool first_identifier) {
    bool verbatim = c == '@';
    if (verbatim) {
        advance(lexer);
        if (lexer->lookahead != '"' && lexer->lookahead != '$') {
            QuestionIdentifier identifier;
            if (!question_identifier(lexer, true, &identifier)) return QUESTION_WALK_UNKNOWN;
            walk->ordinary_name_candidate = first_identifier && walk->recording && !walk->depth && walk->ordinary;
            if (walk->recording) walk->first_word = false;
            return QUESTION_WALK_CONTINUE;
        }
    }
    if (walk->recording && walk->first_word && walk->ordinary) walk->definite_ternary = true;
    bool valid = lexer->lookahead == '$'
        ? rank_skip_interpolated(lexer, verbatim, RANK_BODY_QUESTION_FREE, NULL)
        : question_skip_quoted(lexer, verbatim);
    return valid ? QUESTION_WALK_CONTINUE : QUESTION_WALK_UNKNOWN;
}

static QuestionWalkStep question_walk_identifier(Scanner *scanner, TSLexer *lexer, QuestionWalk *walk, bool first_identifier) {
    QuestionIdentifier identifier;
    if (!question_identifier(lexer, false, &identifier)) return QUESTION_WALK_UNKNOWN;
    if (identifier.keyword && (strcmp(identifier.word, "new") == 0 || strcmp(identifier.word, "delegate") == 0 ||
        strcmp(identifier.word, "stackalloc") == 0 || strcmp(identifier.word, "from") == 0)) walk->is_eligible = false;
    bool is_or_as = identifier.keyword && (strcmp(identifier.word, "is") == 0 || strcmp(identifier.word, "as") == 0);
    if (walk->ordinary_name_candidate && walk->recording && !walk->depth && is_or_as) walk->definite_ternary = true;
    walk->ordinary_name_candidate = first_identifier && walk->recording && !walk->depth && walk->ordinary;
    if (question_uncertain_keyword(&identifier)) question_walk_keyword_context(scanner, walk, &identifier, is_or_as);
    if (question_expression_keyword(&identifier) && walk->recording && walk->first_word && walk->ordinary)
        walk->definite_ternary = true;
    if (walk->recording) walk->first_word = false;
    return QUESTION_WALK_CONTINUE;
}

static void question_walk_keyword_context(Scanner *scanner, QuestionWalk *walk, const QuestionIdentifier *identifier, bool is_or_as) {
        bool is_keyword = !strcmp(identifier->word, "is");
        if (is_keyword) {
            if (walk->is_seen) walk->is_eligible = false;
            if (!walk->depth) walk->is_seen = true;
            else walk->is_eligible = false;
        } else if (is_or_as && !walk->depth && !walk->recording && walk->is_seen) {
            walk->is_as_phase = true;
        } else {
            walk->is_eligible = false;
        }
        if (is_or_as) {
            if (walk->recording) scanner->question_type_uncertain = true;
        } else {
            scanner->question_unknown = true;
        }
        scanner->question_access_cache = 0;
        walk->role_known = false;
 }

static QuestionWalkStep question_walk_question(TSLexer *lexer, QuestionWalk *walk) {
    if (walk->known_nullable || walk->known_ternary) walk->role_active = false;
    if (walk->is_as_phase) walk->is_eligible = false;
    advance(lexer);
    if (lexer->lookahead == '?') {
        if (!walk->depth && walk->binding && !walk->cache_colon) walk->root_binary = true;
        advance(lexer);
        if (lexer->lookahead == '=') advance(lexer);
        return QUESTION_WALK_CONTINUE;
    }
    if (walk->role_active && walk->depth) walk->cache_shaped = false;
    if (walk->role_active && !walk->depth) {
        question_skip_separators(lexer);
        QuestionFollowing following = question_following(lexer);
        if (walk->recording && walk->root_colons && walk->binding && following.token != '[' && !following.member) {
            walk->role_active = false;
            walk->role_known = false;
            walk->is_eligible = false;
        }
        if (following.token == '.' && !following.member && walk->binding && !walk->cache_colon)
            walk->root_binary = true;
        question_walk_future_question(walk, following);
    }
    walk->found_next_question = true;
    walk->recording = false;
    return walk->role_active ? QUESTION_WALK_CONTINUE : QUESTION_WALK_STOP;
}

static QuestionWalkStep question_walk_assignment(TSLexer *lexer, QuestionWalk *walk) {
    advance(lexer);
    if (!walk->depth && walk->binding && !walk->cache_colon && lexer->lookahead == '=') walk->root_binary = true;
    if (lexer->lookahead == '>') {
        if (!walk->depth) return QUESTION_WALK_UNKNOWN;
        advance(lexer);
        return QUESTION_WALK_CONTINUE;
    }
    if (!walk->depth && walk->recording) {
        if (lexer->lookahead == '=') walk->definite_ternary = walk->ordinary;
        else walk->assignment_possible = true;
    }
    return QUESTION_WALK_CONTINUE;
}

static QuestionWalkStep question_walk_delimiter(Scanner *scanner, TSLexer *lexer, QuestionWalk *walk, int32_t c) {
    advance(lexer);
    if (c == ':' && lexer->lookahead == ':') {
        advance(lexer);
        return QUESTION_WALK_CONTINUE;
    }
    if (walk->role_active && c == ':') question_walk_colon(walk);
    if (walk->entering_binding && c == '[') question_walk_enter_binding(scanner, lexer, walk);
    if (walk->is_pending_bracket && !walk->depth && c == '[') {
        int32_t first = question_skip_separators(lexer);
        walk->is_pending_bracket = false;
        if (first == -2) return QUESTION_WALK_UNKNOWN;
        if (first < 0 || lexer->eof(lexer)) walk->is_eligible = false;
        else if (first != ',') {
            if (walk->is_optional == UINT64_MAX) walk->is_eligible = false;
            else walk->is_optional++;
        }
    }
    if (walk->recording) array_push(&walk->events, (char)c);
    if (question_opening_group(c)) walk->depth++;
    else if (question_closing_group(c)) walk->depth--;
    bool statement_end = c == ';' && walk->depth <= 0;
    if (statement_end || walk->depth < 0) walk->role_active = false;
    bool root_statement_end = statement_end && walk->depth + scanner->question_frame_count <= 1;
    return root_statement_end || (!walk->role_active && !walk->recording) ? QUESTION_WALK_STOP : QUESTION_WALK_CONTINUE;
}

static void question_walk_enter_binding(Scanner *scanner, TSLexer *lexer, QuestionWalk *walk) {
        int32_t first = question_skip_separators(lexer);
        walk->binding = first >= 0 && first != ']' && first != ',' && !lexer->eof(lexer);
        bool first_rank = walk->rank_phase == RANK_NULLABLE_LAST || walk->rank_phase == RANK_NULLABLE_NEXT ||
            walk->rank_phase == RANK_TERNARY;
        bool nullable_rank = walk->rank_phase == RANK_NULLABLE_LAST || walk->rank_phase == RANK_NULLABLE_NEXT;
        if ((first_rank && first == ']') || (nullable_rank && first == ',') ||
            (walk->rank_phase == RANK_TERNARY && walk->binding) ||
            (walk->rank_phase == RANK_AFTER_NULLABLE && (walk->binding || first == ']'))) {
            walk->known_nullable = walk->rank_phase == RANK_NULLABLE_LAST || walk->rank_phase == RANK_NULLABLE_NEXT;
            walk->known_ternary = !walk->known_nullable;
            if (walk->known_ternary) scanner->question_type_uncertain = false;
        }
        if (walk->nullable_only && !walk->known_ternary && (first == ']' || first == ',')) {
            walk->known_nullable = true;
            walk->role_active = false;
        }
        if (!walk->binding && !walk->role_known) walk->role_active = false;
        walk->rank_phase = RANK_NONE;
        walk->entering_binding = false;
}

static void question_walk_colon(QuestionWalk *walk) {
    walk->cache_colon = true;
    if (walk->depth) {
        walk->cache_shaped = false;
        return;
    }
    walk->is_as_phase = false;
    if (walk->root_colons < 2) walk->root_colons++;
    if (walk->is_eligible) {
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
        if (walk->optional == 1 && walk->following.token == '[') walk->proved_ternary = true;
        walk->optional--;
    } else walk->role_known = false;
    if (walk->recording && !walk->mandatory && !walk->optional) {
        if (walk->case_colon_possible && !walk->known_ternary) walk->role_known = false;
        walk->role_active = false;
    }
    if (walk->role_known && walk->proved_ternary) walk->known_ternary = true;
}

static void question_walk_future_question(QuestionWalk *walk, QuestionFollowing next) {
    if (next.token == '[') walk->is_pending_bracket = true;
    else if (!next.member) walk->is_ternary_eligible = false;
    if (walk->cache_colon || next.token != '[') walk->cache_shaped = false;
    if (question_type_boundary(next.token)) walk->role_known = false;
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

static bool question_context_idle(const Scanner *scanner) {
    return scanner->question_frame_count == 1 && !scanner->question_frames[0].pending &&
        !scanner->question_frames[0].unknown;
}

static void question_walk_pending(QuestionWalk *walk, QuestionFrame *frame, bool proved_access) {
    if (walk->known_nullable || proved_access) return;
    if (walk->known_ternary) {
        if (frame->pending == UINT32_MAX) frame->unknown = true;
        else frame->pending++;
        return;
    }
    bool ordinary_pending = walk->ordinary && walk->definite_ternary && !walk->assignment_possible && !walk->nullable_terminator;
    bool known_access = walk->following.token == '[' && (walk->role_known || walk->cached_access);
    if (ordinary_pending || (known_access && walk->proved_ternary)) {
        if (frame->pending == UINT32_MAX) frame->unknown = true;
        else frame->pending++;
    } else if (!known_access && !walk->following.member) frame->unknown = true;
}

static void question_walk_cache(Scanner *scanner, const QuestionWalk *walk) {
    if (walk->cached_access) {
        scanner->question_access_cache = walk->cached_count - 1;
        return;
    }
    // In an A+ then colon* stream, unmatched optional questions are exactly the leading access prefix.
    bool reusable = walk->binding && walk->cache_shaped && walk->role_known && !walk->proved_ternary;
    if (reusable && walk->optional > 1 && walk->optional - 1 <= UINT32_MAX)
        scanner->question_access_cache = (uint32_t)(walk->optional - 1);
}



#endif
