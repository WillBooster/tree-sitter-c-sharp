#ifndef TREE_SITTER_C_SHARP_QUESTION_OPERANDS_H_
#define TREE_SITTER_C_SHARP_QUESTION_OPERANDS_H_

static QuestionWalkStep question_walk_identifier_operand(TSLexer *lexer, QuestionWalk *walk, const QuestionIdentifier *identifier, bool creation) {
    bool own_as_type = identifier->keyword && !strcmp(identifier->word, "as") && !walk->depth &&
        walk->binding && walk->recording && !walk->root_colons;
    if (own_as_type) return question_walk_as_prefix(lexer);
    if (walk->as_operand && !walk->depth && !(identifier->keyword && !strcmp(identifier->word, "as"))) {
        RankTypeRead read = {0};
        if (!rank_read_as_name_suffix(lexer, &read, identifier)) return QUESTION_WALK_UNKNOWN;
        if (read.division) walk->as_operand = false;
        if (read.questions) {
            walk->found_next_question = true;
            walk->recording = false;
            walk->cache_shaped = false;
        }
    }
    return creation ? question_walk_creation_prefix(lexer, walk) : QUESTION_WALK_CONTINUE;
}

static QuestionWalkStep question_walk_as_prefix(TSLexer *lexer) {
    if (question_skip_separators(lexer) == '(') return QUESTION_WALK_CONTINUE;
    RankTypeRead read = {0};
    return rank_read_as_name(lexer, &read) && !read.colon && !read.division && !read.conditional &&
        !read.coalesce && !read.binary && !read.has_word ? QUESTION_WALK_CONTINUE : QUESTION_WALK_UNKNOWN;
}

static void question_walk_type_operand(QuestionWalk *walk, bool future_identifier, bool is_or_as, const QuestionIdentifier *identifier, bool creation) {
    if (!walk->depth) {
        if (creation) walk->allocation_type = true;
        else if (is_or_as) walk->allocation_type = false;
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
    if (walk->recording || walk->depth || !walk->binding) return QUESTION_WALK_CONTINUE;
    int32_t next = question_skip_separators(lexer);
    if (next == '(' || next == '[' || next == '{') return QUESTION_WALK_CONTINUE;
    RankTypeRead read = {0};
    if (!rank_read_as_name(lexer, &read) || read.colon || read.division || read.conditional || read.coalesce || read.binary || read.has_word) return QUESTION_WALK_UNKNOWN;
    next = question_skip_separators(lexer);
    while (next == '?' || next == '*' || next == '[') {
        if (!question_walk_creation_suffix(lexer, walk, next)) return QUESTION_WALK_CONTINUE;
        next = question_skip_separators(lexer);
    }
    return next == '(' || next == '{' ? QUESTION_WALK_CONTINUE : QUESTION_WALK_UNKNOWN;
}

static bool question_walk_creation_suffix(TSLexer *lexer, QuestionWalk *walk, int32_t suffix) {
    if (suffix != '[') {
        advance(lexer);
        return true;
    }
    if (rank_read_as_rank(lexer)) return true;
    array_push(&walk->groups, '[');
    walk->depth++;
    return false;
}

static bool question_walk_operand_group(TSLexer *lexer, QuestionWalk *walk, int32_t c) {
    if (walk->allocation_type && !walk->depth &&
        (c == '(' || c == '{' || (c == '[' && question_skip_separators(lexer) != ',' && lexer->lookahead != ']')))
        walk->allocation_type = false;
    if (!question_walk_group(lexer, walk, c)) return false;
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

#endif
