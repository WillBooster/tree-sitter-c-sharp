#ifndef TREE_SITTER_C_SHARP_QUESTION_GUARD_H_
#define TREE_SITTER_C_SHARP_QUESTION_GUARD_H_

typedef struct {
    uint32_t type_questions, questions, colons, next_type_question;
    bool eligible, complete, keyword_tail, last_type, last_is_type;
} QuestionGuardSummary;

static bool question_guard_statement_start(const QuestionIdentifier *);
static bool question_read_guard_alternative(TSLexer *, bool *);

static bool rank_guard_prefix(uint8_t role) {
    return role == RANK_GUARD_NULLABLE_PREFIX || role == RANK_GUARD_TERNARY_PREFIX;
}

static void question_guard_type(TSLexer *lexer, QuestionInput *input, QuestionGuardSummary *guard) {
    QuestionCheckpoint start = question_input_checkpoint(input);
    uint32_t prefix = 0;
    bool simple = false;
    bool target = rank_read_prefix(lexer, &simple, &prefix) && question_read_single_question(lexer);
    TSLexerPosition position;
    lexer->get_position(lexer, &position);
    guard->next_type_question = target ? position.bytes : 0;
    if (prefix) guard->eligible = false;
    question_input_restore(input, start);
}

static void question_guard_question(QuestionGuardSummary *guard, unsigned colons, uint32_t position) {
    if (!guard->eligible) return;
    if (colons || (guard->questions && !guard->last_type) || guard->questions == UINT32_MAX)
        guard->eligible = false;
    else guard->questions++;
    guard->last_type = false;
    guard->last_is_type = guard->next_type_question && position == guard->next_type_question;
}

static void question_guard_delimiter(QuestionGuardSummary *guard, int32_t c, int depth) {
    if (!guard->eligible || depth) return;
    if (c == ':') {
        if (guard->colons == UINT32_MAX) guard->eligible = false;
        else guard->colons++;
    }
    if (c == ';') guard->complete = true;
}

static bool question_guard_stop(QuestionGuardSummary *guard, const QuestionIdentifier *word, int depth) {
    bool stop = guard->eligible && guard->keyword_tail && guard->colons && !depth && question_guard_statement_start(word);
    if (stop) guard->complete = true;
    return stop;
}

static void question_read_guard_tail(TSLexer *lexer, QuestionInput *input, QuestionGuardSummary *guard, unsigned reserved) {
    QuestionCheckpoint start = question_input_checkpoint(input);
    for (;;) {
        if (guard->questions == guard->type_questions && !guard->last_type && !guard->last_is_type &&
            (uint64_t)guard->colons >= (uint64_t)reserved + guard->type_questions + 2) {
            guard->complete = true;
            break;
        }
        int32_t c = question_skip_separators(lexer);
        if (c == ';') { guard->complete = true; break; }
        QuestionCheckpoint atom = question_input_checkpoint(input);
        QuestionIdentifier word;
        bool statement = rank_read_identifier(lexer, &word) && question_guard_statement_start(&word);
        question_input_restore(input, atom);
        if (statement) { guard->complete = true; break; }
        bool colon = false;
        bool valid = c >= 0 && question_read_guard_alternative(lexer, &colon);
        if (!valid || (colon && guard->colons == UINT32_MAX)) { guard->eligible = false; break; }
        if (!colon) { guard->complete = lexer->lookahead == ';'; guard->eligible &= guard->complete; break; }
        guard->colons++;
    }
    question_input_restore(input, start);
}

static void question_save_guard_summary(Scanner *scanner, const QuestionGuardSummary *guard, unsigned reserved) {
    if (!guard->eligible || !guard->complete || !guard->keyword_tail || !guard->questions ||
        guard->questions != guard->type_questions || guard->last_type || guard->last_is_type ||
        (uint64_t)guard->colons < (uint64_t)reserved + 2) return;
    uint32_t ternaries = guard->colons - reserved - 2;
    scanner->question_rank_role = ternaries ? RANK_GUARD_TERNARY_PREFIX : RANK_GUARD_NULLABLE_PREFIX;
    scanner->question_rank_prefix_questions = ternaries && ternaries < guard->type_questions ? ternaries : guard->type_questions;
}

static bool question_read_guard_alternative(TSLexer *lexer, bool *colon) {
    RankTokens tokens = array_new();
    bool valid = rank_read_expression(lexer, &tokens, colon, RANK_ATOM);
    for (unsigned i = 0; i < tokens.size; i++) valid &= tokens.contents[i].kind != RANK_QUESTION;
    array_delete(&tokens);
    return valid;
}

static bool question_guard_statement_start(const QuestionIdentifier *word) {
    static const char *const statements[] = {"break", "continue", "return", "goto", "if", "for", "foreach", "while", "do", "try", "lock", "using", "fixed", "unsafe", "case"};
    return word->keyword && question_word_in(word->word, statements, sizeof(statements) / sizeof(statements[0]));
}

#endif
