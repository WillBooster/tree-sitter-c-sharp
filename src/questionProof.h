#ifndef TREE_SITTER_C_SHARP_QUESTION_PROOF_H_
#define TREE_SITTER_C_SHARP_QUESTION_PROOF_H_

static QuestionWalkStep question_walk_read(Scanner *, TSLexer *, QuestionWalk *, bool);
static bool question_prepare_guard(Scanner *, TSLexer *);
static bool question_guard_colon(TSLexer *, QuestionInput *);
static enum TokenType question_access_symbol(const bool *, const QuestionFollowing *);

// Role proof may read farther, but only events before the next question prepare its saved context.
static unsigned prepare_question_context(Scanner *scanner, TSLexer *lexer, QuestionFollowing following, bool *known_nullable, unsigned context_flags, uint8_t rank_phase, bool *known_ternary) {
    QuestionInput input = question_input_create(lexer);
    lexer = &input.lexer;
    QuestionWalk walk = question_walk_create(scanner, following, *known_nullable, context_flags, rank_phase);
    walk.input = &input;
    walk.scanner = scanner;
    if (walk.case_boundary && walk.nullable_allowed && !walk.known_ternary &&
        question_type_binary_follower(lexer, &input, following)) {
        walk.known_nullable = true;
        walk.known_ternary = false;
        walk.role_active = false;
    }
    Interpolation *interpolation = question_interpolation(scanner);
    unsigned result = 0;
    QuestionWalkStep step = question_walk_read(scanner, lexer, &walk, false);
    if (step == QUESTION_WALK_INVALID) { result = QUESTION_ROLE_INVALID; goto unknown; }
    if (step == QUESTION_WALK_UNKNOWN) goto unknown;
    interpolation_question_events(scanner, walk.events.contents, walk.events.size);
    if (interpolation && !walk.found_next_question && !walk.interpolation_end)
        interpolation_question_prefix(lexer, interpolation, interpolation->question_depth);
    result = question_walk_finish(scanner, lexer, &walk);
    *known_nullable = walk.known_nullable;
    if (walk.known_nullable && rank_phase == RANK_NULLABLE_NEXT && !scanner->question_unknown &&
        !scanner->question_frames[scanner->question_frame_count - 1].unknown)
        scanner->question_rank_role = RANK_AFTER_NULLABLE;
    if (walk.proven_nullable_questions) {
        scanner->question_rank_role = RANK_NULLABLE_PREFIX;
        scanner->question_rank_prefix_questions = walk.proven_nullable_questions;
    }
    *known_ternary = walk.known_ternary;
    question_walk_dispose(&walk);
    array_delete(&input.characters);
    return result;
unknown:
    question_clear_access_cache(scanner);
    if (interpolation) interpolation->question_depth = UINT16_MAX;
    scanner->question_unknown = true;
    question_walk_dispose(&walk);
    array_delete(&input.characters);
    *known_nullable = walk.known_nullable;
    *known_ternary = walk.known_ternary;
    return result ? result : walk.known_ternary ? 2 : 0;
}


static QuestionScanResult scan_case_guard_when(Scanner *scanner, TSLexer *lexer) {
    while (is_space_but_line_feed(lexer->lookahead) || is_line_terminator(lexer->lookahead)) skip(lexer);
    if (lexer->lookahead != 'w') return QUESTION_NOT_STARTED;
    QuestionIdentifier word;
    if (!question_identifier(lexer, false, &word) || !word.keyword || strcmp(word.word, "when")) return QUESTION_MISMATCHED;
    Scanner guard;
    question_scope_init(&guard, scanner);
    QuestionFrame *frame = &guard.question_frames[guard.question_frame_count - 1];
    *frame = (QuestionFrame){.group = frame->group, .case_colon = true, .case_guard = true};
    guard.question_unknown = false;
    guard.question_type_uncertain = false;
    guard.ternary_confirmation.valid = false;
    question_clear_access_cache(&guard);
    clear_question_rank(&guard);
    lexer->mark_end(lexer);
    if (question_prepare_guard(&guard, lexer)) {
        array_delete(&scanner->interpolation_stack);
        *scanner = guard;
    } else array_delete(&guard.interpolation_stack);
    lexer->result_symbol = CASE_GUARD_WHEN;
    return QUESTION_MATCHED;
}

static bool question_prepare_guard(Scanner *scanner, TSLexer *lexer) {
    QuestionInput input = question_input_create(lexer);
    QuestionWalk walk = question_walk_create(scanner, (QuestionFollowing){0}, true, 0, RANK_NONE);
    walk.input = &input;
    walk.scanner = scanner;
    walk.role_active = false;
    walk.ordinary = false;
    walk.ordinary_first_token = false;
    walk.first_word = false;
    QuestionWalkStep step = question_walk_read(scanner, &input.lexer, &walk, true);
    bool known = step != QUESTION_WALK_INVALID && step != QUESTION_WALK_UNKNOWN;
    interpolation_question_events(scanner, walk.events.contents, walk.events.size);
    apply_question_events(scanner, walk.events.contents, walk.events.size);
    scanner->question_unknown |= !known;
    bool found = known && walk.found_next_question;
    question_walk_dispose(&walk);
    array_delete(&input.characters);
    return found;
}

static QuestionWalkStep question_walk_read(Scanner *scanner, TSLexer *lexer, QuestionWalk *walk, bool prefix) {
    while (!lexer->eof(lexer)) {
        int32_t c = question_skip_separators(lexer);
        if (c == -2) return QUESTION_WALK_UNKNOWN;
        if (lexer->eof(lexer)) break;
        if (prefix && !walk->depth && c == ':' && question_guard_colon(lexer, walk->input)) break;
        QuestionWalkStep step = question_walk_step(scanner, lexer, walk, c);
        walk->previous_token = walk->consumed_token ? walk->consumed_token : c;
        walk->consumed_token = 0;
        if (step != QUESTION_WALK_CONTINUE) return step;
        if (prefix && walk->found_next_question) break;
    }
    return QUESTION_WALK_STOP;
}

static bool question_guard_colon(TSLexer *lexer, QuestionInput *input) {
    QuestionCheckpoint start = question_input_checkpoint(input);
    advance(lexer);
    bool boundary = lexer->lookahead != ':';
    question_input_restore(input, start);
    return boundary;
}

static QuestionScanResult select_question_symbol(TSLexer *lexer, const bool *valid_symbols, const QuestionFollowing *next, unsigned role, bool known_nullable, bool known_ternary) {
    if (role == QUESTION_ROLE_INVALID) return QUESTION_MISMATCHED;
    enum TokenType symbol;
    if (known_nullable) {
        symbol = QUESTION_NULLABLE;
    } else if (role == 2) {
        bool nullable_fallback = !known_ternary && (!valid_symbols[QUESTION_TERNARY] || valid_symbols[CASE_LABEL_COLON]);
        symbol = nullable_fallback ? QUESTION_NULLABLE : QUESTION_TERNARY;
    } else if (role == 1 || role == 3) {
        symbol = question_access_symbol(valid_symbols, next);
    } else if (!role) {
        symbol = QUESTION_UNKNOWN;
    } else return QUESTION_MISMATCHED;
    if (!valid_symbols[symbol]) return QUESTION_MISMATCHED;
    lexer->result_symbol = symbol;
    return QUESTION_MATCHED;
}

static enum TokenType question_access_symbol(const bool *valid_symbols, const QuestionFollowing *next) {
    if (next->token == '[' && valid_symbols[QUESTION_NULLABLE] && valid_symbols[QUESTION_UNKNOWN]) return QUESTION_UNKNOWN;
    if ((next->member || next->token == '[') && valid_symbols[QUESTION_DEFINITE_ACCESS]) return QUESTION_DEFINITE_ACCESS;
    if (next->member && valid_symbols[QUESTION_MEMBER_ACCESS]) return QUESTION_MEMBER_ACCESS;
    if (next->token == '[' && valid_symbols[QUESTION_ELEMENT_ACCESS]) return QUESTION_ELEMENT_ACCESS;
    return QUESTION_NULLABLE;
}

#endif
