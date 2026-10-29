#include "tree_sitter/alloc.h"
#include "tree_sitter/array.h"
#include "tree_sitter/parser.h"

#include <string.h>
#include <wctype.h>

#include "identifierCharacters.h"

enum TokenType {
    OPT_SEMI,
    INTERPOLATION_REGULAR_START,
    INTERPOLATION_VERBATIM_START,
    INTERPOLATION_RAW_START,
    INTERPOLATION_START_QUOTE,
    INTERPOLATION_END_QUOTE,
    INTERPOLATION_OPEN_BRACE,
    INTERPOLATION_CLOSE_BRACE,
    INTERPOLATION_STRING_CONTENT,
    RAW_STRING_START,
    RAW_STRING_END,
    RAW_STRING_CONTENT,
    LAMBDA_PAREN_OPEN,
    END_OF_INPUT,
    DIRECTIVE_NEWLINE,
    FILE_DIRECTIVE_PREPROC_ARG,
    FILE_DIRECTIVE_SDK,
    FILE_DIRECTIVE_PACKAGE,
    FILE_DIRECTIVE_PROPERTY,
    FILE_DIRECTIVE_PROJECT,
    FILE_DIRECTIVE_REF,
    FILE_DIRECTIVE_INCLUDE,
    FILE_DIRECTIVE_EXCLUDE,
    FILE_DIRECTIVE_KIND,
    FILE_DIRECTIVE_LITERAL_CONTEXT,
    FILE_DIRECTIVE_NEWLINE,
    QUESTION_UNKNOWN,
    QUESTION_TERNARY,
    QUESTION_MEMBER_ACCESS,
    QUESTION_ELEMENT_ACCESS,
    QUESTION_NULLABLE,
    CASE_LABEL_COLON,
    TYPE_CONTEXT_IS,
    TYPE_CONTEXT_AS,
    QUESTION_DEFINITE_ACCESS,
    OBJECT_INDEX_START,
    SLICE_PATTERN_START,
    AMBIGUOUS_CAST_OPERAND_START,
    AMBIGUOUS_CAST_TYPE_END,
    DEFINITE_CAST_TYPE_END,
    RANGE_CAST_TYPE_END,
    NONPRIMARY_EXPRESSION_END,
    PATTERN_PAREN_END,
    PATTERN_BRACKET_END,
    BANG_OPERATOR,
    CONDITIONAL_ALTERNATIVE_START,
    STATEMENT_END,
    BLOCK_END,
    AMPERSAND_OPERATOR,
    INTERPOLATION_FORMAT_COLON,
    PRAGMA_BOUNDARY,
    PRAGMA_TEXT,
    EXPRESSION_GENERIC_END,
    DEFINITE_EXPRESSION_GENERIC_END,
    IF_ALTERNATIVE_DIRECTIVE,
    CONDITIONAL_CONSEQUENCE_START,
    EXPRESSION_GENERIC_START,
    STACKALLOC_CONTEXT,
    CASE_GUARD_WHEN,
};

typedef enum {
    REGULAR = 1 << 0,
    VERBATIM = 1 << 1,
    RAW = 1 << 2,
} StringType;

typedef struct {
    uint8_t dollar_count;
    uint8_t open_brace_count;
    uint8_t quote_count;
    uint16_t question_depth;
    StringType string_type;
} Interpolation;

static inline bool is_regular(Interpolation *interpolation) { return interpolation->string_type & REGULAR; }

static inline bool is_verbatim(Interpolation *interpolation) { return interpolation->string_type & VERBATIM; }

static inline bool is_raw(Interpolation *interpolation) { return interpolation->string_type & RAW; }

#include "questionGuard.h"

#define QUESTION_FRAME_LIMIT ((TREE_SITTER_SERIALIZATION_BUFFER_SIZE - 5) / 2)

typedef struct {
    uint8_t group;
    uint32_t pending;
    uint32_t query_pending;
    uint32_t lambda_query;
    uint32_t generic_pending;
    uint16_t rank_modes[4];
    bool query_result;
    bool lambda_result;
    bool unknown;
    bool case_colon;
    bool case_guard;
    QuestionGuardCertificate guard;
    bool force_barrier;
} QuestionFrame;

typedef struct {
    uint16_t frame;
    uint32_t pending;
    bool frame_unknown;
    bool unknown;
    bool valid;
} TernaryConfirmation;

#include "questionSuffix.h"

typedef struct {
    uint8_t quote_count;
    bool next_file_directive;
    bool question_unknown;
    bool question_type_uncertain;
    uint32_t question_access_cache;
    QuestionSuffix suffix;
    uint8_t question_rank_role;
    uint32_t question_rank_prefix_questions;
    TernaryConfirmation ternary_confirmation;
    uint16_t question_frame_count;
    QuestionFrame question_frames[QUESTION_FRAME_LIMIT];
    Array(Interpolation) interpolation_stack;
} Scanner;

static inline void advance(TSLexer *lexer) { lexer->advance(lexer, false); }

static inline void skip(TSLexer *lexer) { lexer->advance(lexer, true); }

static inline bool is_line_terminator(int32_t c) {
    return c == '\r' || c == '\n' || c == 0x85 || c == 0x2028 || c == 0x2029;
}

// Use a fixed set for end-of-input lookahead: `iswspace` depends on the C library and locale (it rejects NBSP on macOS).
// Line terminators that remain here are handled by the grammar when end-of-input lookahead fails.
static inline bool is_space_but_line_feed(int32_t c) {
    return c == '\t' || c == '\v' || c == '\f' || c == '\r' || c == ' ' || c == 0xA0 || c == 0x3000 || c == 0xFEFF;
}

static bool skip_block_comment(TSLexer *lexer);
static void skip_line_comment(TSLexer *lexer);

// The parameter-list caller requires a consumed non-comment slash to remain invalid.
static void skip_ws_and_comments(TSLexer *lexer) {
    for (;;) {
        int32_t c = lexer->lookahead;
        if (is_space_but_line_feed(c) || is_line_terminator(c)) {
            advance(lexer);
            continue;
        }
        if (c != '/') return;
        advance(lexer);
        if (lexer->lookahead == '/') skip_line_comment(lexer);
        else if (lexer->lookahead == '*') skip_block_comment(lexer);
        else return;
    }
}

static bool skip_block_comment(TSLexer *lexer) {
    advance(lexer);
    int32_t previous = 0;
    while (!lexer->eof(lexer) && !(previous == '*' && lexer->lookahead == '/')) {
        previous = lexer->lookahead;
        advance(lexer);
    }
    if (lexer->eof(lexer)) return false;
    advance(lexer);
    return true;
}

static void skip_line_comment(TSLexer *lexer) {
    while (!lexer->eof(lexer) && !is_line_terminator(lexer->lookahead)) advance(lexer);
}

static size_t consume_identifier_into(TSLexer *lexer, char *buf, size_t max) {
    size_t n = 0;
    while (is_id_continue(lexer->lookahead)) {
        if (n < max) {
            buf[n] = lexer->lookahead <= 0x7F ? (char)lexer->lookahead : '?';
        }
        n++;
        advance(lexer);
    }
    return n;
}

static bool buf_equals(const char *buf, size_t n, const char *kw) {
    size_t klen = strlen(kw);
    return n == klen && memcmp(buf, kw, klen) == 0;
}

#define QUESTION_STATE_UNKNOWN 2
#define QUESTION_STATE_EXTENDED 4
#define QUESTION_STATE_ACCESS_CACHE 8
#define QUESTION_STATE_TYPE_UNCERTAIN 16
#define QUESTION_STATE_RANK_ROLE 32
#define QUESTION_STATE_INTERPOLATION_DEPTH 64
#define QUESTION_STATE_CONFIRMATION 128

static void clear_question_rank(Scanner *scanner);

static void question_clear_suffix(Scanner *scanner) {
    question_suffix_clear(&scanner->suffix);
}

static void question_clear_access_cache(Scanner *scanner) {
    scanner->question_access_cache = 0;
    question_clear_suffix(scanner);
}

static void reset_question_context(Scanner *scanner) {
    scanner->ternary_confirmation = (TernaryConfirmation){0};
    scanner->question_unknown = false;
    scanner->question_type_uncertain = false;
    question_clear_access_cache(scanner);
    clear_question_rank(scanner);
    scanner->question_frame_count = 1;
    scanner->question_frames[0] = (QuestionFrame){0};
}

static void clear_question_rank(Scanner *scanner) {
    scanner->question_rank_role = 0;
    scanner->question_rank_prefix_questions = 0;
}

typedef enum {
    QUESTION_NOT_STARTED,
    QUESTION_MATCHED,
    QUESTION_MISMATCHED,
} QuestionScanResult;

#include "questionContext.h"
#include "questionState.h"
#include "questionProof.h"

void *tree_sitter_c_sharp_external_scanner_create() {
    Scanner *scanner = ts_calloc(1, sizeof(Scanner));
    array_init(&scanner->interpolation_stack);
    reset_question_context(scanner);
    return scanner;
}

void tree_sitter_c_sharp_external_scanner_destroy(void *payload) {
    Scanner *scanner = (Scanner *)payload;
    array_delete(&scanner->interpolation_stack);
    ts_free(scanner);
}

static unsigned interpolation_serialize(const Scanner *scanner, char *buffer, bool depths);

unsigned tree_sitter_c_sharp_external_scanner_serialize(void *payload, char *buffer) {
    Scanner *scanner = (Scanner *)payload;
    unsigned original_size = scanner->interpolation_stack.size * 4 + 3;
    if (original_size > TREE_SITTER_SERIALIZATION_BUFFER_SIZE) return 0;
    QuestionSerialization state = question_serialization_plan(scanner, TREE_SITTER_SERIALIZATION_BUFFER_SIZE - original_size);
    unsigned size = 0;
    buffer[size++] = (char)scanner->quote_count;
    buffer[size++] = question_serialization_modes(scanner, state);
    buffer[size++] = (char)scanner->interpolation_stack.size;
    size += interpolation_serialize(scanner, buffer + size, state.depths);
    question_serialize_modes(scanner, state, buffer, &size);
    question_suffix_serialize(&scanner->suffix, buffer, &size);
    return size;
}

static unsigned interpolation_serialize(const Scanner *scanner, char *buffer, bool depths) {
    unsigned size = 0;
    for (unsigned i = 0; i < scanner->interpolation_stack.size; i++) {
        Interpolation item = scanner->interpolation_stack.contents[i];
        buffer[size++] = (char)item.dollar_count;
        buffer[size++] = (char)item.open_brace_count;
        buffer[size++] = (char)item.quote_count;
        buffer[size++] = (char)item.string_type;
        if (depths) {
            buffer[size++] = (char)item.question_depth;
            buffer[size++] = (char)(item.question_depth >> 8);
        }
    }
    return size;
}

void tree_sitter_c_sharp_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
    Scanner *scanner = (Scanner *)payload;
    scanner->quote_count = 0;
    scanner->next_file_directive = false;
    array_clear(&scanner->interpolation_stack);
    reset_question_context(scanner);
    if (!length) return;
    if (length < 3) goto unknown;
    unsigned size = 0;
    scanner->quote_count = (unsigned char)buffer[size++];
    unsigned flags = (unsigned char)buffer[size++];
    scanner->next_file_directive = (flags & 1) != 0;
    unsigned count = (unsigned char)buffer[size++];
    bool depths = flags & QUESTION_STATE_INTERPOLATION_DEPTH;
    if (3 + count * (depths ? 6 : 4) > length) goto unknown;
    array_reserve(&scanner->interpolation_stack, count);
    scanner->interpolation_stack.size = count;
    for (unsigned i = 0; i < count; i++) {
        Interpolation item = {0};
        item.dollar_count = (unsigned char)buffer[size++];
        item.open_brace_count = (unsigned char)buffer[size++];
        item.quote_count = (unsigned char)buffer[size++];
        item.string_type = (unsigned char)buffer[size++];
        item.question_depth = UINT16_MAX;
        if (depths) {
            item.question_depth = (unsigned char)buffer[size++];
            item.question_depth |= (uint16_t)(unsigned char)buffer[size++] << 8;
        }
        scanner->interpolation_stack.contents[i] = item;
    }
    if (!question_read_modes(scanner, flags, buffer, length, &size)) goto unknown;
    if ((flags & QUESTION_STATE_EXTENDED) && !question_deserialize(scanner, buffer, length, &size)) goto unknown;
    if (flags & QUESTION_STATE_CONFIRMATION) {
        if (size + 7 > length) goto unknown;
        TernaryConfirmation value = {.valid = true};
        value.frame = (unsigned char)buffer[size++];
        value.frame |= (uint16_t)(unsigned char)buffer[size++] << 8;
        for (unsigned byte = 0; byte < 4; byte++) value.pending |= (uint32_t)(unsigned char)buffer[size++] << (byte * 8);
        unsigned modes = (unsigned char)buffer[size++];
        if (modes > 3 || value.frame >= scanner->question_frame_count) goto unknown;
        value.frame_unknown = modes & 1;
        value.unknown = modes & 2;
        scanner->ternary_confirmation = value;
    }
    if (size < length) question_suffix_read(&scanner->suffix, scanner->question_frame_count, buffer, length, &size);
    if (size != length) goto unknown;
    return;
unknown:
    reset_question_context(scanner);
    scanner->question_unknown = true;
}

// Outcome of `scan_lambda_paren_open` — distinguishes "didn't start"
// (lexer untouched, wrapper can fall through to other token handlers)
// from "started and failed" (lexer cursor advanced past characters
// the wrapper must not let other handlers consume — they would emit
// tokens with wrong spans, e.g. an `INTERPOLATION_REGULAR_START`
// span covering `(false, $` in `return (false, $"...");`).
typedef enum {
    LAMBDA_SCAN_NO_PAREN,         // not a '(', no advance() done
    LAMBDA_SCAN_FAILED_AFTER_PAREN, // '(' was consumed, dirty state
    LAMBDA_SCAN_SUCCESS,
} LambdaScanResult;

// Try to recognize a C# 14 simple-lambda parameter list at the current
// position. On SUCCESS, `lexer->result_symbol` is LAMBDA_PAREN_OPEN
// and `mark_end` is set on the opening '('. On NO_PAREN, the lexer is
// untouched (only `skip(lexer)` over leading whitespace, which doesn't
// participate in token boundaries). On FAILED_AFTER_PAREN, the lexer
// has advanced past at least the opening '(' and the caller must
// surface this as a false return from the external_scanner_scan
// function so tree-sitter rewinds.
//
// Grammar of the pattern (after the opening '('):
//
//   element (',' element)* ')' '=>'
//
//   element  := modifier+ identifier
//             | identifier
//
//   modifier ∈ { scoped, ref, out, in, readonly }
//
// At least one element must carry a modifier; otherwise we'd over-fire
// on plain `(x, y) => ...` which is already handled by the existing
// `_lambda_parameters` choice.
//
// Implementation note: identifier-tokens are consumed *whole* into a
// small buffer before being classified as modifier-or-name. A
// character-by-character probe against each candidate keyword would be
// unworkable because `ref` is a prefix of `readonly` (they share `re`)
// and TSLexer has no rewind primitive: any probe order leaves one of
// the two keywords unreachable. Buffering the whole identifier
// sidesteps the prefix conflict entirely.
static LambdaScanResult scan_lambda_paren_open(TSLexer *lexer) {
    // External scanners run before whitespace `extras` are skipped, so
    // we need to skip leading whitespace/comments ourselves before
    // checking for the opening '('. `skip(lexer)` consumes the char as
    // an extra (not part of any token), so even on NO_PAREN return the
    // wrapper's fall-through into other handlers is safe — those
    // handlers do their own whitespace skipping.
    while (iswspace(lexer->lookahead)) {
        skip(lexer);
    }
    if (lexer->lookahead != '(') return LAMBDA_SCAN_NO_PAREN;
    advance(lexer);
    lexer->mark_end(lexer);

    // From this point on, the lexer cursor has moved past '('. Any
    // return must be FAILED_AFTER_PAREN unless we reach SUCCESS.
    #define BAIL return LAMBDA_SCAN_FAILED_AFTER_PAREN

    // We require at least one "hard" modifier (ref/out/in/readonly) across
    // the whole list before committing. `scoped` alone is not a valid C#
    // parameter modifier — it must always combine with a hard modifier —
    // and `scoped` is also a legal type name, so accepting `(scoped x) =>`
    // as a modifier+name pair would collide with the existing
    // `parameter_list` path on input that semantically means
    // type+identifier.
    bool saw_hard_modifier = false;
    bool expecting_element = true;

    for (;;) {
        skip_ws_and_comments(lexer);
        int32_t c = lexer->lookahead;

        if (lexer->eof(lexer)) BAIL;

        if (c == ')') {
            advance(lexer);
            skip_ws_and_comments(lexer);
            if (!saw_hard_modifier) BAIL;
            if (lexer->lookahead != '=') BAIL;
            advance(lexer);
            if (lexer->lookahead != '>') BAIL;
            lexer->result_symbol = LAMBDA_PAREN_OPEN;
            return LAMBDA_SCAN_SUCCESS;
        }

        if (!expecting_element) {
            if (c != ',') BAIL;
            advance(lexer);
            expecting_element = true;
            continue;
        }

        // Consume identifier-tokens in this element. Each one is either a
        // parameter modifier (`scoped`/`ref`/`out`/`in`/`readonly`) — in which
        // case we continue looking for more — or the parameter name, which
        // ends the element. Consuming the whole token before classifying
        // avoids any need to rewind the lexer on a prefix-conflict (e.g. ref
        // vs readonly).
        bool consumed_name = false;
        while (!consumed_name) {
            skip_ws_and_comments(lexer);
            if (!is_id_start(lexer->lookahead)) BAIL;

            char buf[9];  // "readonly" is 8 chars
            size_t n = consume_identifier_into(lexer, buf, sizeof(buf));

            bool is_hard_modifier = (n <= 8) && (
                buf_equals(buf, n, "ref") ||
                buf_equals(buf, n, "out") ||
                buf_equals(buf, n, "in") ||
                buf_equals(buf, n, "readonly")
            );
            bool is_soft_modifier = (n == 6) && buf_equals(buf, n, "scoped");

            if (is_hard_modifier) {
                saw_hard_modifier = true;
            } else if (is_soft_modifier) {
                // `scoped` is a modifier only when followed by a hard
                // modifier; keep scanning. If the element turns out to
                // end with `scoped <identifier>` and no hard modifier
                // appeared, the final `saw_hard_modifier` check fails
                // and we fall back to the regular parameter_list path.
            } else {
                consumed_name = true;
            }
        }
        expecting_element = false;
    }
}
#undef BAIL

static bool scan_file_directive_prefix(TSLexer *lexer) {
    if (lexer->lookahead != '#') return false;
    advance(lexer);
    if (lexer->lookahead != ':') return false;
    advance(lexer);
    return true;
}

static bool scan_preproc_arg(TSLexer *lexer, bool opaque, enum TokenType symbol) {
    lexer->mark_end(lexer);
    while (!lexer->eof(lexer) && !is_line_terminator(lexer->lookahead)) {
        int32_t c = lexer->lookahead;
        advance(lexer);
        if (!opaque && c == '/') {
            if (lexer->lookahead == '*') break;
            if (lexer->eof(lexer) || is_line_terminator(lexer->lookahead)) {
                lexer->mark_end(lexer);
                break;
            }
            advance(lexer);
        }
        lexer->mark_end(lexer);
    }
    lexer->result_symbol = symbol;
    return true;
}

static bool is_directive_horizontal(int32_t c);
static bool scan_file_directive_kind(TSLexer *lexer);
static bool scan_pragma_boundary(TSLexer *lexer);
static bool scan_pragma_text(TSLexer *lexer);

#include "ifAlternativeDirective.h"

static QuestionScanResult scan_conditional_question(Scanner *scanner, TSLexer *lexer, const bool *valid_symbols);
static QuestionScanResult scan_type_context_keyword(Scanner *scanner, TSLexer *lexer, const bool *valid_symbols);
static QuestionScanResult scan_nonprimary_expression_end(Scanner *scanner, TSLexer *lexer, const bool *valid_symbols);
static bool scan_statement_end(Scanner *scanner, TSLexer *lexer, const bool *valid_symbols);
static bool scan_interpolation_format_colon(TSLexer *lexer);
static QuestionScanResult scan_operator_punctuation(TSLexer *lexer, const bool *valid_symbols);
static bool advance_operator_character(TSLexer *lexer);
static bool scan_ambiguous_cast_operand_start(TSLexer *lexer);
static bool scan_cast_type_end(TSLexer *lexer, const bool *valid_symbols);
static bool cast_operand_start(TSLexer *lexer, bool ambiguous, bool preferred);

static bool scan_recovery(Scanner *scanner, TSLexer *lexer, bool next_file_directive);
static bool scan_conditional_consequence(Scanner *scanner, TSLexer *lexer);

bool tree_sitter_c_sharp_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
    Scanner *scanner = (Scanner *)payload;

    uint8_t brace_advanced = 0;
    uint8_t quote_count = 0;
    bool did_advance = false;

    bool next_file_directive = scanner->next_file_directive;
    scanner->next_file_directive = false;
    if (valid_symbols[OPT_SEMI] && valid_symbols[INTERPOLATION_REGULAR_START]) {
        scanner->ternary_confirmation.valid = false;
        return scan_recovery(scanner, lexer, next_file_directive);
    }

    if (valid_symbols[CASE_GUARD_WHEN]) {
        QuestionScanResult guard = scan_case_guard_when(scanner, lexer);
        if (guard != QUESTION_NOT_STARTED) return guard == QUESTION_MATCHED;
    }
    if (valid_symbols[CONDITIONAL_CONSEQUENCE_START]) return scan_conditional_consequence(scanner, lexer);
    scanner->ternary_confirmation.valid = false;

    QuestionScanResult generic_start = scan_expression_generic_start(lexer, valid_symbols);
    if (generic_start != QUESTION_NOT_STARTED) return generic_start == QUESTION_MATCHED;

    QuestionScanResult generic_end = scan_expression_generic_end(lexer, valid_symbols);
    if (generic_end != QUESTION_NOT_STARTED) return generic_end == QUESTION_MATCHED;

    QuestionScanResult if_alternative = scan_if_alternative_directive(lexer, valid_symbols);
    if (if_alternative != QUESTION_NOT_STARTED) return if_alternative == QUESTION_MATCHED;

    if (valid_symbols[PRAGMA_BOUNDARY]) return scan_pragma_boundary(lexer);
    if (valid_symbols[PRAGMA_TEXT]) {
        while (is_directive_horizontal(lexer->lookahead)) skip(lexer);
        if (!lexer->eof(lexer) && !is_line_terminator(lexer->lookahead)) return scan_pragma_text(lexer);
    }

    if (valid_symbols[INTERPOLATION_FORMAT_COLON] && scan_interpolation_format_colon(lexer)) return true;

    if (valid_symbols[CONDITIONAL_ALTERNATIVE_START]) {
        scanner->question_type_uncertain = false;
        lexer->mark_end(lexer);
        lexer->result_symbol = CONDITIONAL_ALTERNATIVE_START;
        return true;
    }

    if (scan_statement_end(scanner, lexer, valid_symbols)) return true;

    if (valid_symbols[AMBIGUOUS_CAST_OPERAND_START]) return scan_ambiguous_cast_operand_start(lexer);

    QuestionScanResult punctuation = scan_operator_punctuation(lexer, valid_symbols);
    if (punctuation != QUESTION_NOT_STARTED) return punctuation == QUESTION_MATCHED;

    if (valid_symbols[SLICE_PATTERN_START]) {
        while (is_space_but_line_feed(lexer->lookahead) || is_line_terminator(lexer->lookahead)) skip(lexer);
        if (lexer->lookahead == '.') {
            advance(lexer);
            if (lexer->lookahead != '.') return false;
            advance(lexer);
            lexer->mark_end(lexer);
            lexer->result_symbol = SLICE_PATTERN_START;
            return true;
        }
    }

    if (valid_symbols[OBJECT_INDEX_START]) {
        while (is_space_but_line_feed(lexer->lookahead) || is_line_terminator(lexer->lookahead)) skip(lexer);
        if (lexer->lookahead == '[') {
            advance(lexer);
            lexer->mark_end(lexer);
            lexer->result_symbol = OBJECT_INDEX_START;
            return true;
        }
    }

    if (valid_symbols[NONPRIMARY_EXPRESSION_END] || valid_symbols[PATTERN_PAREN_END] || valid_symbols[PATTERN_BRACKET_END] ||
        valid_symbols[AMBIGUOUS_CAST_TYPE_END] || valid_symbols[DEFINITE_CAST_TYPE_END] || valid_symbols[RANGE_CAST_TYPE_END]) {
        QuestionScanResult closing = scan_nonprimary_expression_end(scanner, lexer, valid_symbols);
        if (closing != QUESTION_NOT_STARTED) return closing == QUESTION_MATCHED;
    }

    if (valid_symbols[TYPE_CONTEXT_IS] || valid_symbols[TYPE_CONTEXT_AS]) {
        QuestionScanResult keyword = scan_type_context_keyword(scanner, lexer, valid_symbols);
        if (keyword != QUESTION_NOT_STARTED) return keyword == QUESTION_MATCHED;
    }

    if (valid_symbols[CASE_LABEL_COLON]) {
        while (is_space_but_line_feed(lexer->lookahead) || is_line_terminator(lexer->lookahead)) skip(lexer);
        if (lexer->lookahead == ':') {
            advance(lexer);
            if (lexer->lookahead == ':') return false;
            lexer->mark_end(lexer);
            QuestionFrame *frame = &scanner->question_frames[scanner->question_frame_count - 1];
            if (!frame->case_guard || scanner->question_unknown) {
                frame->case_colon = false;
                frame->case_guard = false;
                frame->guard = (QuestionGuardCertificate){0};
            }
            lexer->result_symbol = CASE_LABEL_COLON;
            return true;
        }
    }
    if (valid_symbols[QUESTION_UNKNOWN] || valid_symbols[QUESTION_TERNARY] ||
        (valid_symbols[QUESTION_MEMBER_ACCESS] || valid_symbols[QUESTION_ELEMENT_ACCESS]) ||
        valid_symbols[QUESTION_DEFINITE_ACCESS] || valid_symbols[QUESTION_NULLABLE]) {
        QuestionScanResult question = scan_conditional_question(scanner, lexer, valid_symbols);
        if (question != QUESTION_NOT_STARTED) return question == QUESTION_MATCHED;
    }

    QuestionScanResult creation_context = scan_stackalloc_context(scanner, lexer, valid_symbols);
    if (creation_context != QUESTION_NOT_STARTED) return creation_context == QUESTION_MATCHED;

    // Lambda-paren scanning advances forward speculatively past the
    // opening `(`. If it consumes input and then bails, the lexer
    // cursor is mispositioned and must not be reused by other token
    // handlers below — they would emit tokens with spans starting at
    // the original scan position but ending at the dirty cursor (e.g.
    // an INTERPOLATION_REGULAR_START swallowing `(false, $` in
    // `return (false, $"...");`). When the scanner consumed `(` but
    // didn't confirm a lambda, return false here so tree-sitter
    // rewinds and lets the built-in `(` tokenizer match.
    if (valid_symbols[LAMBDA_PAREN_OPEN]) {
        switch (scan_lambda_paren_open(lexer)) {
            case LAMBDA_SCAN_SUCCESS:
                return true;
            case LAMBDA_SCAN_FAILED_AFTER_PAREN:
                return false;
            case LAMBDA_SCAN_NO_PAREN:
                break;  // lexer untouched; fall through
        }
    }

    if (valid_symbols[FILE_DIRECTIVE_KIND] && !valid_symbols[FILE_DIRECTIVE_LITERAL_CONTEXT] && !valid_symbols[FILE_DIRECTIVE_PREPROC_ARG] &&
        !valid_symbols[END_OF_INPUT] && !valid_symbols[DIRECTIVE_NEWLINE] && !valid_symbols[FILE_DIRECTIVE_NEWLINE] && !valid_symbols[OPT_SEMI] &&
        !valid_symbols[RAW_STRING_CONTENT] && !valid_symbols[INTERPOLATION_STRING_CONTENT]) {
        while (is_directive_horizontal(lexer->lookahead) || is_line_terminator(lexer->lookahead)) {
            skip(lexer);
        }
        if (lexer->lookahead == '#') return scan_file_directive_prefix(lexer) && scan_file_directive_kind(lexer);
    }

    if (valid_symbols[FILE_DIRECTIVE_PREPROC_ARG]) {
        while (lexer->lookahead == ' ' || lexer->lookahead == '\t' || lexer->lookahead == '\v' || lexer->lookahead == '\f') skip(lexer);
        while (is_space_but_line_feed(lexer->lookahead) && !is_line_terminator(lexer->lookahead)) advance(lexer);
        if (lexer->lookahead == '#') return scan_file_directive_prefix(lexer) && scan_preproc_arg(lexer, false, FILE_DIRECTIVE_PREPROC_ARG);
    }
    if (valid_symbols[DIRECTIVE_NEWLINE] || valid_symbols[FILE_DIRECTIVE_NEWLINE]) {
        while (is_directive_horizontal(lexer->lookahead)) skip(lexer);
        if (is_line_terminator(lexer->lookahead)) {
            bool cr = lexer->lookahead == '\r';
            advance(lexer);
            bool crlf = cr && lexer->lookahead == '\n';
            if (crlf) advance(lexer);
            lexer->mark_end(lexer);
            if (!valid_symbols[FILE_DIRECTIVE_NEWLINE] && !crlf) {
                while (is_line_terminator(lexer->lookahead)) advance(lexer);
                lexer->mark_end(lexer);
            }
            while (is_directive_horizontal(lexer->lookahead) || is_line_terminator(lexer->lookahead)) advance(lexer);
            scanner->next_file_directive = scan_file_directive_prefix(lexer);
            lexer->result_symbol = valid_symbols[FILE_DIRECTIVE_NEWLINE] ? FILE_DIRECTIVE_NEWLINE : DIRECTIVE_NEWLINE;
            return true;
        }
    }

    // A directive may end the input without a line break, which no regex token can match.
    if (valid_symbols[END_OF_INPUT]) {
        while (is_space_but_line_feed(lexer->lookahead)) {
            skip(lexer);
        }
        lexer->result_symbol = END_OF_INPUT;
        return lexer->eof(lexer);
    }

    if (valid_symbols[OPT_SEMI]) {
        lexer->result_symbol = OPT_SEMI;
        if (lexer->lookahead == ';') {
            advance(lexer);
        }
        scanner->question_type_uncertain = false;
        question_clear_access_cache(scanner);
        clear_question_rank(scanner);
        return true;
    }

    if (valid_symbols[RAW_STRING_START]) {
        while (iswspace(lexer->lookahead)) {
            skip(lexer);
        }

        if (lexer->lookahead == '"') {
            while (lexer->lookahead == '"') {
                advance(lexer);
                quote_count++;
            }

            if (quote_count >= 3) {
                lexer->result_symbol = RAW_STRING_START;
                scanner->quote_count = quote_count;
                return true;
            }
        }
    }

    if (valid_symbols[RAW_STRING_END] && lexer->lookahead == '"') {
        while (lexer->lookahead == '"') {
            advance(lexer);
            quote_count++;
        }

        if (quote_count == scanner->quote_count) {
            lexer->result_symbol = RAW_STRING_END;
            scanner->quote_count = 0;
            return true;
        }

        did_advance = quote_count > 0;
    }

    if (valid_symbols[RAW_STRING_CONTENT]) {
        while (!lexer->eof(lexer)) {
            if (lexer->lookahead == '"') {
                lexer->mark_end(lexer);
                quote_count = 0;

                while (lexer->lookahead == '"') {
                    advance(lexer);
                    quote_count++;
                }

                if (quote_count == scanner->quote_count) {
                    lexer->result_symbol = RAW_STRING_CONTENT;
                    return true;
                }
            }
            advance(lexer);
            did_advance = true;
        }
        lexer->mark_end(lexer);
        lexer->result_symbol = RAW_STRING_CONTENT;
        return true;
    }

    if (valid_symbols[INTERPOLATION_REGULAR_START] || valid_symbols[INTERPOLATION_VERBATIM_START] ||
        valid_symbols[INTERPOLATION_RAW_START]) {
        while (iswspace(lexer->lookahead)) {
            skip(lexer);
        }

        uint8_t dollar_advanced = 0;

        bool is_verbatim = false;

        if (lexer->lookahead == '@') {
            is_verbatim = true;
            advance(lexer);
        }

        while (lexer->lookahead == '$' && quote_count == 0) {
            advance(lexer);
            dollar_advanced++;
        }

        if (dollar_advanced > 0 && (lexer->lookahead == '"' || lexer->lookahead == '@')) {
            lexer->result_symbol = INTERPOLATION_REGULAR_START;
            Interpolation interpolation = {
                .dollar_count = dollar_advanced,
                .open_brace_count = 0,
                .quote_count = 0,
                .string_type = 0,
            };

            if (is_verbatim || lexer->lookahead == '@') {
                if (lexer->lookahead == '@') {
                    advance(lexer);
                    is_verbatim = true;
                }
                lexer->result_symbol = INTERPOLATION_VERBATIM_START;
                interpolation.string_type = VERBATIM;
            }

            lexer->mark_end(lexer);
            advance(lexer);
            interpolation.string_type |= REGULAR;

            if (lexer->lookahead == '"' && !is_verbatim) {
                advance(lexer);
                if (lexer->lookahead == '"') {
                    lexer->result_symbol = INTERPOLATION_RAW_START;
                    interpolation.string_type = RAW;
                }
            }
            array_push(&scanner->interpolation_stack, interpolation);

            return true;
        }
    }

    if (valid_symbols[INTERPOLATION_START_QUOTE] && scanner->interpolation_stack.size > 0) {
        Interpolation *current_interpolation = array_back(&scanner->interpolation_stack);

        while (lexer->lookahead == '"') {
            advance(lexer);
            current_interpolation->quote_count++;
            if (is_verbatim(current_interpolation) || is_regular(current_interpolation)) break;
        }

        lexer->result_symbol = INTERPOLATION_START_QUOTE;
        return current_interpolation->quote_count > 0;
    }

    if (valid_symbols[INTERPOLATION_END_QUOTE] && scanner->interpolation_stack.size > 0) {
        Interpolation *current_interpolation = array_back(&scanner->interpolation_stack);

        while (lexer->lookahead == '"') {
            advance(lexer);
            quote_count++;
            if (is_verbatim(current_interpolation) && quote_count == 2) {
                lexer->mark_end(lexer);
                did_advance = true;
                quote_count = 0;
            }
        }

        if (is_verbatim(current_interpolation) && did_advance && quote_count == 1) {
            lexer->result_symbol = INTERPOLATION_STRING_CONTENT;
            return valid_symbols[INTERPOLATION_STRING_CONTENT];
        }

        if (quote_count == current_interpolation->quote_count) {
            lexer->result_symbol = INTERPOLATION_END_QUOTE;
            array_pop(&scanner->interpolation_stack);
            return true;
        }

        did_advance = did_advance || quote_count > 0;
    }

    if (valid_symbols[INTERPOLATION_OPEN_BRACE] && scanner->interpolation_stack.size > 0) {
        Interpolation *current_interpolation = array_back(&scanner->interpolation_stack);

        if (did_advance) lexer->mark_end(lexer);

        while (lexer->lookahead == '{' && brace_advanced < current_interpolation->dollar_count) {
            advance(lexer);
            brace_advanced++;
            if (is_raw(current_interpolation) && !did_advance && brace_advanced == 1) lexer->mark_end(lexer);
        }

        if (!is_raw(current_interpolation) && brace_advanced == 1 && lexer->lookahead == '{') {
            advance(lexer);
            brace_advanced = 0;
            did_advance = true;
        }

        if (is_raw(current_interpolation) && brace_advanced == current_interpolation->dollar_count && lexer->lookahead == '{') {
            lexer->result_symbol = INTERPOLATION_STRING_CONTENT;
            return valid_symbols[INTERPOLATION_STRING_CONTENT];
        }

        if (brace_advanced > 0 && brace_advanced == current_interpolation->dollar_count &&
            (brace_advanced == 0 || lexer->lookahead != '{')) {
            if (did_advance) {
                lexer->result_symbol = INTERPOLATION_STRING_CONTENT;
                return valid_symbols[INTERPOLATION_STRING_CONTENT];
            }
            lexer->mark_end(lexer);
            current_interpolation->open_brace_count = brace_advanced;
            interpolation_question_prefix(lexer, current_interpolation, 0);
            lexer->result_symbol = INTERPOLATION_OPEN_BRACE;
            return true;
        }
    }

    if (valid_symbols[INTERPOLATION_CLOSE_BRACE] && scanner->interpolation_stack.size > 0) {
        uint8_t brace_advanced = 0;
        Interpolation *current_interpolation = array_back(&scanner->interpolation_stack);

        while (iswspace(lexer->lookahead)) {
            advance(lexer);
        }

        while (lexer->lookahead == '}') {
            advance(lexer);
            brace_advanced++;

            if (brace_advanced == current_interpolation->open_brace_count) {
                current_interpolation->open_brace_count = 0;
                lexer->mark_end(lexer);
                lexer->result_symbol = INTERPOLATION_CLOSE_BRACE;
                return true;
            }
        }

        return false;
    }

    if (valid_symbols[INTERPOLATION_STRING_CONTENT] && scanner->interpolation_stack.size > 0) {
        lexer->result_symbol = INTERPOLATION_STRING_CONTENT;
        Interpolation *current_interpolation = array_back(&scanner->interpolation_stack);

        while (!lexer->eof(lexer)) {
            if (is_raw(current_interpolation)) {
                if (lexer->lookahead == '"') {
                    lexer->mark_end(lexer);
                    advance(lexer);
                    if (lexer->lookahead == '"') {
                        advance(lexer);
                        uint8_t quote_advanced = 2;
                        while (lexer->lookahead == '"') {
                            quote_advanced++;
                            advance(lexer);
                        }
                        if (quote_advanced == current_interpolation->quote_count) {
                            return did_advance;
                        }
                    }
                }

                if (lexer->lookahead == '{') {
                    lexer->mark_end(lexer);

                    while (lexer->lookahead == '{' && brace_advanced < current_interpolation->open_brace_count) {
                        advance(lexer);
                        brace_advanced++;
                    }

                    if (brace_advanced == current_interpolation->open_brace_count &&
                        (brace_advanced == 0 || lexer->lookahead != '{')) {
                        return did_advance;
                    }
                }
            }

            else if (is_verbatim(current_interpolation)) {
                if (lexer->lookahead == '"') {
                    lexer->mark_end(lexer);
                    advance(lexer);
                    if (lexer->lookahead == '"') {
                        advance(lexer);
                        did_advance = true;
                        continue;
                    }
                    return did_advance;
                }

                if (lexer->lookahead == '{') {
                    lexer->mark_end(lexer);

                    while (lexer->lookahead == '{' && brace_advanced < current_interpolation->open_brace_count) {
                        advance(lexer);
                        brace_advanced++;
                    }

                    if (brace_advanced == current_interpolation->open_brace_count &&
                        (brace_advanced == 0 || lexer->lookahead != '{')) {
                        return did_advance;
                    }
                }
            }

            else if (is_regular(current_interpolation)) {
                if (lexer->lookahead == '\\' || is_line_terminator(lexer->lookahead) || lexer->lookahead == '"') {
                    lexer->mark_end(lexer);
                    return did_advance;
                }

                if (lexer->lookahead == '{') {
                    lexer->mark_end(lexer);

                    while (lexer->lookahead == '{' && brace_advanced < current_interpolation->open_brace_count) {
                        advance(lexer);
                        brace_advanced++;
                    }

                    if (brace_advanced == current_interpolation->open_brace_count &&
                        (brace_advanced == 0 || lexer->lookahead != '{')) {
                        return did_advance;
                    }
                }
            }

            if (lexer->lookahead != '{') {
                brace_advanced = 0;
            }
            advance(lexer);
            did_advance = true;
        }

        lexer->mark_end(lexer);
        return did_advance;
    }

    return false;
}

static bool scan_conditional_consequence(Scanner *scanner, TSLexer *lexer) {
    TernaryConfirmation value = scanner->ternary_confirmation;
    if (!scanner->suffix.confirm || value.valid) question_clear_suffix(scanner);
    scanner->suffix.confirm = false;
    if (value.valid && value.frame < scanner->question_frame_count) {
        QuestionFrame *frame = &scanner->question_frames[value.frame];
        if (scanner->question_unknown != value.unknown) question_clear_rank_from(scanner, 0);
        else if (frame->pending != value.pending || frame->unknown != value.frame_unknown)
            question_clear_rank_from(scanner, value.frame + 1);
        scanner->question_frames[value.frame].pending = value.pending;
        scanner->question_frames[value.frame].unknown = value.frame_unknown;
        scanner->question_unknown = value.unknown;
    }
    scanner->ternary_confirmation.valid = false;
    scanner->question_type_uncertain = false;
    lexer->mark_end(lexer);
    lexer->result_symbol = CONDITIONAL_CONSEQUENCE_START;
    return true;
}

static bool scan_ambiguous_cast_operand_start(TSLexer *lexer) {
    lexer->mark_end(lexer);
    if (!cast_operand_start(lexer, true, false)) return false;
    lexer->result_symbol = AMBIGUOUS_CAST_OPERAND_START;
    return true;
}


static bool scan_interpolation_format_colon(TSLexer *lexer) {
    while (is_space_but_line_feed(lexer->lookahead) || is_line_terminator(lexer->lookahead)) skip(lexer);
    if (lexer->lookahead != ':') return false;
    advance(lexer);
    lexer->mark_end(lexer);
    lexer->result_symbol = INTERPOLATION_FORMAT_COLON;
    return true;
}

static bool scan_statement_end(Scanner *scanner, TSLexer *lexer, const bool *valid_symbols) {
    if (!valid_symbols[STATEMENT_END] && !valid_symbols[BLOCK_END]) return false;
    if (!scanner->question_type_uncertain && !scanner->question_rank_role && !scanner->question_access_cache) return false;
    while (is_space_but_line_feed(lexer->lookahead) || is_line_terminator(lexer->lookahead)) skip(lexer);
    unsigned end = lexer->lookahead == ';' ? STATEMENT_END : BLOCK_END;
    if ((lexer->lookahead != ';' && lexer->lookahead != '}') || !valid_symbols[end]) return false;
    if (end == STATEMENT_END && valid_symbols[OPT_SEMI]) return false;
    advance(lexer);
    lexer->mark_end(lexer);
    scanner->question_type_uncertain = false;
    question_clear_access_cache(scanner);
    clear_question_rank(scanner);
    lexer->result_symbol = end;
    return true;
}

static QuestionScanResult scan_operator_punctuation(TSLexer *lexer, const bool *valid_symbols) {
    if (!valid_symbols[BANG_OPERATOR] && !valid_symbols[AMPERSAND_OPERATOR]) return QUESTION_NOT_STARTED;
    while (is_space_but_line_feed(lexer->lookahead) || is_line_terminator(lexer->lookahead)) skip(lexer);
    unsigned symbol;
    if (valid_symbols[BANG_OPERATOR] && lexer->lookahead == '!') symbol = BANG_OPERATOR;
    else if (valid_symbols[AMPERSAND_OPERATOR] && lexer->lookahead == '&') symbol = AMPERSAND_OPERATOR;
    else return QUESTION_NOT_STARTED;
    if (!advance_operator_character(lexer)) return QUESTION_MISMATCHED;
    lexer->mark_end(lexer);
    lexer->result_symbol = symbol;
    return QUESTION_MATCHED;
}

static QuestionScanResult scan_conditional_question(Scanner *scanner, TSLexer *lexer, const bool *valid_symbols) {
    while (is_space_but_line_feed(lexer->lookahead) || is_line_terminator(lexer->lookahead)) skip(lexer);
    if (lexer->lookahead != '?') return QUESTION_NOT_STARTED;
    const Interpolation *interpolation = question_interpolation(scanner);
    bool interpolation_root = interpolation && !interpolation->question_depth;
    advance(lexer);
    lexer->mark_end(lexer);
    if (lexer->lookahead == '?') return QUESTION_MISMATCHED;
    QuestionFollowing next = question_skip_separators(lexer) == -1 ? (QuestionFollowing){.token = '/'} : question_following(lexer);
    const QuestionFrame *frame = &scanner->question_frames[scanner->question_frame_count - 1];
    if (interpolation_root && next.token == '[' && !next.member && !scanner->question_unknown && !frame->unknown &&
        scanner->question_type_uncertain && scanner->question_rank_role == RANK_TERNARY && !scanner->question_rank_prefix_questions)
        return QUESTION_MISMATCHED;
    scanner->question_frames[scanner->question_frame_count - 1].case_colon |= valid_symbols[CASE_LABEL_COLON];
    bool known_ternary = false;
    if (next.member) scanner->question_type_uncertain = false;
    bool known_nullable = (next.token == '{' && frame->case_guard) || next.token == ')' || next.token == ',' || next.token == ':' || next.token == ';' ||
        (valid_symbols[QUESTION_NULLABLE] &&
         (next.token == '>' || next.token == '/' || ((!valid_symbols[QUESTION_TERNARY] || next.token == '?') && next.token != '[' && !next.member)));
    bool dimension_expression = false;
    uint8_t rank_phase = question_take_rank(scanner, &known_nullable, &dimension_expression);
    if (frame->case_guard && (frame->guard.role & GUARD_ROLE_MASK) &&
        (frame->guard.role & GUARD_ROLE_MASK) != GUARD_NULLABLE_BOUND && !known_nullable &&
        next.token != '[' && !next.member && (next.token == '.' || question_expression_start(lexer, next.token)))
        rank_phase = RANK_PATTERN_COMPLETE;
    bool owned_type_prefix = rank_phase == RANK_OWNED_NULLABLE_PREFIX;
    if (owned_type_prefix) rank_phase = RANK_NONE;
    if ((!scanner->question_type_uncertain && rank_phase != RANK_PATTERN_COMPLETE) || scanner->question_unknown ||
        (frame->unknown && (frame->case_guard || rank_phase != RANK_TERNARY)) ||
        (next.token != '[' && !(frame->case_guard && rank_phase == RANK_PATTERN_COMPLETE && !next.member)))
        rank_phase = RANK_NONE;
    unsigned context_flags = (owned_type_prefix ? QUESTION_TYPE_PREFIX : 0) | (dimension_expression ? QUESTION_DIMENSION_EXPRESSION : 0) |
        (valid_symbols[QUESTION_DEFINITE_ACCESS] ? QUESTION_EXPRESSION_RECEIVER : 0) |
        (valid_symbols[QUESTION_ELEMENT_ACCESS] ? QUESTION_ACCESS_ALTERNATIVE : 0) |
        (valid_symbols[CASE_LABEL_COLON] ? QUESTION_CASE_COLON : 0) |
        (valid_symbols[QUESTION_NULLABLE] ? QUESTION_NULLABLE_ALLOWED : 0) |
        (valid_symbols[QUESTION_NULLABLE] && !valid_symbols[QUESTION_TERNARY] ? QUESTION_NULLABLE_ONLY : 0);
    bool preserve_unknown = frame->case_guard
        ? valid_symbols[QUESTION_UNKNOWN] && !valid_symbols[QUESTION_NULLABLE] && next.token != '[' && !next.member && rank_phase != RANK_PATTERN_COMPLETE
        : valid_symbols[CASE_LABEL_COLON];
    unsigned role = prepare_question_context(scanner, lexer, next, &known_nullable,
        context_flags, rank_phase, &known_ternary);
    if (known_ternary && preserve_unknown) role = 0;
    if (next.member) role = 1;
    if (lexer->log) lexer->log(lexer, "question_role role=%u access=%d ternary=%d nullable=%d unknown=%d", role,
        (valid_symbols[QUESTION_MEMBER_ACCESS] || valid_symbols[QUESTION_ELEMENT_ACCESS]), valid_symbols[QUESTION_TERNARY],
        valid_symbols[QUESTION_NULLABLE], valid_symbols[QUESTION_UNKNOWN]);
    QuestionScanResult result = select_question_symbol(lexer, valid_symbols, &next, role, known_nullable, known_ternary);
    if (result == QUESTION_MATCHED && lexer->result_symbol == QUESTION_TERNARY)
        scanner->question_type_uncertain = false;
    return result;
}

static QuestionScanResult scan_nonprimary_expression_end(Scanner *scanner, TSLexer *lexer, const bool *valid_symbols) {
    while (is_space_but_line_feed(lexer->lookahead) || is_line_terminator(lexer->lookahead)) skip(lexer);
    unsigned symbol = 0;
    bool cast = lexer->lookahead == ')' && (valid_symbols[AMBIGUOUS_CAST_TYPE_END] || valid_symbols[DEFINITE_CAST_TYPE_END] || valid_symbols[RANGE_CAST_TYPE_END]);
    if (lexer->lookahead == '}' && valid_symbols[NONPRIMARY_EXPRESSION_END]) symbol = NONPRIMARY_EXPRESSION_END;
    else if (lexer->lookahead == ')' && valid_symbols[PATTERN_PAREN_END]) symbol = PATTERN_PAREN_END;
    else if (lexer->lookahead == ']' && valid_symbols[PATTERN_BRACKET_END]) symbol = PATTERN_BRACKET_END;
    else if (!cast) return QUESTION_NOT_STARTED;
    advance(lexer);
    lexer->mark_end(lexer);
    int32_t following = question_skip_separators(lexer);
    if (following < 0) return QUESTION_MISMATCHED;
    if (cast && scan_cast_type_end(lexer, valid_symbols)) return QUESTION_MATCHED;
    if (!symbol || following != '?' || !question_read_single_question(lexer)) return QUESTION_MISMATCHED;
    scanner->question_rank_role = RANK_PATTERN_COMPLETE;
    scanner->question_rank_prefix_questions = 0;
    question_clear_access_cache(scanner);
    lexer->result_symbol = symbol;
    return QUESTION_MATCHED;
}

static bool scan_cast_type_end(TSLexer *lexer, const bool *valid_symbols) {
    bool normal = valid_symbols[AMBIGUOUS_CAST_TYPE_END] || valid_symbols[DEFINITE_CAST_TYPE_END];
    bool ambiguous = !valid_symbols[DEFINITE_CAST_TYPE_END];
    unsigned symbol = ambiguous ? AMBIGUOUS_CAST_TYPE_END : DEFINITE_CAST_TYPE_END;
    if (question_skip_separators(lexer) == '.') {
        advance(lexer);
        if (lexer->lookahead == '.' && valid_symbols[RANGE_CAST_TYPE_END]) symbol = RANGE_CAST_TYPE_END;
        else if (!normal || lexer->lookahead < '0' || lexer->lookahead > '9') return false;
    } else if (!normal || !cast_operand_start(lexer, ambiguous, true)) return false;
    lexer->result_symbol = symbol;
    return true;
}

static bool cast_operand_start(TSLexer *lexer, bool ambiguous, bool preferred) {
    int32_t next = question_skip_separators(lexer);
    if (ambiguous && (next == '+' || next == '-' || next == '*' || next == '&' || next == '^')) return false;
    bool prefix = false;
    bool only_bangs = next == '!';
    while (next == '!' || next == '~' || next == '+' || next == '-' || next == '*' || next == '&' || next == '^') {
        prefix = true;
        only_bangs &= next == '!';
        if (!advance_operator_character(lexer)) return false;
        next = question_skip_separators(lexer);
    }
    if (preferred && (next == '#' || (ambiguous && only_bangs && (next == '(' || next == '[')))) return false;
    if (next < 0 || next == ')' || next == ']' || next == '}' || next == '{' || next == ',' || next == ':' || next == ';' || next == '?' ||
        next == '=' || next == '|' || next == '<' || next == '>' || next == '/' || next == '%' || !next) return false;
    if (next == '.') {
        advance(lexer);
        return (prefix && lexer->lookahead == '.') || (lexer->lookahead >= '0' && lexer->lookahead <= '9');
    }
    if (ambiguous && !prefix && next == '[') {
        advance(lexer);
        return question_skip_separators(lexer) == ']';
    }
    if (!is_id_start(next) && next != '\\') return true;
    QuestionIdentifier identifier;
    if (!question_identifier(lexer, false, &identifier)) return false;
    if (!identifier.keyword) return true;
    if (!strcmp(identifier.word, "is") || !strcmp(identifier.word, "as")) return false;
    if (!preferred) return true;
    static const char *const continuations[] = {
        "switch", "when", "with", "and", "or", "not", "from", "join", "on", "equals", "by", "into",
        "where", "select", "group", "orderby", "let", "ascending", "descending"
    };
    return !question_word_in(identifier.word, continuations, sizeof(continuations) / sizeof(continuations[0]));
}

static bool advance_operator_character(TSLexer *lexer) {
    int32_t current = lexer->lookahead;
    advance(lexer);
    if (current == '!') return lexer->lookahead != '=';
    return current != '&' || (lexer->lookahead != '&' && lexer->lookahead != '=');
}


static QuestionScanResult scan_type_context_keyword(Scanner *scanner, TSLexer *lexer, const bool *valid_symbols) {
    while (is_space_but_line_feed(lexer->lookahead) || is_line_terminator(lexer->lookahead)) skip(lexer);
    unsigned symbol;
    if (lexer->lookahead == 'i' && valid_symbols[TYPE_CONTEXT_IS]) symbol = TYPE_CONTEXT_IS;
    else if (lexer->lookahead == 'a' && valid_symbols[TYPE_CONTEXT_AS]) symbol = TYPE_CONTEXT_AS;
    else return QUESTION_NOT_STARTED;
    char word[3] = {0};
    size_t size = consume_identifier_into(lexer, word, sizeof(word));
    bool matched = symbol == TYPE_CONTEXT_IS ? buf_equals(word, size, "is") : buf_equals(word, size, "as");
    int32_t next = lexer->lookahead;
    if (!matched || next == '\\' || (next > 0x7F && !is_directive_horizontal(next) && !is_line_terminator(next)))
        return QUESTION_MISMATCHED;
    const QuestionFrame *frame = &scanner->question_frames[scanner->question_frame_count - 1];
    scanner->question_type_uncertain = true;
    question_clear_access_cache(scanner);
    clear_question_rank(scanner);
    lexer->mark_end(lexer);
    if (!scanner->question_unknown && !frame->unknown) {
        QuestionInput input = question_input_create(lexer);
        QuestionCheckpoint start = question_input_checkpoint(&input);
        if (symbol == TYPE_CONTEXT_IS)
            scanner->question_rank_role = rank_stream_input(&input.lexer, scanner, &scanner->question_rank_prefix_questions, &input);
        else if (frame->case_guard)
            scanner->question_rank_role = question_guard_as_role(&input, &scanner->question_rank_prefix_questions, frame->pending);
        question_input_restore(&input, start);
        question_prepare_type_prefix(scanner, &input);
        array_delete(&input.characters);
    }
    if (!scanner->question_rank_role) scanner->question_rank_prefix_questions = 0;
    lexer->result_symbol = symbol;
    return QUESTION_MATCHED;
}

static bool is_directive_horizontal(int32_t c) {
    return c == ' ' || c == '\t' || c == '\v' || c == '\f' || c == 0xA0 || c == 0x1680 ||
        (c >= 0x2000 && c <= 0x200A) || c == 0x202F || c == 0x205F || c == 0x3000 || c == 0xFEFF;
}

static bool scan_pragma_boundary(TSLexer *lexer) {
    if (is_directive_identifier_continue(lexer->lookahead)) return false;
    lexer->mark_end(lexer);
    if (lexer->lookahead == '\\') {
        advance(lexer);
        if (lexer->lookahead == 'u' || lexer->lookahead == 'U') return false;
    }
    lexer->result_symbol = PRAGMA_BOUNDARY;
    return true;
}

static bool scan_pragma_text(TSLexer *lexer) {
    char name[8];
    size_t length = 0;
    while (length < sizeof(name) && lexer->lookahead >= 'a' && lexer->lookahead <= 'z') {
        name[length++] = (char)lexer->lookahead;
        advance(lexer);
    }
    if (!is_directive_identifier_continue(lexer->lookahead) && !is_id_continue(lexer->lookahead) &&
        lexer->lookahead != '\\' &&
        (buf_equals(name, length, "warning") || buf_equals(name, length, "checksum"))) return false;
    return scan_preproc_arg(lexer, true, PRAGMA_TEXT);
}

static bool scan_file_directive_kind(TSLexer *lexer) {
    char kind[9] = {0};
    unsigned length = 0;
    while (!lexer->eof(lexer) && !is_directive_horizontal(lexer->lookahead) && !is_line_terminator(lexer->lookahead)) {
        int32_t c = lexer->lookahead;
        if (c >= 'A' && c <= 'Z') c += 'a' - 'A';
        if (length < sizeof(kind) - 1) kind[length] = c > 0 && c < 128 ? c : '?';
        if (length < sizeof(kind)) length++;
        advance(lexer);
    }
    const char *kinds[] = {"sdk", "package", "property", "project", "ref", "include", "exclude"};
    lexer->result_symbol = FILE_DIRECTIVE_KIND;
    if (length < sizeof(kind)) {
        for (unsigned i = 0; i < sizeof(kinds) / sizeof(kinds[0]); i++) {
            if (strcmp(kind, kinds[i]) == 0) {
                lexer->result_symbol = FILE_DIRECTIVE_SDK + i;
                break;
            }
        }
    }
    lexer->mark_end(lexer);
    return true;
}

static bool scan_interpolation_recovery(Scanner *scanner, TSLexer *lexer) {
    Interpolation *interpolation = array_back(&scanner->interpolation_stack);
    bool closes_hole = lexer->lookahead == '}';
    bool line_end = false;
    if (closes_hole) {
        if (!interpolation->open_brace_count) return false;
        unsigned braces = 0;
        while (lexer->lookahead == '}' && braces < interpolation->open_brace_count) {
            advance(lexer);
            braces++;
        }
        if (braces != interpolation->open_brace_count) return false;
        lexer->mark_end(lexer);
        if (is_regular(interpolation) && !is_verbatim(interpolation)) {
            while (is_directive_horizontal(lexer->lookahead)) advance(lexer);
            line_end = is_line_terminator(lexer->lookahead);
        }
    }
    unsigned quotes = 0;
    while (lexer->lookahead == '"' && quotes < interpolation->quote_count) {
        advance(lexer);
        quotes++;
    }
    if (!line_end && (!quotes || quotes != interpolation->quote_count || lexer->lookahead == '"')) return false;
    if (closes_hole) {
        interpolation->open_brace_count = 0;
        lexer->result_symbol = INTERPOLATION_CLOSE_BRACE;
    } else {
        array_pop(&scanner->interpolation_stack);
        lexer->result_symbol = INTERPOLATION_END_QUOTE;
    }
    return true;
}

static bool scan_recovery(Scanner *scanner, TSLexer *lexer, bool next_file_directive) {
    scanner->question_unknown = true; scanner->question_access_cache = 0;
    clear_question_rank(scanner);
    bool line_start = next_file_directive;
    while (is_directive_horizontal(lexer->lookahead) || is_line_terminator(lexer->lookahead)) {
        if (is_line_terminator(lexer->lookahead)) line_start = true;
        skip(lexer);
    }
    if (scanner->interpolation_stack.size && (lexer->lookahead == '"' || lexer->lookahead == '}')) {
        return scan_interpolation_recovery(scanner, lexer);
    }
    if (!scan_file_directive_prefix(lexer)) return false;
    return line_start ? scan_file_directive_kind(lexer) : scan_preproc_arg(lexer, true, FILE_DIRECTIVE_PREPROC_ARG);
}
