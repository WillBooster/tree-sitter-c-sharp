#ifndef TREE_SITTER_C_SHARP_QUESTION_PROOF_H_
#define TREE_SITTER_C_SHARP_QUESTION_PROOF_H_

static QuestionWalkStep question_walk_read(Scanner *, TSLexer *, QuestionWalk *, bool);
static bool question_prepare_guard(Scanner *, TSLexer *);
static bool question_prepare_prefix(Scanner *, QuestionInput *, bool);
static void question_save_type_handoff(Scanner *, const QuestionWalk *);
static uint8_t question_guard_take(QuestionFrame *, uint32_t, uint32_t *);
static uint8_t question_guard_save(QuestionFrame *, RankParse *, bool);
static uint8_t question_guard_rank_successor(uint8_t, bool, uint32_t, uint32_t *);
static bool question_guard_suffix(TSLexer *, Scanner *, QuestionInput *, uint32_t *);
static bool question_guard_type_operator_follows(TSLexer *, QuestionInput *);
static bool question_guard_high_binary(TSLexer *, QuestionInput *);
static bool question_guard_binary_follows(TSLexer *, QuestionInput *);
static unsigned question_guard_empty_prefix(const RankTokens *);
static bool question_guard_logical_collection(TSLexer *, QuestionInput *);
static uint8_t question_guard_rank_role(TSLexer *, Scanner *, uint32_t *, QuestionInput *);
static bool question_guard_nullable_question(TSLexer *, QuestionInput *, uint32_t *);
static bool rank_guard_designation(TSLexer *, uint32_t *, QuestionInput *);
static bool question_guard_scalar_question(TSLexer *, QuestionInput *);
static QuestionCheckpoint question_guard_type_start(QuestionInput *);
static bool question_input_multi_rank(const QuestionInput *, uint32_t);
static bool question_assignment_follows(TSLexer *, QuestionInput *);
static bool rank_read_designation(TSLexer *, uint32_t *, QuestionInput *, bool *);
static bool question_guard_suffix_complete(TSLexer *, Scanner *, QuestionInput *, uint32_t);
static void question_save_allocation_prefix(Scanner *, const QuestionWalk *);
static bool question_guard_colon(TSLexer *, QuestionInput *);
static enum TokenType question_access_symbol(const bool *, const QuestionFollowing *);

// Role proof may read farther, but only events before the next question prepare its saved context.
static unsigned prepare_question_context(Scanner *scanner, TSLexer *lexer, QuestionFollowing following, bool *known_nullable, unsigned context_flags, uint8_t rank_phase, bool *known_ternary) {
    QuestionInput input = question_input_create(lexer);
    lexer = &input.lexer;
    if (!*known_nullable && !following.member && scanner->question_type_uncertain && (context_flags & QUESTION_NULLABLE_ALLOWED))
        *known_nullable = question_nullable_designation(lexer, &input);
    QuestionWalk walk = question_walk_create(scanner, following, *known_nullable, context_flags, rank_phase);
    walk.input = &input;
    walk.scanner = scanner;
    if (walk.case_boundary && walk.nullable_allowed && !walk.known_ternary &&
        question_type_operator_follower(lexer, &input, following)) {
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
    bool nullable_successor = rank_phase == RANK_NULLABLE_NEXT ||
        (walk.owned_type_prefix && walk.case_boundary && following.token == '?' && !scanner->question_rank_prefix_questions);
    if (walk.known_nullable && nullable_successor && !scanner->question_unknown &&
        !scanner->question_frames[scanner->question_frame_count - 1].unknown)
        scanner->question_rank_role = RANK_AFTER_NULLABLE;
    if (walk.proven_nullable_questions) {
        scanner->question_rank_role = RANK_NULLABLE_PREFIX;
        scanner->question_rank_prefix_questions = walk.proven_nullable_questions;
    }
    *known_ternary = walk.known_ternary;
    question_save_allocation_prefix(scanner, &walk);
    question_save_type_handoff(scanner, &walk);
    question_walk_dispose(&walk);
    array_delete(&input.characters);
    return result;
unknown:
    question_clear_access_cache(scanner);
    if (interpolation) interpolation->question_depth = UINT16_MAX;
    scanner->question_unknown = true;
    question_clear_rank_from(scanner, 0);
    question_walk_dispose(&walk);
    array_delete(&input.characters);
    *known_nullable = walk.known_nullable;
    *known_ternary = walk.known_ternary;
    return result ? result : walk.known_ternary ? 2 : 0;
}


static bool question_guard_statement_start(const QuestionIdentifier *word) {
    static const char *const statements[] = {"break", "continue", "return", "goto", "if", "for", "foreach", "while", "do", "try", "lock", "using", "fixed", "unsafe", "case"};
    return word->keyword && question_word_in(word->word, statements, sizeof(statements) / sizeof(statements[0]));
}

typedef struct {
    QuestionInput *input;
    RankTokens *tail;
    uint32_t pending;
    unsigned scanned, mandatory, colons;
} QuestionGuardRead;

typedef struct { unsigned successor; bool first, colon, concrete; } QuestionGuardPreference;

static RankParse question_guard_evaluate(const RankTokens *, unsigned, uint32_t, bool, QuestionGuardPreference *);

static bool question_guard_complete_prefix(QuestionGuardRead *guard) {
    RankTokens *tail = guard->tail;
    for (; guard->scanned < tail->size; guard->scanned++) {
        unsigned i = guard->scanned;
        RankToken token = tail->contents[i];
        if (token.kind == RANK_COLON) guard->colons++;
        bool type = i && (tail->contents[i - 1].kind == RANK_IS_TYPE || tail->contents[i - 1].kind == RANK_DEFINITE_TYPE);
        if (token.kind == RANK_QUESTION && (tail->suffix_modes ? !type : (!token.collection || (i &&
            tail->contents[i - 1].guard_candidate && tail->contents[i - 1].kind == RANK_IS_TYPE))))
            guard->mandatory++;
    }
    if ((uint64_t)guard->colons < (uint64_t)guard->pending + guard->mandatory + (tail->suffix_modes ? 1 : 2) ||
        !tail->size || tail->contents[tail->size - 1].kind != RANK_COLON) return false;
    RankParse parsed = question_guard_evaluate(tail, tail->size - 1, guard->pending, false, NULL);
    if (!tail->suffix_modes) return parsed.valid && parsed.types.runs == 1 && parsed.types.first == GUARD_TERNARY;
    unsigned prefix = 0;
    for (unsigned i = 0; i + 2 < tail->size && tail->contents[i].kind == RANK_IS_TYPE &&
        tail->contents[i].guard_candidate; i += 3) prefix++;
    return parsed.valid && !(parsed.suffix_flags & RANK_SUFFIX_INVALID) &&
        parsed.end == (uint64_t)guard->pending * 2 + 2 + tail->size &&
        parsed.types.first == GUARD_NULLABLE && parsed.types.prefix > prefix;
}

static bool question_guard_assignment(TSLexer *lexer) {
    if (lexer->lookahead != '=') return false;
    advance(lexer);
    return lexer->lookahead != '=' && lexer->lookahead != '>';
}

static bool question_guard_stream_stop(TSLexer *lexer, void *context) {
    QuestionGuardRead *guard = context;
    QuestionInput *input = guard->input;
    QuestionCheckpoint start = question_input_checkpoint(input);
    QuestionIdentifier word;
    bool name = rank_read_identifier(lexer, &word);
    bool stop = name && question_guard_statement_start(&word);
    bool implicit = name && word.keyword && !strcmp(word.word, "var");
    bool assignment = name && rank_identifier_allowed(&word, false) && question_skip_separators(lexer) >= 0 &&
        question_guard_assignment(lexer);
    question_input_restore(input, start);
    if (!stop) {
        RankTypeRead read = {.expression_ranks = true};
        bool type = implicit ? rank_read_identifier(lexer, &word) : rank_read_as_type(lexer, &read) &&
            !read.coalesce && !read.division && !read.binary && !read.colon;
        bool identifier = type && (read.has_word ? rank_identifier_allowed(&read.word, false) :
            question_skip_separators(lexer) >= 0 && rank_read_identifier(lexer, &word) && rank_identifier_allowed(&word, false));
        int32_t next = identifier ? question_skip_separators(lexer) : 0;
        bool declaration = identifier && (next == ';' || next == ',' || question_guard_assignment(lexer));
        stop = declaration && (!read.conditional || question_guard_complete_prefix(guard));
    }
    if (!stop && assignment) stop = question_guard_complete_prefix(guard);
    question_input_restore(input, start);
    return stop;
}

static RankParse question_guard_evaluate(const RankTokens *tail, unsigned limit, uint32_t pending, bool definite, QuestionGuardPreference *preference) {
    RankTokens tokens = array_new();
    for (uint32_t i = 0; i < pending; i++) {
        array_push(&tokens, ((RankToken){RANK_ATOM, false}));
        array_push(&tokens, ((RankToken){RANK_QUESTION, false}));
    }
    array_push(&tokens, ((RankToken){.kind = definite ? RANK_DEFINITE_TYPE : RANK_IS_TYPE, .guard_candidate = true}));
    unsigned question = tokens.size;
    array_push(&tokens, ((RankToken){RANK_QUESTION, true}));
    array_push(&tokens, ((RankToken){RANK_ATOM, true}));
    for (unsigned i = 0; i < limit; i++) array_push(&tokens, tail->contents[i]);
    array_push(&tokens, ((RankToken){RANK_END, false}));
    unsigned guard_end = tokens.size - 1;
    RankParse modes[2];
    RankParse first = {0};
    unsigned successor = preference ? preference->successor : 0;
    RankParse when_true = rank_evaluate_collected_modes(&tokens, question, modes, true, successor,
        preference && preference->first ? &first : NULL);
    if (preference && preference->first && !preference->successor && !pending && !definite &&
        limit < tail->size && tail->contents[limit].kind == RANK_COLON &&
        first.types.runs == 1 && first.types.first == GUARD_NULLABLE) {
        array_pop(&tokens);
        array_push(&tokens, tail->contents[limit]);
        array_push(&tokens, ((RankToken){RANK_ATOM, false}));
        array_push(&tokens, ((RankToken){RANK_END, false}));
        preference->concrete = true;
        when_true = rank_evaluate_collected_modes(&tokens, question, modes, true, successor, &first);
    }
    if (preference) {
        bool boundary = !pending && limit < tail->size && tail->contents[limit].kind == RANK_COLON;
        if (boundary && preference->first && !definite && first.valid && !(first.suffix_flags & RANK_SUFFIX_INVALID) && first.end == guard_end) {
            preference->colon = true;
            preference->successor = 0;
        } else {
            preference->colon = boundary && (!definite || successor) && when_true.valid && !(when_true.suffix_flags & RANK_SUFFIX_INVALID) && when_true.end == guard_end;
        }
    }
    RankParse parsed = modes[0];
    if (preference && preference->colon && !preference->successor &&
        first.types.runs == 1 && first.types.first == GUARD_TERNARY)
        parsed.types = rank_type_merge(rank_type_role(GUARD_TERNARY), first.types);
    parsed.valid &= parsed.end < tokens.size &&
        (tokens.contents[parsed.end].kind == RANK_END || tokens.contents[parsed.end].kind == RANK_COLON);
    array_delete(&tokens);
    return parsed;
}

static uint8_t rank_stream_input(TSLexer *lexer, Scanner *scanner, uint32_t *questions, QuestionInput *input) {
    const QuestionFrame *frame = &scanner->question_frames[scanner->question_frame_count - 1];
    if (frame->case_guard) {
        if (!(frame->guard.role & GUARD_ROLE_MASK)) {
            QuestionCheckpoint start = question_input_checkpoint(input);
            question_guard_type_start(input);
            bool proved = false;
            bool designation = rank_read_designation(lexer, questions, input, &proved);
            question_input_restore(input, start);
            if (designation) {
                if (!*questions) return RANK_PATTERN_COMPLETE;
                (*questions)--;
                return RANK_NULLABLE_NEXT;
            }
        }
        uint8_t role = question_guard_rank_role(lexer, scanner, questions, input);
        if (role) return role;
        if (question_guard_scalar_question(lexer, input)) return RANK_PATTERN_COMPLETE;
        if (rank_guard_designation(lexer, questions, input))
            return *questions ? RANK_NULLABLE_PREFIX : RANK_PATTERN_COMPLETE;
        if (question_guard_nullable_question(lexer, input, questions)) return RANK_OWNED_NULLABLE_PREFIX;
    }
    const Interpolation *interpolation = scanner->interpolation_stack.size ? array_back(&scanner->interpolation_stack) : NULL;
    return rank_stream_ranked(lexer, scanner, questions, input,
        interpolation && interpolation->open_brace_count && !interpolation->question_depth);
}

static bool question_guard_scalar_question(TSLexer *lexer, QuestionInput *input) {
    QuestionCheckpoint start = question_input_checkpoint(input);
    question_guard_type_start(input);
    RankTypeRead read = {0};
    bool valid = rank_read_as_type(lexer, &read) && read.conditional && read.has_word && !read.questions &&
        !read.division && !read.coalesce && !read.binary && !read.colon &&
        rank_identifier_allowed(&read.word, false) && question_skip_separators(lexer) == ':';
    question_input_restore(input, start);
    return valid;
}

static bool rank_guard_designation(TSLexer *lexer, uint32_t *questions, QuestionInput *input) {
    QuestionCheckpoint start = question_input_checkpoint(input);
    QuestionCheckpoint type = question_guard_type_start(input);
    bool proved = false;
    if (rank_read_designation(lexer, questions, input, &proved)) return true;
    question_input_restore(input, start);
    if (type.cursor == start.cursor || proved || !rank_read_designation(lexer, questions, input, &proved)) {
        question_input_restore(input, start);
        return false;
    }
    return true;
}

static QuestionCheckpoint question_guard_type_start(QuestionInput *input) {
    TSLexer *lexer = &input->lexer;
    QuestionCheckpoint type = question_input_checkpoint(input);
    QuestionIdentifier word;
    while (question_skip_separators(lexer) >= 0 && rank_read_identifier(lexer, &word) &&
        word.keyword && !strcmp(word.word, "not")) type = question_input_checkpoint(input);
    question_input_restore(input, type);
    return type;
}

static bool rank_read_designation(TSLexer *lexer, uint32_t *questions, QuestionInput *input, bool *proved) {
    uint32_t type_start = input->cursor;
    RankTypeRead read = {0};
    QuestionIdentifier designation;
    bool parsed = rank_read_as_type(lexer, &read);
    bool named = parsed && !read.colon && !read.division &&
        !read.conditional && !read.coalesce && !read.binary && !read.has_word &&
        rank_read_identifier(lexer, &designation) && rank_identifier_allowed(&designation, true);
    *proved = named || read.has_word || read.binary || (read.division && lexer->lookahead != '=') ||
        lexer->lookahead == '{' || question_guard_binary_follows(lexer, input) ||
        question_input_multi_rank(input, type_start) ||
        (read.questions > 1 && !question_assignment_follows(lexer, input));
    bool valid = named && question_skip_separators(lexer) == '?' && question_read_single_question(lexer) &&
        UINT32_MAX - *questions >= read.questions;
    if (valid) *questions += read.questions;
    return valid;
}

static bool question_assignment_follows(TSLexer *lexer, QuestionInput *input) {
    QuestionCheckpoint start = question_input_checkpoint(input);
    unsigned length = 0;
    while (length < 3 && lexer->lookahead > 0 && lexer->lookahead < 128 && strchr("+-*/%&|^<>?", lexer->lookahead)) {
        advance(lexer);
        length++;
    }
    bool assignment = lexer->lookahead == '=';
    if (assignment && !length) {
        advance(lexer);
        assignment = lexer->lookahead != '=' && lexer->lookahead != '>';
    }
    question_input_restore(input, start);
    return assignment;
}

static bool question_input_multi_rank(const QuestionInput *input, uint32_t start) {
    bool open = false;
    for (uint32_t i = start; i < input->cursor; i++) {
        int32_t c = input->characters.contents[i].value;
        if (open && c == ',') return true;
        if (c != ' ' && c != '\t') open = c == '[';
    }
    return false;
}

static bool question_guard_nullable_question(TSLexer *lexer, QuestionInput *input, uint32_t *questions) {
    QuestionCheckpoint start = question_input_checkpoint(input);
    RankTypeRead read = {0};
    bool valid = rank_read_as_type(lexer, &read) && read.questions && !read.colon && !read.coalesce &&
        !read.conditional && !read.division && !read.binary && !read.has_word &&
        lexer->lookahead == '?' && question_read_single_question(lexer) &&
        question_expression_start(lexer, question_skip_separators(lexer));
    if (valid) *questions = read.questions;
    question_input_restore(input, start);
    return valid;
}

static uint8_t question_guard_rank_role(TSLexer *lexer, Scanner *scanner, uint32_t *questions, QuestionInput *input) {
    QuestionCheckpoint start = question_input_checkpoint(input);
    uint32_t prefix = 0;
    bool simple = false;
    uint8_t result = RANK_NONE;
    bool has_next = false;
    RankTokens tail = array_new();
    tail.input = input;
    bool target = rank_read_prefix(lexer, &simple, &prefix) && question_read_single_question(lexer) && question_skip_separators(lexer) == '[';
    if (!target) goto done;
    advance(lexer);
    int32_t first = question_skip_separators(lexer);
    if (first != ']' && first != ',') goto done;
    bool definite = false, division = false;
    if (!rank_read_omitted_ranks(lexer, &tail, &definite, &division, true)) goto done;
    QuestionCheckpoint suffix = question_input_checkpoint(input);
    has_next = question_skip_separators(lexer) == '?' && question_read_single_question(lexer);
    bool empty_successor = has_next && question_skip_separators(lexer) == '[';
    if (empty_successor) {
        advance(lexer);
        empty_successor = question_skip_separators(lexer) == ']';
    }
    question_input_restore(input, suffix);
    uint32_t suffix_questions = 0;
    if (!division) definite |= question_guard_suffix(lexer, scanner, input, &suffix_questions);
    question_input_restore(input, suffix);
    QuestionFrame *frame = &scanner->question_frames[scanner->question_frame_count - 1];
    if (definite && !prefix && question_guard_high_binary(lexer, input)) {
        result = RANK_PATTERN_COMPLETE;
        goto done;
    }
    if (definite && !prefix && question_guard_logical_collection(lexer, input)) {
        result = RANK_NULLABLE_NEXT;
        goto done;
    }
    bool successor = empty_successor && !prefix;
    bool definite_prefix = definite && !(frame->pending && question_guard_type_operator_follows(lexer, input));
    if (definite_prefix && !successor) goto definite_prefix;
    if (frame->guard.role & GUARD_ROLE_MASK) {
        if (definite_prefix) goto definite_prefix;
        result = question_guard_take(frame, prefix, questions);
        goto done;
    }
    unsigned colons = 0;
    QuestionGuardRead guard = {.input = input, .tail = &tail, .pending = frame->pending};
    bool read = rank_read_stream_after_rank(lexer, &tail, &colons, division, question_guard_stream_stop, &guard);
    unsigned last_colon = 0;
    for (unsigned i = 0; i < tail.size; i++) if (tail.contents[i].kind == RANK_COLON) last_colon = i;
    if (!read || !colons || !last_colon) {
        if (definite_prefix) goto definite_prefix;
        goto done;
    }
    unsigned successor_questions = successor ? question_guard_empty_prefix(&tail) : 0;
    QuestionGuardPreference preference = {.successor = successor_questions, .first = !definite};
    RankParse parsed = question_guard_evaluate(&tail, last_colon, frame->pending, definite,
        preference.first || preference.successor ? &preference : NULL);
    if (!preference.colon && definite_prefix) goto definite_prefix;
    if (parsed.valid && !(parsed.suffix_flags & RANK_SUFFIX_INVALID)) {
        result = question_guard_save(frame, &parsed, !preference.concrete);
        if (result) *questions = prefix + (result == RANK_OWNED_NULLABLE_PREFIX);
    }
    if (preference.colon) {
        result = preference.successor ? RANK_NULLABLE_NEXT : RANK_PATTERN_COMPLETE;
        *questions = preference.successor ? preference.successor - 1 : prefix;
    }
    goto done;
definite_prefix:
    question_input_restore(input, start);
    if (has_next && !suffix_questions && question_guard_nullable_question(lexer, input, questions)) result = RANK_OWNED_NULLABLE_PREFIX;
    else if (rank_guard_designation(lexer, questions, input))
        result = *questions ? RANK_NULLABLE_PREFIX : RANK_PATTERN_COMPLETE;
    else {
        *questions = prefix + 1 + suffix_questions;
        result = RANK_OWNED_NULLABLE_PREFIX;
    }
done:
    array_delete(&tail);
    question_input_restore(input, start);
    return question_guard_rank_successor(result, has_next, prefix, questions);
}

static unsigned question_guard_empty_prefix(const RankTokens *tail) {
    unsigned count = 0;
    while (count < tail->size / 2) {
        unsigned pos = count * 2;
        if (tail->contents[pos].kind != RANK_QUESTION || tail->contents[pos].collection ||
            tail->contents[pos + 1].kind != RANK_ATOM || !tail->contents[pos + 1].collection) break;
        count++;
    }
    return count;
}

static bool question_guard_logical_collection(TSLexer *lexer, QuestionInput *input) {
    QuestionCheckpoint start = question_input_checkpoint(input);
    QuestionIdentifier logical;
    uint32_t prefix = 0;
    bool simple = false;
    bool valid = rank_read_identifier(lexer, &logical) && logical.keyword &&
        (!strcmp(logical.word, "and") || !strcmp(logical.word, "or")) &&
        rank_read_prefix(lexer, &simple, &prefix) && !prefix && question_read_single_question(lexer) &&
        question_skip_separators(lexer) == '[';
    if (valid) {
        advance(lexer);
        valid = question_skip_separators(lexer) == ']';
        if (valid) {
            advance(lexer);
            valid = question_skip_separators(lexer) == ':' && question_guard_colon(lexer, input);
        }
    }
    question_input_restore(input, start);
    return valid;
}

static bool question_guard_binary_follows(TSLexer *lexer, QuestionInput *input) {
    QuestionCheckpoint start = question_input_checkpoint(input);
    int32_t c = question_skip_separators(lexer);
    bool postfix = false, high = false;
    bool binary = rank_binary_start(c) && !question_expression_start(lexer, c) &&
        rank_skip_binary_operator(lexer, c, &postfix, false, &high);
    question_input_restore(input, start);
    return binary && !postfix;
}

static bool question_guard_high_binary(TSLexer *lexer, QuestionInput *input) {
    QuestionCheckpoint start = question_input_checkpoint(input);
    int32_t c = question_skip_separators(lexer);
    bool postfix = false, high = c == -1;
    bool binary = c == -1 ? lexer->lookahead != '=' :
        rank_binary_start(c) && rank_skip_binary_operator(lexer, c, &postfix, false, &high);
    if (c == '*' && binary) {
        int32_t next = question_skip_separators(lexer);
        while (next == '*') {
            advance(lexer);
            next = question_skip_separators(lexer);
        }
        if (next == '[') high = false;
    }
    question_input_restore(input, start);
    return binary && high && !postfix;
}

// Inside a pending conditional, a type operator after a definite type leaves the role to the guard stream evaluation.
static bool question_guard_type_operator_follows(TSLexer *lexer, QuestionInput *input) {
    QuestionCheckpoint start = question_input_checkpoint(input);
    bool nullable = false;
    bool follows = question_walk_pattern_suffix(lexer, &nullable, NULL);
    QuestionCheckpoint word = question_input_checkpoint(input);
    QuestionIdentifier designation;
    if (!rank_read_identifier(lexer, &designation) || !rank_identifier_allowed(&designation, true)) question_input_restore(input, word);
    else question_skip_separators(lexer);
    int32_t c = lexer->lookahead;
    if (follows && (c == '|' || c == '&')) {
        advance(lexer);
        follows = lexer->lookahead == c;
    } else follows = follows && question_type_keyword_follower(lexer, input);
    question_input_restore(input, start);
    return follows;
}

static bool question_guard_suffix(TSLexer *lexer, Scanner *scanner, QuestionInput *input, uint32_t *questions) {
    bool nullable = false;
    bool type = question_walk_pattern_suffix(lexer, &nullable, questions);
    QuestionCheckpoint end = question_input_checkpoint(input);
    int32_t token = lexer->lookahead;
    bool binary = nullable && (token == '|' || token == '>');
    if (nullable && (token == '&' || token == '=' || token == '!')) {
        advance(lexer);
        binary = lexer->lookahead == (token == '&' ? '&' : '=');
    }
    question_input_restore(input, end);
    bool boundary = type && *questions && (binary || question_type_keyword_follower(lexer, input));
    QuestionFrame *frame = &scanner->question_frames[scanner->question_frame_count - 1];
    if (boundary && !frame->pending && (frame->guard.role & GUARD_SUFFIX_COMPLETE)) {
        if (frame->guard.role & GUARD_ROLE_MASK) {
            uint32_t consumed = 0;
            question_guard_take(frame, 0, &consumed);
        }
        return true;
    }
    bool pattern = type && (boundary ? question_guard_suffix_complete(lexer, scanner, input, *questions) :
        question_walk_pattern_tail(lexer, nullable, false, input));
    if (!pattern) *questions = 0;
    return pattern;
}

static bool question_guard_suffix_complete(TSLexer *lexer, Scanner *scanner, QuestionInput *input, uint32_t questions) {
    QuestionFrame *frame = &scanner->question_frames[scanner->question_frame_count - 1];
    RankTokens tail = array_new();
    tail.input = input;
    tail.suffix_modes = true;
    for (uint32_t i = 0; i < questions; i++) {
        array_push(&tail, ((RankToken){.kind = RANK_IS_TYPE, .guard_candidate = true}));
        array_push(&tail, ((RankToken){RANK_QUESTION, false}));
        array_push(&tail, ((RankToken){RANK_ATOM, false}));
    }
    unsigned colons = 0;
    QuestionGuardRead guard = {.input = input, .tail = &tail, .pending = frame->pending};
    bool read = rank_read_stream_after_rank(lexer, &tail, &colons, false, question_guard_stream_stop, &guard);
    unsigned last_colon = 0;
    for (unsigned i = 0; i < tail.size; i++) if (tail.contents[i].kind == RANK_COLON) last_colon = i;
    RankParse parsed = {0};
    if (read && colons && last_colon && last_colon + 2 == tail.size)
        parsed = question_guard_evaluate(&tail, last_colon, frame->pending, false, NULL);
    bool complete = parsed.valid && !(parsed.suffix_flags & RANK_SUFFIX_INVALID) && parsed.role == RANK_NULLABLE_LAST &&
        parsed.end == (uint64_t)frame->pending * 2 + 3 + last_colon &&
        parsed.types.first == GUARD_NULLABLE && parsed.types.prefix > questions;
    if (complete && !frame->pending && !parsed.suffix_flags) frame->guard.role |= GUARD_SUFFIX_COMPLETE;
    array_delete(&tail);
    return complete;
}

static uint8_t question_guard_rank_successor(uint8_t role, bool has_next, uint32_t prefix, uint32_t *questions) {
    if (role == RANK_OWNED_NULLABLE_PREFIX && has_next && *questions && *questions - 1 == prefix) {
        (*questions)--;
        return RANK_NULLABLE_NEXT;
    }
    return role;
}

static uint8_t question_guard_take(QuestionFrame *frame, uint32_t prefix, uint32_t *questions) {
    bool nullable = (frame->guard.role & GUARD_ROLE_MASK) == GUARD_NULLABLE;
    *questions = prefix + nullable;
    if (frame->guard.prefix && !--frame->guard.prefix)
        frame->guard.role = (frame->guard.role & GUARD_SUFFIX_COMPLETE) | (nullable ? GUARD_TERNARY : GUARD_NULLABLE);
    return nullable ? RANK_OWNED_NULLABLE_PREFIX : RANK_PATTERN_COMPLETE;
}

static uint8_t question_guard_save(QuestionFrame *frame, RankParse *parsed, bool bounded) {
    if (bounded && parsed->types.runs == 2 && parsed->types.first == GUARD_NULLABLE) {
        parsed->types.prefix = parsed->types.count - parsed->types.prefix;
        parsed->types.first = GUARD_TERNARY;
        parsed->types.last = GUARD_NULLABLE;
        parsed->role = RANK_TERNARY;
    }
    if (parsed->types.runs && parsed->types.runs <= 2) {
        frame->guard.role = (frame->guard.role & GUARD_SUFFIX_COMPLETE) | parsed->types.first;
        frame->guard.prefix = parsed->types.runs == 2 ? parsed->types.prefix - 1 : 0;
        if (parsed->types.runs == 2 && !frame->guard.prefix) frame->guard.role = (frame->guard.role & GUARD_SUFFIX_COMPLETE) | parsed->types.last;
    }
    return parsed->role == RANK_TERNARY ? RANK_PATTERN_COMPLETE :
        parsed->role == RANK_NULLABLE_LAST ? RANK_OWNED_NULLABLE_PREFIX : RANK_NONE;
}

static uint8_t question_guard_as_role(QuestionInput *input, uint32_t *questions, bool pending) {
    RankTypeRead read = {.expression_ranks = true};
    bool type = rank_read_as_type(&input->lexer, &read);
    uint32_t prefix = read.expression_questions ? read.prefix_questions : read.questions;
    if (!type || !prefix) return RANK_NONE;
    uint8_t role = RANK_OWNED_NULLABLE_PREFIX;
    if (pending && !read.sized_rank) {
        // The type reader may already have consumed is/as after a nullable suffix.
        bool type_operator = read.has_word
            ? read.word.keyword && (!strcmp(read.word.word, "is") || !strcmp(read.word.word, "as"))
            : question_type_keyword_follower(&input->lexer, input);
        if (type_operator) {
            if (read.conditional || read.coalesce || read.binary || read.division || read.colon) return RANK_NONE;
            role = RANK_NULLABLE_PREFIX;
        }
    }
    *questions = prefix;
    return role;
}



static QuestionScanResult scan_case_guard_when(Scanner *scanner, TSLexer *lexer) {
    while (is_space_but_line_feed(lexer->lookahead) || is_line_terminator(lexer->lookahead)) skip(lexer);
    if (lexer->lookahead != 'w') return QUESTION_NOT_STARTED;
    QuestionIdentifier word;
    if (!question_identifier(lexer, false, &word) || !word.keyword || strcmp(word.word, "when")) return QUESTION_MISMATCHED;
    Scanner *guard = question_scope_create(scanner);
    QuestionFrame *frame = &guard->question_frames[guard->question_frame_count - 1];
    *frame = (QuestionFrame){.group = frame->group, .case_colon = true, .case_guard = true};
    guard->question_unknown = false;
    guard->question_type_uncertain = false;
    guard->ternary_confirmation.valid = false;
    question_clear_access_cache(guard);
    clear_question_rank(guard);
    lexer->mark_end(lexer);
    if (question_prepare_guard(guard, lexer)) {
        array_delete(&scanner->interpolation_stack);
        *scanner = *guard;
        ts_free(guard);
    } else question_scope_delete(guard);
    lexer->result_symbol = CASE_GUARD_WHEN;
    return QUESTION_MATCHED;
}

static bool question_prepare_guard(Scanner *scanner, TSLexer *lexer) {
    QuestionInput input = question_input_create(lexer);
    bool found = question_prepare_prefix(scanner, &input, false);
    array_delete(&input.characters);
    return found;
}

static void question_prepare_type_prefix(Scanner *scanner, QuestionInput *input) {
    bool handoff = false;
    for (unsigned i = 0; i < scanner->question_frame_count; i++) {
        QuestionFrame *frame = &scanner->question_frames[i];
        handoff |= frame->case_guard && frame->guard.handoff;
        frame->guard.handoff = false;
    }
    if (!handoff) return;
    Scanner *prefix = question_scope_create(scanner);
    uint8_t role = scanner->question_rank_role;
    uint32_t questions = scanner->question_rank_prefix_questions;
    if (question_prepare_prefix(prefix, input, true)) {
        array_delete(&scanner->interpolation_stack);
        *scanner = *prefix;
        ts_free(prefix);
        if (role) {
            scanner->question_rank_role = role;
            scanner->question_rank_prefix_questions = questions;
        }
    } else {
        question_scope_delete(prefix);
        scanner->question_unknown = true;
        question_clear_rank_from(scanner, 0);
    }
}

static bool question_prepare_prefix(Scanner *scanner, QuestionInput *input, bool type_prefix) {
    TSLexer *lexer = &input->lexer;
    QuestionWalk walk = question_walk_create(scanner, (QuestionFollowing){0}, true, 0, RANK_NONE);
    walk.input = input;
    walk.type_prefix = type_prefix;
    walk.scanner = scanner;
    walk.role_active = false;
    walk.ordinary = false;
    walk.ordinary_first_token = false;
    walk.first_word = false;
    QuestionWalkStep step = question_walk_read(scanner, lexer, &walk, true);
    bool known = step != QUESTION_WALK_INVALID && step != QUESTION_WALK_UNKNOWN;
    interpolation_question_events(scanner, walk.events.contents, walk.events.size);
    bool events = apply_question_events(scanner, walk.events.contents, walk.events.size);
    known &= !type_prefix || events;
    scanner->question_unknown |= !known;
    bool found = known && walk.found_next_question;
    if (known) {
        question_save_allocation_prefix(scanner, &walk);
        question_save_type_handoff(scanner, &walk);
    }
    question_walk_dispose(&walk);
    return known && (type_prefix || found);
}

static void question_save_type_handoff(Scanner *scanner, const QuestionWalk *walk) {
    if (!walk->type_handoff || scanner->question_unknown) return;
    for (unsigned i = scanner->question_frame_count; i > 0; i--) {
        QuestionFrame *frame = &scanner->question_frames[i - 1];
        if (!frame->case_guard) continue;
        if (!frame->unknown) frame->guard.handoff = true;
        return;
    }
}

static QuestionWalkStep question_walk_read(Scanner *scanner, TSLexer *lexer, QuestionWalk *walk, bool prefix) {
    while (!lexer->eof(lexer)) {
        int32_t c = question_skip_separators(lexer);
        if (c == -2) return QUESTION_WALK_UNKNOWN;
        if (lexer->eof(lexer)) break;
        if (prefix && !walk->depth && c == ':' && question_guard_colon(lexer, walk->input)) {
            const QuestionFrame *frame = question_walk_prefix_frame(walk);
            if (scanner->question_unknown || !frame || frame->unknown || !frame->pending) break;
        }
        QuestionWalkStep step = question_walk_step(scanner, lexer, walk, c);
        walk->previous_token = walk->consumed_token ? walk->consumed_token : c;
        walk->consumed_token = 0;
        if (step != QUESTION_WALK_CONTINUE) return step;
        if (prefix && walk->found_next_question) break;
    }
    return QUESTION_WALK_STOP;
}

static void question_save_allocation_prefix(Scanner *scanner, const QuestionWalk *walk) {
    const QuestionFrame *frame = &scanner->question_frames[scanner->question_frame_count - 1];
    if (!walk->next_allocation_nullable || !frame->case_guard) return;
    scanner->question_rank_role = RANK_NULLABLE_PREFIX;
    scanner->question_rank_prefix_questions = 1;
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

static bool rank_local_pattern_reset(QuestionInput *input, QuestionCheckpoint prefix, uint32_t *questions) {
    TSLexer *lexer = &input->lexer;
    QuestionCheckpoint end = question_input_checkpoint(input);
    question_input_restore(input, prefix);
    question_guard_type_start(input);
    RankTypeRead read = {0};
    bool type = rank_read_as_type(lexer, &read);
    bool reset = type && !read.conditional && !read.coalesce && !read.binary && !read.has_word && !read.colon &&
        (read.division ? lexer->lookahead != '=' : question_guard_high_binary(lexer, input));
    if (reset && read.questions) *questions = read.questions - 1;
    question_input_restore(input, end);
    return reset;
}

static bool rank_local_nullable_prefix(QuestionInput *input, QuestionCheckpoint prefix, uint32_t *questions, bool interpolation) {
    TSLexer *lexer = &input->lexer;
    QuestionCheckpoint end = question_input_checkpoint(input);
    uint32_t count = 0;
    bool valid = false;
    if (interpolation) {
        question_input_restore(input, prefix);
        RankTypeRead read = {0};
        bool type = rank_read_as_type(lexer, &read);
        bool designation = type && read.conditional && read.has_word && rank_identifier_allowed(&read.word, true) &&
            question_skip_separators(lexer) == ':' && read.questions < UINT32_MAX;
        bool type_operator = read.has_word && read.word.keyword &&
            (!strcmp(read.word.word, "is") || !strcmp(read.word.word, "as"));
        valid = type && read.questions && (designation || (type_operator && !read.conditional)) &&
            !read.colon && !read.division && !read.coalesce && !read.binary && !read.sized_rank;
        count = read.questions + designation;
    } else {
        bool nullable = false;
        uint32_t suffix_questions = 0;
        bool type = question_walk_pattern_suffix(lexer, &nullable, &suffix_questions);
        QuestionIdentifier logical, negation;
        valid = type && nullable && suffix_questions && rank_read_identifier(lexer, &logical) && logical.keyword &&
            (!strcmp(logical.word, "and") || !strcmp(logical.word, "or")) && question_skip_separators(lexer) >= 0 &&
            rank_read_identifier(lexer, &negation) && negation.keyword && !strcmp(negation.word, "not") &&
            suffix_questions < UINT32_MAX - *questions;
        if (valid) count = *questions + suffix_questions + 1;
    }
    question_input_restore(input, end);
    if (valid) *questions = count;
    return valid;
}
#endif
