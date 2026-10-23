#ifndef TREE_SITTER_C_SHARP_QUESTION_LITERALS_H_
#define TREE_SITTER_C_SHARP_QUESTION_LITERALS_H_

typedef Array(char) RankGroups;
typedef enum { RANK_READ_UNKNOWN, RANK_READ_MORE, RANK_READ_DONE, RANK_READ_TOKEN } RankReadStep;
typedef enum { RANK_BODY_BRACKET, RANK_BODY_EXPRESSION, RANK_BODY_QUESTION_FREE, RANK_BODY_INTERPOLATION_QUESTION_FREE } RankBodyMode;
typedef struct {
    RankGroups groups;
    RankBodyMode mode;
    unsigned quotes, dollars, format_braces, identifiers;
    uint32_t questions;
    bool paired_question;
    bool string, verbatim, content, access, colon, question;
} RankLiteralFrame;
typedef Array(RankLiteralFrame) RankLiteralFrames;

static bool question_skip_quoted(TSLexer *lexer, bool verbatim);
static bool question_skip_raw_quoted(TSLexer *lexer, unsigned count);
static bool question_skip_character(TSLexer *lexer);
static bool question_character_escape(TSLexer *lexer);
static bool question_skip_regular_quoted(TSLexer *lexer, int32_t quote, bool verbatim);

static bool rank_read_delimited(TSLexer *, char, RankBodyMode, bool *);
static bool rank_read_question_prefix(TSLexer *, char, uint32_t *);
static RankReadStep rank_skip_literal(TSLexer *, int32_t, RankBodyMode, bool *, unsigned);
static bool rank_skip_interpolated(TSLexer *, bool, RankBodyMode, unsigned, bool *);
static bool rank_read_frames(TSLexer *, RankLiteralFrames *, bool *, unsigned, bool *, uint32_t *);
static bool rank_collect_frame(const RankLiteralFrame *, bool *, bool *, uint32_t *);
static void rank_push_code(RankLiteralFrames *, char, RankBodyMode, unsigned);
static RankReadStep rank_read_code_step(TSLexer *, RankLiteralFrames *);
static RankReadStep rank_read_code_question(TSLexer *, RankLiteralFrame *);
static RankReadStep rank_read_code_identifier(TSLexer *, RankLiteralFrame *);
static RankReadStep rank_read_string_step(TSLexer *, RankLiteralFrames *);
static RankReadStep rank_read_raw_string_step(TSLexer *, RankLiteralFrames *);
static RankReadStep rank_push_literal(TSLexer *, RankLiteralFrames *, int32_t, RankBodyMode);
static RankReadStep rank_push_verbatim(TSLexer *, RankLiteralFrames *, RankBodyMode);
static void rank_dispose_frames(RankLiteralFrames *, bool *, bool *);
static RankReadStep rank_push_interpolated(TSLexer *, RankLiteralFrames *, bool, RankBodyMode);
static RankReadStep rank_close_delimited(TSLexer *, RankGroups *, int32_t, unsigned);
static bool rank_read_closing_braces(TSLexer *, unsigned);
static bool rank_read_format(TSLexer *, unsigned);
static unsigned rank_read_character_run(TSLexer *, int32_t);

static bool rank_read_delimited(TSLexer *lexer, char opening, RankBodyMode mode, bool *force_unsafe) {
    RankLiteralFrames frames = array_new();
    rank_push_code(&frames, opening, mode, 0);
    return rank_read_frames(lexer, &frames, force_unsafe, 0, NULL, NULL);
}

static bool rank_read_question_prefix(TSLexer *lexer, char opening, uint32_t *questions) {
    RankLiteralFrames frames = array_new();
    rank_push_code(&frames, opening, RANK_BODY_EXPRESSION, 0);
    return rank_read_frames(lexer, &frames, NULL, 0, NULL, questions);
}

static RankReadStep rank_skip_literal(TSLexer *lexer, int32_t c, RankBodyMode mode, bool *force_unsafe, unsigned frame_limit) {
    RankLiteralFrames frames = array_new();
    RankReadStep step = rank_push_literal(lexer, &frames, c, mode);
    bool valid = rank_read_frames(lexer, &frames, force_unsafe, frame_limit, NULL, NULL);
    return valid ? step : RANK_READ_UNKNOWN;
}

static bool rank_skip_interpolated(TSLexer *lexer, bool verbatim, RankBodyMode mode, unsigned frame_limit, bool *has_question) {
    RankLiteralFrames frames = array_new();
    RankReadStep step = rank_push_interpolated(lexer, &frames, verbatim, mode);
    bool valid = rank_read_frames(lexer, &frames, NULL, frame_limit, has_question, NULL);
    return step != RANK_READ_UNKNOWN && valid;
}

static bool rank_read_frames(TSLexer *lexer, RankLiteralFrames *frames, bool *force_unsafe, unsigned frame_limit, bool *has_question, uint32_t *questions) {
    bool valid = true;
    while (frames->size) {
        if (frame_limit && frames->size > frame_limit) { valid = false; break; }
        RankReadStep step = array_back(frames)->string
            ? rank_read_string_step(lexer, frames) : rank_read_code_step(lexer, frames);
        if (step == RANK_READ_UNKNOWN) { valid = false; break; }
        if (step != RANK_READ_DONE) continue;
        RankLiteralFrame frame = array_pop(frames);
        valid &= rank_collect_frame(&frame, force_unsafe, has_question, questions);
        array_delete(&frame.groups);
    }
    rank_dispose_frames(frames, force_unsafe, has_question);
    return valid;
}

static void rank_dispose_frames(RankLiteralFrames *frames, bool *force_unsafe, bool *has_question) {
    for (unsigned i = 0; i < frames->size; i++) {
        RankLiteralFrame *frame = &frames->contents[i];
        if (force_unsafe) *force_unsafe |= frame->access && frame->colon;
        if (has_question) *has_question |= frame->question;
        array_delete(&frame->groups);
    }
    array_delete(frames);
}

static bool rank_collect_frame(const RankLiteralFrame *frame, bool *force_unsafe, bool *has_question, uint32_t *questions) {
    if (force_unsafe) *force_unsafe |= frame->access && frame->colon;
    if (has_question) *has_question |= frame->question;
    if (!questions) return true;
    if (UINT32_MAX - *questions < frame->questions) return false;
    *questions += frame->questions;
    return true;
}

static void rank_push_code(RankLiteralFrames *frames, char opening, RankBodyMode mode, unsigned format_braces) {
    RankLiteralFrame frame = {.groups = array_new(), .mode = mode, .format_braces = format_braces};
    array_push(&frame.groups, opening);
    array_push(frames, frame);
}

static RankReadStep rank_read_code_step(TSLexer *lexer, RankLiteralFrames *frames) {
    RankLiteralFrame *frame = array_back(frames);
    int32_t c = question_skip_separators(lexer);
    if (c == -2 || c == '#' || lexer->eof(lexer)) return RANK_READ_UNKNOWN;
    bool identifier_start = is_id_start(c) || c == '\\';
    if (!identifier_start) frame->identifiers = 0;
    if (c == -1) { frame->content = true; return RANK_READ_MORE; }
    if (c == ')' || c == ']' || c == '}') {
        RankReadStep step = rank_close_delimited(lexer, &frame->groups, c, frame->format_braces);
        if (step == RANK_READ_DONE && !frame->content && frame->mode == RANK_BODY_BRACKET) return RANK_READ_UNKNOWN;
        return step;
    }
    frame->content = true;
    if (identifier_start) return rank_read_code_identifier(lexer, frame);
    if (c == ':' && frame->groups.size == 1 && frame->format_braces) {
        advance(lexer);
        return rank_read_format(lexer, frame->format_braces) ? RANK_READ_DONE : RANK_READ_UNKNOWN;
    }
    if (c == ':') frame->colon = true;
    bool question_free = frame->mode == RANK_BODY_QUESTION_FREE || frame->mode == RANK_BODY_INTERPOLATION_QUESTION_FREE;
    if (question_free && c == '?') return RANK_READ_UNKNOWN;
    RankReadStep literal = rank_push_literal(lexer, frames, c, question_free ? frame->mode : RANK_BODY_EXPRESSION);
    if (literal != RANK_READ_TOKEN) return literal;
    if (c == '@') return RANK_READ_MORE;
    if (c == '?') return rank_read_code_question(lexer, frame);
    if (c == '(' || c == '[' || c == '{') array_push(&frame->groups, (char)c);
    advance(lexer);
    return RANK_READ_MORE;
}

static RankReadStep rank_read_code_question(TSLexer *lexer, RankLiteralFrame *frame) {
    frame->question = true;
    advance(lexer);
    if (frame->paired_question) frame->paired_question = false;
    else if (lexer->lookahead == '?') frame->paired_question = true;
    else {
        if (frame->questions == UINT32_MAX) return RANK_READ_UNKNOWN;
        frame->questions++;
    }
    bool binding = question_skip_separators(lexer) == '[';
    frame->access |= binding;
    return frame->mode == RANK_BODY_BRACKET && binding ? RANK_READ_UNKNOWN : RANK_READ_MORE;
}

static RankReadStep rank_read_code_identifier(TSLexer *lexer, RankLiteralFrame *frame) {
    QuestionIdentifier identifier;
    if (!question_identifier(lexer, false, &identifier)) return RANK_READ_UNKNOWN;
    if (!identifier.keyword || (identifier.length < sizeof(identifier.word) && is_syntax_word(identifier.word))) {
        frame->identifiers = 0;
        return RANK_READ_MORE;
    }
    return ++frame->identifiers == 3 ? RANK_READ_UNKNOWN : RANK_READ_MORE;
}

static RankReadStep rank_read_string_step(TSLexer *lexer, RankLiteralFrames *frames) {
    RankLiteralFrame *frame = array_back(frames);
    if (lexer->eof(lexer)) return RANK_READ_UNKNOWN;
    int32_t c = lexer->lookahead;
    if (frame->quotes >= 3) return rank_read_raw_string_step(lexer, frames);
    advance(lexer);
    if (c == '"') {
        if (!frame->verbatim || lexer->lookahead != '"') return RANK_READ_DONE;
        advance(lexer);
    } else if (c == '\\' && !frame->verbatim) {
        if (lexer->eof(lexer)) return RANK_READ_UNKNOWN;
        advance(lexer);
    } else if (c == '{') {
        if (lexer->lookahead == '{') advance(lexer);
        else rank_push_code(frames, '{', frame->mode, 1);
    } else if (c == '}') {
        if (lexer->lookahead != '}') return RANK_READ_UNKNOWN;
        advance(lexer);
    } else if (!frame->verbatim && is_line_terminator(c)) return RANK_READ_UNKNOWN;
    return RANK_READ_MORE;
}

static RankReadStep rank_read_raw_string_step(TSLexer *lexer, RankLiteralFrames *frames) {
    RankLiteralFrame *frame = array_back(frames);
    int32_t c = lexer->lookahead;
    if (c == '"') {
        unsigned count = rank_read_character_run(lexer, c);
        if (count >= frame->quotes) return count == frame->quotes ? RANK_READ_DONE : RANK_READ_UNKNOWN;
    } else if (c == '{') {
        unsigned count = rank_read_character_run(lexer, c);
        if (count >= frame->dollars) {
            if (count - frame->dollars >= frame->dollars) return RANK_READ_UNKNOWN;
            rank_push_code(frames, '{', frame->mode, frame->dollars);
        }
    } else if (c == '}') {
        if (rank_read_character_run(lexer, c) >= frame->dollars) return RANK_READ_UNKNOWN;
    } else advance(lexer);
    return RANK_READ_MORE;
}

static RankReadStep rank_push_literal(TSLexer *lexer, RankLiteralFrames *frames, int32_t c, RankBodyMode mode) {
    if (c == '"' || c == '\'')
        return question_skip_quoted(lexer, false) ? RANK_READ_MORE : RANK_READ_UNKNOWN;
    if (c == '$') return rank_push_interpolated(lexer, frames, false, mode);
    if (c != '@') return RANK_READ_TOKEN;
    advance(lexer);
    return rank_push_verbatim(lexer, frames, mode);
}

static RankReadStep rank_push_verbatim(TSLexer *lexer, RankLiteralFrames *frames, RankBodyMode mode) {
    if (lexer->lookahead == '$') return rank_push_interpolated(lexer, frames, true, mode);
    if (lexer->lookahead == '"')
        return question_skip_quoted(lexer, true) ? RANK_READ_MORE : RANK_READ_UNKNOWN;
    return RANK_READ_TOKEN;
}

static RankReadStep rank_push_interpolated(TSLexer *lexer, RankLiteralFrames *frames, bool verbatim, RankBodyMode mode) {
    if (mode == RANK_BODY_QUESTION_FREE) mode = RANK_BODY_INTERPOLATION_QUESTION_FREE;
    unsigned dollars = rank_read_character_run(lexer, '$');
    if (!verbatim && lexer->lookahead == '@') { verbatim = true; advance(lexer); }
    if (lexer->lookahead != '"') return RANK_READ_UNKNOWN;
    unsigned quotes;
    if (verbatim) {
        if (dollars != 1) return RANK_READ_UNKNOWN;
        advance(lexer);
        quotes = 1;
    } else {
        quotes = rank_read_character_run(lexer, '"');
        if (quotes < 3 && dollars != 1) return RANK_READ_UNKNOWN;
        if (quotes == 2) return RANK_READ_MORE;
    }
    RankLiteralFrame frame = {.groups = array_new(), .mode = mode, .quotes = quotes,
        .dollars = dollars, .string = true, .verbatim = verbatim};
    array_push(frames, frame);
    return RANK_READ_MORE;
}

static RankReadStep rank_close_delimited(TSLexer *lexer, RankGroups *groups, int32_t c, unsigned format_braces) {
    char expected = c == ')' ? '(' : c == ']' ? '[' : '{';
    if (*array_back(groups) != expected) return RANK_READ_UNKNOWN;
    array_pop(groups);
    advance(lexer);
    if (groups->size) return RANK_READ_MORE;
    return rank_read_closing_braces(lexer, format_braces > 0 ? format_braces - 1 : 0) ? RANK_READ_DONE : RANK_READ_UNKNOWN;
}

static bool rank_read_closing_braces(TSLexer *lexer, unsigned count) {
    for (unsigned i = 0; i < count; i++) {
        if (lexer->lookahead != '}') return false;
        advance(lexer);
    }
    return true;
}

static bool rank_read_format(TSLexer *lexer, unsigned closing_braces) {
    unsigned braces = 0;
    while (!lexer->eof(lexer)) {
        braces = lexer->lookahead == '}' ? braces + 1 : 0;
        advance(lexer);
        if (braces == closing_braces) return true;
    }
    return false;
}

static unsigned rank_read_character_run(TSLexer *lexer, int32_t character) {
    unsigned count = 0;
    while (lexer->lookahead == character && !lexer->eof(lexer)) {
        count++;
        advance(lexer);
    }
    return count;
}

static bool question_skip_quoted(TSLexer *lexer, bool verbatim) {
    int32_t quote = lexer->lookahead;
    advance(lexer);
    if (quote == '\'') return question_skip_character(lexer);
    unsigned count = 1;
    if (!verbatim && quote == '"') {
        while (lexer->lookahead == '"') { count++; advance(lexer); }
        if (count == 2) return true;
    }
    if (count >= 3) return question_skip_raw_quoted(lexer, count);
    return question_skip_regular_quoted(lexer, quote, verbatim);
}

static bool question_skip_character(TSLexer *lexer) {
    if (lexer->eof(lexer) || lexer->lookahead == '\'' || is_line_terminator(lexer->lookahead)) return false;
    if (lexer->lookahead == '\\') {
        advance(lexer);
        if (!question_character_escape(lexer)) return false;
    } else {
        if (lexer->lookahead > 0xFFFF) return false;
        advance(lexer);
    }
    if (lexer->lookahead != '\'') return false;
    advance(lexer);
    return true;
}

static bool question_character_escape(TSLexer *lexer) {
    int32_t kind = lexer->lookahead;
    if (kind > 0 && kind < 128 && strchr("0abefnrtv\\\"'", kind)) { advance(lexer); return true; }
    unsigned digits = kind == 'x' || kind == 'u' ? 4 : kind == 'U' ? 8 : 0;
    if (!digits) return false;
    advance(lexer);
    uint32_t value = 0;
    unsigned read = 0;
    while (read < digits && question_hex_digit(lexer->lookahead) < 16) {
        value = value * 16 + question_hex_digit(lexer->lookahead);
        read++;
        advance(lexer);
    }
    return value <= 0xFFFF && (kind == 'x' ? read > 0 : read == digits);
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

#endif
