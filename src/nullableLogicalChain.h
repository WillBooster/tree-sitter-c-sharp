#ifndef TREE_SITTER_C_SHARP_NULLABLE_LOGICAL_CHAIN_H_
#define TREE_SITTER_C_SHARP_NULLABLE_LOGICAL_CHAIN_H_

enum { RANK_LOGICAL_NULLABLE = 0x80, RANK_LOGICAL_REFUSAL_TAG = 0xAB };

static uint32_t rank_logical_nullable_chain(TSLexer *, bool *);
static bool rank_logical_nullable_type(TSLexer *);
static int rank_logical_nullable_operand(TSLexer *);
static bool rank_logical_boundary(TSLexer *);

static bool rank_nullable_prefix_role(uint8_t role) {
    return role == RANK_NULLABLE_PREFIX || role == RANK_OWNED_NULLABLE_PREFIX || role == RANK_LOGICAL_NULLABLE;
}

static bool rank_counted_role(uint8_t role) {
    return rank_nullable_prefix_role(role) || role == RANK_ALLOCATION_MIXED;
}

static uint32_t rank_logical_nullable_scope(Scanner *scanner, QuestionInput *input) {
    if (scanner->logical_refusals) {
        scanner->logical_refusals--;
        return 0;
    }
    const QuestionFrame *frame = &scanner->question_frames[scanner->question_frame_count - 1];
    if (frame->case_guard || frame->pending || scanner->interpolation_stack.size ||
        scanner->suffix.index < scanner->suffix.count) return 0;
    QuestionCheckpoint start = question_input_checkpoint(input);
    bool complete = false;
    uint32_t count = rank_logical_nullable_chain(&input->lexer, &complete);
    question_input_restore(input, start);
    if (complete) return count;
    scanner->logical_refusals = count ? count - 1 : 0;
    return 0;
}

static uint32_t rank_logical_nullable_chain(TSLexer *lexer, bool *complete) {
    uint32_t count = 0;
    for (;;) {
        if (!rank_logical_nullable_type(lexer)) return count;
        if (count == UINT32_MAX) return 0;
        count++;
        int continuation = rank_logical_nullable_operand(lexer);
        if (continuation > 0) continue;
        *complete = continuation == 0;
        return count;
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

static void rank_logical_serialize_refusals(const Scanner *scanner, char *buffer, unsigned *size) {
    if (!scanner->logical_refusals || scanner->suffix.index < scanner->suffix.count ||
        *size + 5 > TREE_SITTER_SERIALIZATION_BUFFER_SIZE) return;
    buffer[(*size)++] = (char)RANK_LOGICAL_REFUSAL_TAG;
    for (unsigned byte = 0; byte < 4; byte++)
        buffer[(*size)++] = (char)(scanner->logical_refusals >> (byte * 8));
}

static bool rank_logical_read_tail(Scanner *scanner, const char *buffer, unsigned length, unsigned *size) {
    if (*size == length) return true;
    if ((unsigned char)buffer[*size] != RANK_LOGICAL_REFUSAL_TAG) {
        question_suffix_read(&scanner->suffix, scanner->question_frame_count, buffer, length, size);
        return true;
    }
    if (length - *size != 5) return false;
    (*size)++;
    for (unsigned byte = 0; byte < 4; byte++)
        scanner->logical_refusals |= (uint32_t)(unsigned char)buffer[(*size)++] << (byte * 8);
    return scanner->logical_refusals != 0;
}

#endif
