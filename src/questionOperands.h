#ifndef TREE_SITTER_C_SHARP_QUESTION_OPERANDS_H_
#define TREE_SITTER_C_SHARP_QUESTION_OPERANDS_H_

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
    return creation ? question_walk_creation_prefix(lexer, walk) : QUESTION_WALK_CONTINUE;
}

static bool question_walk_is_name(TSLexer *lexer, QuestionWalk *walk, const QuestionIdentifier *identifier) {
    if (walk->depth || !walk->is_name_pending) return true;
    if (identifier->keyword && (!strcmp(identifier->word, "is") || !strcmp(identifier->word, "not"))) return true;
    walk->is_name_pending = false;
    if (!rank_identifier_allowed(identifier, true)) return true;
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
    if (!rank_read_as_name_suffix(lexer, read, identifier)) return false;
    if (read->questions) {
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
    if (walk->depth || (!walk->binding && !walk->recording)) return QUESTION_WALK_CONTINUE;
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

static bool question_walk_creation_tuple(TSLexer *lexer, QuestionWalk *walk, bool *tuple) {
    RankLiteralFrames frames = array_new();
    rank_push_code(&frames, '(', RANK_BODY_EXPRESSION, 0);
    RankGroups *groups = &array_back(&frames)->groups;
    bool recording = walk->recording;
    RankTypeRead read = {.groups = groups, .prefix = recording ? &walk->events : NULL};
    if (recording) array_push(&walk->events, '(');
    advance(lexer);
    bool type = rank_read_as_arguments(lexer, ')', &read);
    if (read.prefix_done) {
        walk->recording = false;
        walk->found_next_question = true;
        walk->cache_shaped = false;
    }
    if (recording && !type) {
        *tuple = false;
        return question_walk_resume_creation(lexer, walk, &read, &frames);
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

static bool question_walk_resume_creation(TSLexer *lexer, QuestionWalk *walk, const RankTypeRead *read, RankLiteralFrames *frames) {
    RankGroups *groups = &array_back(frames)->groups;
    for (unsigned i = 0; i < groups->size; i++) array_push(&walk->groups, i ? groups->contents[i] : 'p');
    walk->depth = groups->size;
    if (read->colon) { walk->cache_colon = true; walk->cache_shaped = false; }
    if ((read->coalesce || read->prefix_done) && walk->is_as_phase) walk->is_eligible = false;
    array_delete(groups);
    array_delete(frames);
    if (read->has_word && question_uncertain_keyword(&read->word) && strcmp(read->word.word, "is") && strcmp(read->word.word, "as")) return false;
    return !read->verbatim_literal || question_walk_string(lexer, walk, true) != QUESTION_WALK_UNKNOWN;
}

static void question_walk_creation_operator(QuestionWalk *walk, int32_t c) {
    if (walk->depth || !walk->allocation_type) return;
    bool value = c == -1 || c == '+' || c == '-' || c == '!' || c == '~' || c == '&' || c == '|' || c == '^' || c == '%' || c == '=';
    if (walk->allocation_rank && (c == '.' || c == '*' || c == '<' || c == '>')) value = true;
    if (value) { walk->allocation_type = false; walk->allocation_rank = false; }
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
