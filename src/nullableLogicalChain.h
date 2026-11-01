#ifndef TREE_SITTER_C_SHARP_NULLABLE_LOGICAL_CHAIN_H_
#define TREE_SITTER_C_SHARP_NULLABLE_LOGICAL_CHAIN_H_

enum { RANK_LOGICAL_NULLABLE = 0x80 };

static uint32_t rank_logical_nullable_chain(TSLexer *);
static bool rank_logical_nullable_type(TSLexer *);
static int rank_logical_nullable_operand(TSLexer *);
static bool rank_logical_boundary(TSLexer *);

static bool rank_nullable_prefix_role(uint8_t role) {
    return role == RANK_NULLABLE_PREFIX || role == RANK_OWNED_NULLABLE_PREFIX || role == RANK_LOGICAL_NULLABLE;
}

static bool rank_counted_role(uint8_t role) {
    return rank_nullable_prefix_role(role) || role == RANK_ALLOCATION_MIXED;
}

static uint32_t rank_logical_nullable_scope(const Scanner *scanner, QuestionInput *input) {
    const QuestionFrame *frame = &scanner->question_frames[scanner->question_frame_count - 1];
    if (frame->case_guard || frame->pending || scanner->interpolation_stack.size) return 0;
    QuestionCheckpoint start = question_input_checkpoint(input);
    uint32_t count = rank_logical_nullable_chain(&input->lexer);
    question_input_restore(input, start);
    return count;
}

static uint32_t rank_logical_nullable_chain(TSLexer *lexer) {
    uint32_t count = 0;
    for (;;) {
        if (!rank_logical_nullable_type(lexer) || count == UINT32_MAX) return 0;
        count++;
        int continuation = rank_logical_nullable_operand(lexer);
        if (continuation <= 0) return continuation ? 0 : count;
    }
}

static bool rank_logical_nullable_type(TSLexer *lexer) {
    if (question_skip_separators(lexer) < 0) return false;
    QuestionIdentifier type;
    if (!rank_read_identifier(lexer, &type) || !rank_identifier_allowed(&type, true) ||
        question_skip_separators(lexer) != '?' || !question_read_single_question(lexer)) return false;
    bool ranked = false;
    int32_t next;
    while ((next = question_skip_separators(lexer)) == '[') {
        advance(lexer);
        while (question_skip_separators(lexer) == ',') advance(lexer);
        if (lexer->lookahead != ']') return false;
        advance(lexer);
        ranked = true;
    }
    return ranked && next >= 0;
}

static int rank_logical_nullable_operand(TSLexer *lexer) {
    if (rank_logical_boundary(lexer)) return 0;
    int32_t next = lexer->lookahead;
    if (next != '&' && next != '|') return -1;
    advance(lexer);
    if (lexer->lookahead != next) return -1;
    advance(lexer);
    if (question_skip_separators(lexer) < 0) return -1;
    QuestionIdentifier operand;
    if (!rank_read_identifier(lexer, &operand) || !rank_identifier_allowed(&operand, false)) return -1;
    if (rank_logical_boundary(lexer)) return 0;
    QuestionIdentifier keyword;
    return rank_read_identifier(lexer, &keyword) && keyword.keyword && !strcmp(keyword.word, "is") ? 1 : -1;
}

static bool rank_logical_boundary(TSLexer *lexer) {
    int32_t next = question_skip_separators(lexer);
    return next >= 0 && (next == ';' || next == ')' || next == ']' || next == '}' || next == ',' || lexer->eof(lexer));
}

#endif
