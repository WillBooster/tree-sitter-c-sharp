#ifndef TREE_SITTER_C_SHARP_QUESTION_OPERANDS_H_
#define TREE_SITTER_C_SHARP_QUESTION_OPERANDS_H_

static bool question_walk_scope_prefix(QuestionWalk *, unsigned, bool);

static bool rank_prepare_arguments(const Scanner *scanner, RankScopeRead *scope, Scanner *context) {
    question_scope_init(context, scanner);
    if (scope->prefix_questions && !question_rank_scope(context, scope->input, scope->prefix, scope->tail.cursor, true)) return false;
    const QuestionFrame *frame = &context->question_frames[context->question_frame_count - 1];
    if (frame->group != 'p' || frame->force_barrier || frame->generic_pending) return false;
    if (!question_rank_scope(context, scope->input, scope->tail, scope->end, false)) return false;
    return !context->question_frames[context->question_frame_count - 1].query_pending;
}

static bool rank_complete_arguments(TSLexer *lexer, RankScopeRead *scope, Scanner *context) {
    QuestionCheckpoint restore = {.cursor = scope->input->cursor, .capturing = scope->input->capturing};
    bool valid = true;
    while (lexer->lookahead == ',') {
        if (!question_apply_event(context, ',')) { valid = false; break; }
        advance(lexer);
        if (!rank_complete_sibling(lexer, context, scope->input)) { valid = false; break; }
    }
    valid = valid && lexer->lookahead == ')' &&
        !context->question_frames[context->question_frame_count - 1].query_pending;
    if (valid) question_end_lambda(&context->question_frames[context->question_frame_count - 1]);
    else question_input_restore(scope->input, restore);
    return valid;
}

static bool rank_complete_sibling(TSLexer *lexer, Scanner *context, QuestionInput *input) {
    QuestionCheckpoint start = {.cursor = input->cursor, .capturing = input->capturing};
    RankTokens sibling = array_new();
    unsigned colons = 0;
    bool read = rank_read_stream_from(lexer, &sibling, &colons, true);
    RankParse summary[2] = {0};
    if (read) rank_evaluate_modes(&sibling, ((unsigned)-1), summary);
    bool valid = read && summary[0].valid && summary[0].end == sibling.size - 1;
    array_delete(&sibling);

    return valid && question_rank_scope(context, input, start, input->cursor, false);
}


static bool question_rank_scope(Scanner *context, QuestionInput *input, QuestionCheckpoint start, unsigned end, bool normalize) {
    QuestionCheckpoint restore = {.cursor = input->cursor, .capturing = input->capturing};
    question_input_restore(input, (QuestionCheckpoint){start.cursor, true});
    Scanner local;
    question_scope_init(&local, context);
    QuestionWalk walk = question_walk_create(&local, (QuestionFollowing){0}, false, 0, RANK_NONE);
    walk.input = input;
    walk.scanner = &local;
    walk.syntax_only = true;
    walk.discard_to_question = normalize;
    walk.role_active = false;
    walk.ordinary = false;
    walk.first_word = false;
    for (unsigned i = 0; i < local.question_frame_count; i++) walk.lambda_prefix |= local.question_frames[i].force_barrier;
    bool valid = question_walk_scope_prefix(&walk, end, normalize);
    if (valid) {
        valid = apply_question_events(&local, walk.events.contents, walk.events.size);
        if (valid) interpolation_question_events(&local, walk.events.contents, walk.events.size);
    }
    valid = valid && local.question_frame_count <= context->question_frame_count;
    if (!normalize) valid = valid && local.question_frame_count == context->question_frame_count &&
        !local.question_frames[local.question_frame_count - 1].generic_pending;
    if (valid) {
        for (unsigned i = 0; i < local.question_frame_count; i++) {
            QuestionFrame original = context->question_frames[i];
            context->question_frames[i] = local.question_frames[i];
            context->question_frames[i].pending = original.pending;
            context->question_frames[i].unknown = original.unknown;
            context->question_frames[i].case_colon = original.case_colon;
        }
        context->question_frame_count = local.question_frame_count;
        array_assign(&context->interpolation_stack, &local.interpolation_stack);
    }
    ts_free(walk.preview);
    array_delete(&local.interpolation_stack);
    array_delete(&walk.groups);
    array_delete(&walk.events);
    question_input_restore(input, restore);
    return valid;
}

static bool question_walk_scope_prefix(QuestionWalk *walk, unsigned end, bool normalize) {
    QuestionInput *input = walk->input;
    bool valid = true;
    while (input->cursor < end) {
        unsigned before = input->cursor;
        int32_t c = question_skip_separators(&input->lexer);
        if (input->cursor >= end) break;
        QuestionWalkStep step = question_walk_step(walk->scanner, &input->lexer, walk, c);
        walk->previous_token = walk->consumed_token ? walk->consumed_token : c;
        walk->consumed_token = 0;
        walk->recording = true;
        if (step == QUESTION_WALK_UNKNOWN || step == QUESTION_WALK_INVALID || input->cursor <= before) { valid = false; break; }
        if (step == QUESTION_WALK_STOP && !normalize) { valid = false; break; }
    }
    return valid && input->cursor == end && !walk->discard_to_question && !walk->groups.size;
}

static const QuestionFrame *question_walk_prefix_frame(QuestionWalk *walk) {
    if (!walk->preview_ready) {
        if (!walk->preview) walk->preview = ts_malloc(sizeof(*walk->preview));
        *walk->preview = *walk->scanner;
        walk->preview_ready = true;
        walk->preview_valid = true;
    }
    if (!walk->preview_valid) return NULL;
    if (walk->events.size > walk->preview_count)
        walk->preview_valid = apply_question_events(walk->preview, walk->events.contents + walk->preview_count,
            walk->events.size - walk->preview_count);
    walk->preview_count = walk->events.size;
    return walk->preview_valid ? &walk->preview->question_frames[walk->preview->question_frame_count - 1] : NULL;
}

static QuestionGenericContext question_generic_context(QuestionWalk *walk, bool declaration) {
    const QuestionFrame *frame = question_walk_prefix_frame(walk);
    bool tuple = walk->groups.size && *array_back(&walk->groups) == '(' &&
        (walk->previous_token == '(' || walk->previous_token == ',' || walk->previous_token == ':');
    return (QuestionGenericContext){walk->input, declaration || (tuple && walk->previous_token == ',') || (frame && frame->generic_pending),
        tuple, frame && (frame->query_pending || frame->query_result)};
}

static void question_walk_generic(TSLexer *lexer, QuestionWalk *walk, const QuestionIdentifier *identifier, bool declaration) {
    if (walk->discard_to_question || !rank_identifier_allowed(identifier, true)) return;
    QuestionCheckpoint start = question_input_checkpoint(walk->input);
    int32_t next = question_skip_separators(lexer);
    if (next != '<') {
        question_input_restore(walk->input, start);
        return;
    }
    QuestionGenericContext context = question_generic_context(walk, declaration);
    question_input_restore(walk->input, start);
    question_skip_separators(lexer);
    bool recording = walk->recording;
    RankGroups prefix = array_new();
    if (recording) array_push(&prefix, 'g');
    RankTypeRead read = {.prefix = recording ? &prefix : NULL, .prefix_all = walk->syntax_only};
    bool generic = question_read_generic_arguments(&context, &read);
    if (generic) {
        for (unsigned i = 0; i < prefix.size; i++) array_push(&walk->events, prefix.contents[i]);
        if (recording && read.prefix_done && !walk->syntax_only) {
            walk->recording = false;
            walk->found_next_question = true;
            walk->cache_shaped = false;
        }
        walk->consumed_token = '>';
    }
    array_delete(&prefix);
}

static bool question_query_header(TSLexer *lexer, QuestionWalk *walk) {
    QuestionCheckpoint start = question_input_checkpoint(walk->input);
    QuestionIdentifier range, next;
    bool simple = question_skip_separators(lexer) >= 0 && rank_read_identifier(lexer, &range) &&
        (rank_identifier_allowed(&range, false) || (range.keyword && !strcmp(range.word, "var"))) &&
        question_skip_separators(lexer) >= 0 && rank_read_identifier(lexer, &next) &&
        next.keyword && !strcmp(next.word, "in");
    question_input_restore(walk->input, start);
    if (simple) return true;
    start = question_input_checkpoint(walk->input);
    RankTypeRead read = {0};
    bool valid = rank_read_as_type(lexer, &read) && !read.colon && !read.coalesce &&
        !read.division && !read.binary && (!read.conditional || read.has_word);
    if (read.has_word) range = read.word;
    else valid = valid && question_skip_separators(lexer) >= 0 && rank_read_identifier(lexer, &range);
    valid = valid && rank_identifier_allowed(&range, false) && question_skip_separators(lexer) >= 0 &&
        rank_read_identifier(lexer, &next) && next.keyword && !strcmp(next.word, "in");
    question_input_restore(walk->input, start);
    return valid;
}

static void question_walk_query(TSLexer *lexer, QuestionWalk *walk, const QuestionIdentifier *identifier) {
    if (!walk->recording || !identifier->keyword || walk->previous_token == '.') return;
    const char *word = identifier->word;
    if (!strcmp(word, "from") || !strcmp(word, "join")) {
        if (question_query_header(lexer, walk)) array_push(&walk->events, !strcmp(word, "from") ? 'q' : 'k');
    } else if (!strcmp(word, "select") || !strcmp(word, "group")) array_push(&walk->events, 's');
    else if (!strcmp(word, "into")) array_push(&walk->events, 'i');
    else if (!strcmp(word, "orderby") || !strcmp(word, "where") || !strcmp(word, "let") || !strcmp(word, "on") || !strcmp(word, "equals")) array_push(&walk->events, 'k');
}

static QuestionWalkStep question_walk_identifier(Scanner *scanner, TSLexer *lexer, QuestionWalk *walk, bool first_identifier, bool future_identifier) {
    QuestionIdentifier identifier;
    if (!question_identifier(lexer, false, &identifier)) return QUESTION_WALK_UNKNOWN;
    question_walk_query(lexer, walk, &identifier);
    bool creation = identifier.keyword && (!strcmp(identifier.word, "new") || !strcmp(identifier.word, "stackalloc"));
    if (identifier.keyword && !walk->is_later_alternative && (creation || strcmp(identifier.word, "delegate") == 0 ||
        strcmp(identifier.word, "from") == 0)) walk->is_eligible = false;
    if (question_keyword_incomplete(lexer, walk, &identifier)) return QUESTION_WALK_UNKNOWN;
    bool is_or_as = identifier.keyword && (strcmp(identifier.word, "is") == 0 || strcmp(identifier.word, "as") == 0);
    question_walk_type_operand(walk, future_identifier, is_or_as, &identifier, creation);
    bool value_operator = is_or_as || (identifier.keyword && (!strcmp(identifier.word, "switch") || !strcmp(identifier.word, "with")));
    if (walk->logical_name_candidate && !walk->depth && !value_operator)
        question_walk_logical_nullable(walk);
    walk->logical_name_candidate = ((walk->recording && (first_identifier || walk->nullable_name_candidate)) || future_identifier) &&
        !walk->depth && identifier.keyword &&
        (!strcmp(identifier.word, "and") || !strcmp(identifier.word, "or"));
    if (walk->ordinary_name_candidate && walk->recording && !walk->depth && !walk->nullable_only && value_operator) {
        walk->definite_ternary = true;
        walk->known_ternary = true;
        walk->known_nullable = false;
    }
    walk->ordinary_name_candidate = first_identifier && walk->recording && !walk->depth && walk->ordinary && !is_or_as;
    if (question_uncertain_keyword(&identifier)) question_walk_keyword_context(scanner, walk, &identifier, is_or_as);
    if (question_expression_keyword(&identifier) && walk->recording && walk->first_word && walk->ordinary) {
        walk->definite_ternary = true;
        if (first_identifier && !walk->depth && !walk->nullable_only) {
            walk->known_ternary = true;
            walk->known_nullable = false;
        }
    }
    if (walk->recording) walk->first_word = false;
    return question_walk_identifier_operand(lexer, walk, &identifier, creation);
}

static QuestionWalkStep question_walk_identifier_operand(TSLexer *lexer, QuestionWalk *walk, const QuestionIdentifier *identifier, bool creation) {
    if (!question_walk_is_name(lexer, walk, identifier)) return QUESTION_WALK_UNKNOWN;
    bool own_as_type = identifier->keyword && !strcmp(identifier->word, "as") && !walk->depth &&
        walk->binding && walk->recording && !walk->root_colons;
    if (own_as_type) return question_walk_as_prefix(lexer);
    if (walk->as_operand && !walk->depth && !(identifier->keyword && !strcmp(identifier->word, "as"))) {
        RankTypeRead read = {0};
        if (!question_walk_name_suffix(lexer, walk, identifier, &read)) return QUESTION_WALK_UNKNOWN;
        if (read.division) walk->as_operand = false;
    }
    bool declaration = walk->generic_declaration;
    walk->generic_declaration = identifier->keyword &&
        (!strcmp(identifier->word, "out") || !strcmp(identifier->word, "case") || !strcmp(identifier->word, "is"));
    if (!creation) question_walk_generic(lexer, walk, identifier, declaration);
    return creation ? question_walk_creation_prefix(lexer, walk) : QUESTION_WALK_CONTINUE;
}

static bool question_walk_is_name(TSLexer *lexer, QuestionWalk *walk, const QuestionIdentifier *identifier) {
    if (walk->depth || !walk->is_name_pending) return true;
    if (identifier->keyword && (!strcmp(identifier->word, "is") || !strcmp(identifier->word, "not"))) return true;
    walk->is_name_pending = false;
    if (!rank_identifier_allowed(identifier, true) && !(identifier->keyword && !strcmp(identifier->word, "delegate"))) return true;
    RankTypeRead read = {0};
    if (!question_walk_name_suffix(lexer, walk, identifier, &read)) return false;
    if (read.division) {
        if (walk->binding && !walk->cache_colon) walk->root_binary = true;
        if (walk->recording && walk->ordinary) walk->definite_ternary = true;
    } else walk->is_name_pending = lexer->lookahead == '.' || lexer->lookahead == ':';
    return true;
}

static bool question_walk_name_suffix(TSLexer *lexer, QuestionWalk *walk, const QuestionIdentifier *identifier, RankTypeRead *read) {
    read->prefix = walk->recording ? &walk->events : NULL;
    read->prefix_all = walk->syntax_only;
    if (!rank_read_as_name_suffix(lexer, read, identifier)) return false;
    if (read->questions && !walk->syntax_only) {
        walk->found_next_question = true;
        walk->recording = false;
        walk->cache_shaped = false;
    }
    return true;
}

static void question_walk_is_name_operator(QuestionWalk *walk, int32_t c) {
    if (walk->depth) return;
    if (question_opening_group(c) || question_operator(c) || c == -1 || c == '<' || c == '>' || (c >= '0' && c <= '9'))
        walk->is_name_pending = false;
}

static QuestionWalkStep question_walk_as_prefix(TSLexer *lexer) {
    if (question_skip_separators(lexer) == '(') return QUESTION_WALK_CONTINUE;
    RankTypeRead read = {0};
    return rank_read_as_name(lexer, &read) && !read.colon && !read.division && !read.conditional &&
        !read.coalesce && !read.binary && !read.has_word ? QUESTION_WALK_CONTINUE : QUESTION_WALK_UNKNOWN;
}

static void question_walk_type_operand(QuestionWalk *walk, bool future_identifier, bool is_or_as, const QuestionIdentifier *identifier, bool creation) {
    if (!walk->depth) {
        if (creation || is_or_as) {
            walk->allocation_type = creation;
            walk->allocation_rank = false;
        }
        if (identifier->keyword && (!strcmp(identifier->word, "switch") || !strcmp(identifier->word, "with")))
            walk->as_operand = false;
    }
    if (!walk->depth && !walk->recording && walk->confirmation_operand && walk->optional == 1 &&
        identifier->keyword && !strcmp(identifier->word, "is"))
        walk->confirmation_type = true;
    if (!future_identifier || !is_or_as || !walk->type_operand || walk->depth || !walk->mandatory) return;
    walk->mandatory--;
    walk->is_ternary_eligible = walk->future_ternary_eligible;
}

static QuestionWalkStep question_walk_creation_prefix(TSLexer *lexer, QuestionWalk *walk) {
    if (walk->depth && !walk->recording) return question_walk_creation_child(lexer, walk);
    if (walk->depth) return QUESTION_WALK_CONTINUE;
    int32_t next = question_skip_separators(lexer);
    if (walk->recording && next != '(') return QUESTION_WALK_CONTINUE;
    if (next == '[' || next == '{') return QUESTION_WALK_CONTINUE;
    if (next == '(') {
        bool tuple = false;
        if (!question_walk_creation_tuple(lexer, walk, &tuple)) return QUESTION_WALK_UNKNOWN;
        walk->allocation_type = tuple;
        return QUESTION_WALK_CONTINUE;
    } else {
        RankTypeRead read = {0};
        if (!rank_read_as_name(lexer, &read) || read.colon || read.division || read.conditional || read.coalesce || read.binary || read.has_word) return QUESTION_WALK_UNKNOWN;
    }
    return QUESTION_WALK_CONTINUE;
}

static QuestionWalkStep question_walk_creation_child(TSLexer *lexer, QuestionWalk *walk) {
    QuestionCheckpoint start = question_input_checkpoint(walk->input);
    bool complete = false;
    int32_t opening;
    if (question_skip_separators(lexer) == '(') {
        bool tuple = false;
        if (!question_walk_creation_tuple(lexer, walk, &tuple)) goto unknown;
        int32_t next = question_skip_separators(lexer);
        complete = !tuple || (next != '?' && next != '*' && next != '(' && next != '[' && next != '{');
        opening = complete ? 0 : rank_read_creation_suffix(lexer);
    } else opening = rank_read_creation_prefix(lexer);
    if (!complete && !opening) {
        question_input_restore(walk->input, start);
        return QUESTION_WALK_CONTINUE;
    }
    if (!complete) {
        advance(lexer);
        if (!rank_read_delimited(lexer, (char)opening, RANK_BODY_EXPRESSION, NULL)) goto unknown;
    }
    question_input_restore(walk->input, (QuestionCheckpoint){walk->input->cursor, start.capturing});
    return QUESTION_WALK_CONTINUE;
unknown:
    question_input_restore(walk->input, start);
    return QUESTION_WALK_UNKNOWN;
}

static bool question_walk_creation_tuple(TSLexer *lexer, QuestionWalk *walk, bool *tuple) {
    RankLiteralFrames frames = array_new();
    rank_push_code(&frames, '(', RANK_BODY_EXPRESSION, 0);
    RankGroups *groups = &array_back(&frames)->groups;
    bool recording = walk->recording;
    unsigned events = walk->events.size;
    QuestionCheckpoint checkpoint = {0};
    if (recording) checkpoint = question_input_checkpoint(walk->input);
    RankTypeRead read = {.groups = groups, .prefix = recording ? &walk->events : NULL, .prefix_all = walk->syntax_only};
    if (recording) array_push(&walk->events, '(');
    advance(lexer);
    bool type = rank_read_as_arguments(lexer, ')', &read);
    if (recording && !type) {
        *tuple = false;
        walk->events.size = events;
        question_input_restore(walk->input, checkpoint);
        array_delete(groups);
        array_delete(&frames);
        return true;
    }
    if (recording) {
        checkpoint.cursor = walk->input->cursor;
        question_input_restore(walk->input, checkpoint);
    }
    if (recording && read.prefix_done && !walk->syntax_only) {
        walk->recording = false;
        walk->found_next_question = true;
        walk->cache_shaped = false;
    }
    *tuple = type && read.root_comma;
    if (groups->size) {
        *tuple = false;
        if (read.verbatim_literal && rank_push_verbatim(lexer, &frames, RANK_BODY_EXPRESSION) == RANK_READ_UNKNOWN) {
            rank_dispose_frames(&frames, NULL, NULL);
            return false;
        }
        return rank_read_frames(lexer, &frames, NULL, 0, NULL, NULL);
    }
    array_delete(groups);
    array_delete(&frames);
    return true;
}

static void question_walk_creation_operator(QuestionWalk *walk, int32_t c) {
    if (walk->depth || !walk->allocation_type) return;
    bool value = c == -1 || c == '+' || c == '-' || c == '!' || c == '~' || c == '&' || c == '|' || c == '^' || c == '%' || c == '=';
    if (walk->allocation_rank && (c == '.' || c == '*' || c == '<' || c == '>')) value = true;
    if (value) { walk->allocation_type = false; walk->allocation_rank = false; }
}

static bool question_walk_group(TSLexer *lexer, QuestionWalk *walk, int32_t c) {
    if (question_opening_group(c)) {
        int32_t previous = walk->previous_token;
        // `!` is also the postfix null-forgiving operator, so `f!()` is an empty-argument invocation.
        bool expression = question_opening_group(previous) || (question_operator(previous) && previous != '!') ||
            previous == ',' || previous == ':' || previous == '?' || previous == '=';
        array_push(&walk->groups, c == '(' && !expression ? 'p' : (char)c);
        return true;
    }
    if (!question_closing_group(c) || !walk->groups.size) return true;
    char opening = array_pop(&walk->groups);
    if (!walk->role_active || !walk->binding) return true;
    bool matches = c == ')' ? opening == '(' || opening == 'p' : c == ']' ? opening == '[' : opening == '{';
    if (!matches) return false;
    if (opening != '(' || walk->previous_token != '(') return true;
    return question_skip_separators(lexer) == '=';
}

static QuestionWalkStep question_walk_enter_binding(Scanner *scanner, TSLexer *lexer, QuestionWalk *walk) {
    int32_t first = question_skip_separators(lexer);
    if (first == '#' || first == -2) return QUESTION_WALK_UNKNOWN;
    if (!question_walk_multidimensional_rank(lexer, walk, &first)) return QUESTION_WALK_UNKNOWN;
    if (first == ',' && !walk->nullable_context && !walk->nullable_only) {
        QuestionWalkStep step = question_walk_leading_commas(lexer, walk);
        if (step != QUESTION_WALK_CONTINUE) return step;
    }
    walk->binding = first >= 0 && first != ']' && first != ',' && !lexer->eof(lexer);
    bool nullable_rank = walk->rank_phase == RANK_NULLABLE_LAST || walk->rank_phase == RANK_NULLABLE_NEXT;
    bool expression_rank = walk->rank_phase == RANK_TERNARY || walk->rank_phase == RANK_AFTER_NULLABLE;
    bool rank_separator = first == ']' || first == ',';
    if ((nullable_rank && rank_separator) || (expression_rank && (walk->binding || first == ']'))) {
        walk->known_nullable = nullable_rank;
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
    if (question_binding_start(lexer, first)) return QUESTION_WALK_CONTINUE;
    if (first == ';' && walk->nullable_context && question_invalid_binding_has_clause(lexer, walk))
        return QUESTION_WALK_UNKNOWN;
    return QUESTION_WALK_INVALID;
}

static bool question_walk_multidimensional_rank(TSLexer *lexer, QuestionWalk *walk, int32_t *first) {
    if (*first != ',' || !walk->nullable_context || !walk->nullable_allowed || walk->case_colon_possible) return true;
    do { advance(lexer); *first = question_skip_separators(lexer); } while (*first == ',');
    if (*first != ']') return false;
    walk->known_nullable = true;
    walk->role_active = false;
    return true;
}

static QuestionWalkStep question_walk_leading_commas(TSLexer *lexer, QuestionWalk *walk) {
    do { advance(lexer); } while (question_skip_separators(lexer) == ',');
    if (lexer->lookahead == ']') return QUESTION_WALK_CONTINUE;
    if (lexer->lookahead == '#' || lexer->lookahead == -2) return QUESTION_WALK_UNKNOWN;
    walk->known_ternary = question_expression_start(lexer, lexer->lookahead) || question_invalid_binding_has_clause(lexer, walk);
    return walk->known_ternary ? QUESTION_WALK_UNKNOWN : QUESTION_WALK_INVALID;
}

static bool question_walk_operand_group(TSLexer *lexer, QuestionWalk *walk, int32_t c) {
    bool constructor = walk->allocation_type && !walk->depth && c == '(';
    if (walk->allocation_type && walk->depth == 1 && c == ']') walk->allocation_rank = true;
    if (walk->allocation_type && !walk->depth && (c == '(' || c == '{')) {
        walk->allocation_type = false;
        walk->allocation_rank = false;
    }
    if (constructor) array_push(&walk->groups, 'p');
    else if (!question_walk_group(lexer, walk, c)) return false;
    if (walk->type_rank && walk->depth == 1 && c == ']') question_walk_type_rank_end(lexer, walk);
    return true;
}

static void question_walk_type_rank_end(TSLexer *lexer, QuestionWalk *walk) {
    walk->type_rank = false;
    int32_t next = question_skip_separators(lexer);
    bool terminal = next == ';' || next == ',' || question_closing_group(next) || lexer->eof(lexer);
    if (terminal) {
        if (walk->optional) walk->optional--;
    } else if (walk->is_optional == UINT64_MAX) walk->is_eligible = false;
    else walk->is_optional++;
}

static QuestionWalkStep question_walk_literal(TSLexer *lexer, QuestionWalk *walk, int32_t c, bool first_identifier) {
    bool verbatim = c == '@';
    if (verbatim) {
        advance(lexer);
        if (lexer->lookahead != '"' && lexer->lookahead != '$') {
            QuestionIdentifier identifier;
            if (!question_identifier(lexer, true, &identifier)) return QUESTION_WALK_UNKNOWN;
            if (walk->logical_name_candidate && !walk->depth) question_walk_logical_nullable(walk);
            walk->logical_name_candidate = false;
            walk->ordinary_name_candidate = first_identifier && walk->recording && !walk->depth && walk->ordinary;
            if (walk->recording) walk->first_word = false;
            return question_walk_identifier_operand(lexer, walk, &identifier, false);
        }
    }
    return question_walk_string(lexer, walk, verbatim);
}

static QuestionWalkStep question_walk_string(TSLexer *lexer, QuestionWalk *walk, bool verbatim) {
    if (!walk->depth) walk->is_name_pending = false;
    if (walk->logical_name_candidate && !walk->recording && !walk->depth) question_walk_logical_nullable(walk);
    walk->logical_name_candidate = false;
    if (walk->recording && walk->first_word && walk->ordinary) walk->definite_ternary = true;
    bool interpolated = lexer->lookahead == '$';
    bool opaque_questions = interpolated && walk->interpolation_depth >= 0;
    bool has_question = false;
    bool valid = interpolated
        ? rank_skip_interpolated(lexer, verbatim, opaque_questions ? RANK_BODY_EXPRESSION : RANK_BODY_QUESTION_FREE, 2 * UINT8_MAX, &has_question)
        : question_skip_quoted(lexer, verbatim);
    if (has_question) walk->cache_shaped = false;
    return valid ? QUESTION_WALK_CONTINUE : QUESTION_WALK_UNKNOWN;
}

#endif
