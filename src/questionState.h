#ifndef TREE_SITTER_C_SHARP_QUESTION_STATE_H_
#define TREE_SITTER_C_SHARP_QUESTION_STATE_H_

static bool question_read_modes(Scanner *scanner, unsigned flags, const char *buffer, unsigned length, unsigned *size);
static unsigned question_serialized_size(const Scanner *scanner, bool transfers, bool guard_counts);
static void question_serialize(const Scanner *scanner, char *buffer, unsigned *size, bool transfers, bool guard_counts);
static bool question_deserialize(Scanner *scanner, const char *buffer, unsigned length, unsigned *size);
static bool question_read_varint(const char *buffer, unsigned length, unsigned *size, uint32_t *value);
static void question_write_guard(const QuestionFrame *, bool, char *, unsigned *, bool);
static bool question_read_guard(QuestionFrame *, const char *, unsigned, unsigned *);

static unsigned question_frame_modes(QuestionFrame frame);
static bool question_read_rank(Scanner *scanner, unsigned flags, const char *buffer, unsigned length, unsigned *size);

typedef struct { bool unknown, extended, rank, cache, depths, confirmation, transfers, guard_counts; } QuestionSerialization;

static uint8_t question_take_rank(Scanner *scanner, bool *known_nullable, bool *dimension_expression) {

    if (scanner->question_rank_role == RANK_NULLABLE_NEXT && scanner->question_rank_prefix_questions) {
        *known_nullable = true;
        scanner->question_rank_prefix_questions--;
        return RANK_NONE;
    }
    if (scanner->question_rank_role == RANK_NULLABLE_PREFIX || scanner->question_rank_role == RANK_OWNED_NULLABLE_PREFIX) {
        uint8_t role = scanner->question_rank_role == RANK_OWNED_NULLABLE_PREFIX ? RANK_OWNED_NULLABLE_PREFIX : RANK_NONE;
        *known_nullable = true;
        if (!--scanner->question_rank_prefix_questions) clear_question_rank(scanner);
        return role;
    }
    if (scanner->question_rank_role == RANK_ALLOCATION_MIXED) {
        *dimension_expression = !(scanner->question_rank_prefix_questions & 1);
        *known_nullable |= scanner->question_rank_prefix_questions & 1;
        scanner->question_rank_prefix_questions >>= 1;
        if (scanner->question_rank_prefix_questions == 1) clear_question_rank(scanner);
        return RANK_NONE;
    }
    if (scanner->question_rank_role && scanner->question_rank_prefix_questions) {
        scanner->question_rank_prefix_questions--;
        return RANK_NONE;
    }
    uint8_t role = scanner->question_rank_role;
    clear_question_rank(scanner);
    return role;
}

static QuestionSerialization question_serialization_plan(const Scanner *scanner, unsigned available) {
    bool confirmation = scanner->ternary_confirmation.valid;
    bool extended = (!scanner->question_unknown || confirmation) && (scanner->question_frame_count > 1 ||
        scanner->question_frames[0].pending || scanner->question_frames[0].unknown || scanner->question_frames[0].case_colon || scanner->question_frames[0].force_barrier || scanner->question_frames[0].query_pending || scanner->question_frames[0].query_result || scanner->question_frames[0].generic_pending);
    bool unknown = scanner->question_unknown;
    unsigned extension_size = extended ? question_serialized_size(scanner, false, false) : 2;
    if (extended && extension_size > available) {
        extended = false;
        unknown = true;
        confirmation = false;
    }
    if (extended) available -= extension_size;
    confirmation = confirmation && available >= 7;
    if (confirmation) available -= 7;
    else if (unknown && extended) {
        available += extension_size;
        extended = false;
    }
    bool type_prefix = (scanner->question_rank_role == RANK_NULLABLE_PREFIX || scanner->question_rank_role == RANK_OWNED_NULLABLE_PREFIX || scanner->question_rank_role == RANK_ALLOCATION_MIXED) && scanner->question_rank_prefix_questions;
    bool rank = type_prefix || (!unknown && scanner->question_rank_role &&
            (scanner->question_type_uncertain || scanner->question_rank_role == RANK_PATTERN_COMPLETE));
    rank &= available >= 5;
    if (rank) available -= 5;
    bool cache = !rank && (unknown || !scanner->question_type_uncertain) && scanner->question_access_cache && available >= 4;
    if (cache) available -= 4;
    bool depths = scanner->interpolation_stack.size && scanner->interpolation_stack.size * 2 <= available;
    if (depths) available -= scanner->interpolation_stack.size * 2;
    bool transfers = extended && question_serialized_size(scanner, true, false) - extension_size <= available;
    if (transfers) available -= question_serialized_size(scanner, true, false) - extension_size;
    bool guard_counts = extended && question_serialized_size(scanner, transfers, true) -
        question_serialized_size(scanner, transfers, false) <= available;
    return (QuestionSerialization){unknown, extended, rank, cache, depths, confirmation, transfers, guard_counts};
}

static char question_serialization_modes(const Scanner *scanner, QuestionSerialization state) {
    return (char)((scanner->next_file_directive ? 1 : 0) |
        (state.unknown ? QUESTION_STATE_UNKNOWN : 0) | (state.extended ? QUESTION_STATE_EXTENDED : 0) |
        (state.cache ? QUESTION_STATE_ACCESS_CACHE : 0) | (state.rank ? QUESTION_STATE_RANK_ROLE : 0) |
        (!state.unknown && scanner->question_type_uncertain ? QUESTION_STATE_TYPE_UNCERTAIN : 0) |
        (state.depths ? QUESTION_STATE_INTERPOLATION_DEPTH : 0) |
        (state.confirmation ? QUESTION_STATE_CONFIRMATION : 0));
}

static void question_serialize_modes(const Scanner *scanner, QuestionSerialization state, char *buffer, unsigned *size) {
    if (state.rank) {
        buffer[(*size)++] = (char)scanner->question_rank_role;
        for (unsigned byte = 0; byte < 4; byte++)
            buffer[(*size)++] = (char)(scanner->question_rank_prefix_questions >> (byte * 8));
    }
    if (state.cache) {
        for (unsigned byte = 0; byte < 4; byte++) buffer[(*size)++] = (char)(scanner->question_access_cache >> (byte * 8));
    }
    if (state.extended) question_serialize(scanner, buffer, size, state.transfers, state.guard_counts);
    if (state.confirmation) {
        TernaryConfirmation value = scanner->ternary_confirmation;
        buffer[(*size)++] = (char)value.frame;
        buffer[(*size)++] = (char)(value.frame >> 8);
        for (unsigned byte = 0; byte < 4; byte++) buffer[(*size)++] = (char)(value.pending >> (byte * 8));
        buffer[(*size)++] = (char)((value.frame_unknown ? 1 : 0) | (value.unknown ? 2 : 0));
    }
}

static bool question_apply_event(Scanner *scanner, char event);
static bool question_apply_scope_event(QuestionFrame *, char);

static bool apply_question_events(Scanner *scanner, const char *events, unsigned count) {
    for (unsigned i = 0; i < count; i++) {
        if (question_apply_event(scanner, events[i])) continue;
        scanner->question_unknown = true;
        question_clear_rank_from(scanner, 0);
        question_clear_access_cache(scanner);
        return false;
    }
    return true;
}

static bool question_apply_event(Scanner *scanner, char event) {
    if (event == 'p' || event == '(' || event == '[' || event == '{') {
        if (scanner->question_frame_count == QUESTION_FRAME_LIMIT) return false;
        scanner->question_frames[scanner->question_frame_count++] = (QuestionFrame){.group = (uint8_t)event};
        return true;
    }
    if (event == ')' || event == ']' || event == '}') return question_close_frame(scanner, event);
    QuestionFrame *frame = &scanner->question_frames[scanner->question_frame_count - 1];
    if (!question_apply_scope_event(frame, event)) return false;
    if (event == ':') {
        frame->guard.role &= GUARD_ROLE_MASK;
        if (frame->pending) frame->pending--;
        else if (!frame->unknown && !scanner->question_unknown) {
            frame->case_colon = false;
            frame->case_guard = false;
            frame->guard = (QuestionGuardCertificate){0};
        }
    }
    if (event != ';') return true;
    frame->pending = 0;
    memset(frame->rank_modes, 0, sizeof(frame->rank_modes));
    frame->query_pending = 0;
    frame->generic_pending = 0;
    frame->query_result = false;
    frame->lambda_query = 0;
    frame->lambda_result = false;
    frame->unknown = false;
    frame->case_colon = false;
    frame->case_guard = false;
    frame->guard = (QuestionGuardCertificate){0};
    if (scanner->question_frame_count == 1) reset_question_context(scanner);
    return true;
}

static void question_clear_rank_from(Scanner *scanner, unsigned first) {
    for (unsigned i = first; i < scanner->question_frame_count; i++) {
        QuestionFrame *frame = &scanner->question_frames[i];
        memset(frame->rank_modes, 0, sizeof(frame->rank_modes));
        frame->guard.role = 0;
        frame->guard.prefix = 0;
        if (scanner->question_unknown || frame->unknown) frame->guard.handoff = false;
    }
}

static unsigned question_rank_mask(const QuestionFrame *frame) {
    unsigned mask = 0;
    for (unsigned i = 0; i < 4; i++) if (frame->rank_modes[i]) mask |= 1U << i;
    return mask;
}

static void question_end_lambda(QuestionFrame *frame) {
    frame->force_barrier = false;
    frame->lambda_query = 0;
    frame->lambda_result = false;
}

static bool question_apply_scope_event(QuestionFrame *frame, char event) {
    if (event == 'g') {
        if (frame->generic_pending == UINT32_MAX) return false;
        frame->generic_pending++;
    }
    if (event == 'h' && frame->generic_pending) frame->generic_pending--;
    if (frame->generic_pending && (event == ',' || event == 'q' || event == 's' || event == 'i' || event == 'k')) return true;
    if (event == 'l' && !frame->force_barrier) {
        frame->lambda_query = frame->query_pending;
        frame->lambda_result = frame->query_result;
        frame->force_barrier = true;
    }
    if (event == 'q' || (event == 'i' && frame->query_result)) {
        if (event == 'q') frame->lambda_result = false;
        else if (frame->lambda_result) {
            question_end_lambda(frame);
        }
        if (frame->query_pending == UINT32_MAX) return false;
        frame->query_pending++;
        frame->query_result = false;
    }
    if (event == 's' && frame->query_pending) { frame->query_pending--; frame->query_result = true; }
    if (event == 'k' && frame->query_pending) frame->query_result = false;
    if (event == ',') {
        if (frame->query_pending <= frame->lambda_query) {
            question_end_lambda(frame);
        }
        frame->query_result = false;
    }
    return true;
}

static bool question_close_frame(Scanner *scanner, char closing) {
    QuestionFrame *frame = &scanner->question_frames[scanner->question_frame_count - 1];
    bool root = scanner->question_frame_count == 1;
    if (root && question_context_idle(scanner) && !scanner->question_unknown) return true;
    char opening = closing == ')' ? '(' : closing == ']' ? '[' : '{';
    if (root || (frame->group != opening && !(closing == ')' && frame->group == 'p'))) return false;
    scanner->question_frame_count--;
    return true;
}

static bool question_context_idle(const Scanner *scanner) {
    return scanner->question_frame_count == 1 && !scanner->question_frames[0].pending &&
        !scanner->question_frames[0].unknown && !scanner->question_frames[0].case_colon &&
        !scanner->question_frames[0].query_pending && !scanner->question_frames[0].query_result && !scanner->question_frames[0].generic_pending;
}

static void question_complete_context(Scanner *scanner, bool found_next_question, bool preserve_unknown) {
    if (!found_next_question && !preserve_unknown && question_context_idle(scanner)) reset_question_context(scanner);
    scanner->question_unknown |= preserve_unknown;
}

static void question_walk_cache(Scanner *scanner, const QuestionWalk *walk, unsigned role) {
    if (walk->suffix.role) {
        if (scanner->question_unknown || scanner->question_frames[scanner->question_frame_count - 1].unknown || scanner->suffix.frames != scanner->question_frame_count)
            question_clear_suffix(scanner);
        else scanner->suffix.pending = scanner->question_frames[scanner->question_frame_count - 1].pending;
        return;
    }
    if (role == 1 && walk->suffix.regular && walk->suffix.boundary && !walk->mandatory && !walk->proved_ternary && !walk->known_ternary &&
        question_walk_role_known(walk) && walk->binding && walk->suffix.roles.size && !scanner->question_unknown &&
        !scanner->question_frames[scanner->question_frame_count - 1].unknown) {
        question_suffix_store(&scanner->suffix, &walk->suffix, scanner->question_frame_count,
            scanner->question_frames[scanner->question_frame_count - 1].pending);
    }
    if (walk->cached_access) {
        scanner->question_access_cache = walk->cached_count - 1;
        return;
    }
    // In an A+ then colon* stream, unmatched optional questions are exactly the leading access prefix.
    bool reusable = walk->binding && walk->cache_shaped && !walk->proved_ternary &&
        (question_walk_role_known(walk) || question_walk_access_prefix(walk));
    if (reusable && walk->optional > 1 && walk->optional - 1 <= UINT32_MAX)
        scanner->question_access_cache = (uint32_t)(walk->optional - 1);
}

static void question_save_confirmation(Scanner *scanner, const Scanner *confirmed) {
    if (scanner->question_frame_count != confirmed->question_frame_count) return;
    int changed = -1;
    for (unsigned i = 0; i < scanner->question_frame_count; i++) {
        QuestionFrame actual = scanner->question_frames[i];
        QuestionFrame next = confirmed->question_frames[i];
        if (actual.group != next.group || actual.case_colon != next.case_colon || actual.case_guard != next.case_guard || actual.guard.handoff != next.guard.handoff || actual.force_barrier != next.force_barrier ||
            actual.query_pending != next.query_pending || actual.query_result != next.query_result ||
            actual.lambda_query != next.lambda_query || actual.lambda_result != next.lambda_result ||
            actual.generic_pending != next.generic_pending) return;
        if (actual.pending == next.pending && actual.unknown == next.unknown) continue;
        if (changed >= 0) return;
        changed = (int)i;
    }
    if (changed < 0 && scanner->question_unknown == confirmed->question_unknown) return;
    unsigned index = changed < 0 ? 0 : (unsigned)changed;
    QuestionFrame next = confirmed->question_frames[index];
    scanner->ternary_confirmation = (TernaryConfirmation){.frame = (uint16_t)index, .pending = next.pending,
        .frame_unknown = next.unknown, .unknown = confirmed->question_unknown, .valid = true};
}

static bool question_read_modes(Scanner *scanner, unsigned flags, const char *buffer, unsigned length, unsigned *size) {
    if (flags & QUESTION_STATE_UNKNOWN) {
        bool type_prefix = (flags & QUESTION_STATE_RANK_ROLE) && *size + 5 <= length &&
            ((uint8_t)buffer[*size] == RANK_NULLABLE_PREFIX || (uint8_t)buffer[*size] == RANK_OWNED_NULLABLE_PREFIX || (uint8_t)buffer[*size] == RANK_ALLOCATION_MIXED);
        if (!(flags & (QUESTION_STATE_ACCESS_CACHE | QUESTION_STATE_CONFIRMATION)) && !type_prefix) return false;
        if (((flags & QUESTION_STATE_EXTENDED) && !(flags & QUESTION_STATE_CONFIRMATION)) ||
            (flags & QUESTION_STATE_TYPE_UNCERTAIN) || ((flags & QUESTION_STATE_RANK_ROLE) && !type_prefix)) return false;
        scanner->question_unknown = true;
    }
    scanner->question_type_uncertain = (flags & QUESTION_STATE_TYPE_UNCERTAIN) != 0;
    if ((flags & QUESTION_STATE_RANK_ROLE) && !question_read_rank(scanner, flags, buffer, length, size)) return false;
    if (flags & QUESTION_STATE_ACCESS_CACHE) {
        if (*size + 4 > length) return false;
        for (unsigned byte = 0; byte < 4; byte++) scanner->question_access_cache |=
            (uint32_t)(unsigned char)buffer[(*size)++] << (byte * 8);
        if (!scanner->question_access_cache) return false;
    }
    return true;
}

static bool question_read_rank(Scanner *scanner, unsigned flags, const char *buffer, unsigned length, unsigned *size) {
    if (*size + 5 > length || (flags & QUESTION_STATE_ACCESS_CACHE)) return false;
    scanner->question_rank_role = (uint8_t)buffer[(*size)++];
    for (unsigned byte = 0; byte < 4; byte++) scanner->question_rank_prefix_questions |=
        (uint32_t)(unsigned char)buffer[(*size)++] << (byte * 8);

    if (scanner->question_rank_role == RANK_NULLABLE_PREFIX || scanner->question_rank_role == RANK_OWNED_NULLABLE_PREFIX) return scanner->question_rank_prefix_questions != 0;
    if (scanner->question_rank_role == RANK_ALLOCATION_MIXED) return scanner->question_rank_prefix_questions > 1;
    if (!scanner->question_rank_role || scanner->question_rank_role > RANK_PATTERN_COMPLETE) return false;
    if (!scanner->question_type_uncertain && scanner->question_rank_role != RANK_PATTERN_COMPLETE) return false;
    return true;
}

static unsigned question_varint_size(uint32_t value) {
    unsigned size = 1;
    while (value >>= 7) size++;
    return size;
}

static void question_write_varint(char *buffer, unsigned *size, uint32_t value) {
    do {
        unsigned byte = value & 127;
        value >>= 7;
        buffer[(*size)++] = (char)(byte | (value ? 128 : 0));
    } while (value);
}

static unsigned question_serialized_size(const Scanner *scanner, bool transfers, bool guard_counts) {
    unsigned size = 2;
    for (unsigned i = 0; i < scanner->question_frame_count; i++) {
        QuestionFrame frame = scanner->question_frames[i];
        size += 1 + frame.case_colon + question_varint_size(frame.pending);
        if (!scanner->question_unknown && !frame.unknown && frame.case_guard && frame.guard.prefix && guard_counts) size += question_varint_size(frame.guard.prefix);
        unsigned mask = transfers ? question_rank_mask(&frame) : 0;
        if (frame.query_pending || frame.lambda_query || frame.generic_pending || mask) {
            size += 1 + question_varint_size(frame.query_pending) + question_varint_size(frame.lambda_query) + question_varint_size(frame.generic_pending);
            if (mask) size++;
            for (unsigned bit = mask; bit; bit >>= 1) size += bit & 1;
        }
    }
    return size;
}

static void question_serialize(const Scanner *scanner, char *buffer, unsigned *size, bool transfers, bool guard_counts) {
    buffer[(*size)++] = (char)scanner->question_frame_count;
    buffer[(*size)++] = (char)(scanner->question_frame_count >> 8);
    for (unsigned i = 0; i < scanner->question_frame_count; i++) {
        QuestionFrame frame = scanner->question_frames[i];
        unsigned mask = transfers ? question_rank_mask(&frame) : 0;
        bool extra = frame.query_pending || frame.lambda_query || frame.generic_pending || mask;
        if (extra) buffer[(*size)++] = mask ? 6 : 7;
        buffer[(*size)++] = (char)question_frame_modes(frame);
        if (frame.case_colon) question_write_guard(&frame, scanner->question_unknown, buffer, size, guard_counts);
        question_write_varint(buffer, size, frame.pending);
        if (extra) {
            question_write_varint(buffer, size, frame.query_pending);
            question_write_varint(buffer, size, frame.lambda_query);
            question_write_varint(buffer, size, frame.generic_pending);
            if (mask) {
                buffer[(*size)++] = (char)mask;
                for (unsigned i = 0; i < 4; i++) if (mask & (1U << i)) buffer[(*size)++] = (char)frame.rank_modes[i];
            }
        }
    }
}

static void question_write_guard(const QuestionFrame *frame, bool unknown, char *buffer, unsigned *size, bool counts) {
    bool proof = !unknown && !frame->unknown && frame->case_guard && (!frame->guard.prefix || counts);
    buffer[(*size)++] = (char)(frame->case_guard ? 1 | (proof ? (frame->guard.role & GUARD_ROLE_MASK) << 1 : 0) |
        (proof && frame->guard.prefix ? 8 : 0) |
        (!unknown && !frame->unknown && frame->guard.handoff ? 16 : 0) |
        (!unknown && !frame->unknown && (frame->guard.role & GUARD_SUFFIX_COMPLETE) ? 32 : 0) |
        (frame->guard.ordinary_scanned ? 64 : 0) : 0);
    if (proof && frame->guard.prefix) question_write_varint(buffer, size, frame->guard.prefix);
}

static bool question_read_frame(QuestionFrame *, unsigned, const char *, unsigned, unsigned *);
static bool question_read_transfers(QuestionFrame *, const char *, unsigned, unsigned *);

static bool question_deserialize(Scanner *scanner, const char *buffer, unsigned length, unsigned *size) {
    if (*size + 2 > length) return false;
    unsigned count = (unsigned char)buffer[(*size)++];
    count |= (unsigned)(unsigned char)buffer[(*size)++] << 8;
    if (!count || count > QUESTION_FRAME_LIMIT) return false;
    scanner->question_frame_count = count;
    for (unsigned i = 0; i < count; i++)
        if (!question_read_frame(&scanner->question_frames[i], i, buffer, length, size) ||
            (scanner->question_unknown && (scanner->question_frames[i].guard.role || scanner->question_frames[i].guard.handoff))) return false;

    return true;
}

static bool question_read_frame(QuestionFrame *frame, unsigned index, const char *buffer, unsigned length, unsigned *size) {
    if (*size == length) return false;
    unsigned group = (unsigned char)buffer[(*size)++];
    bool transfers = group == 6;
    bool extra = transfers || group == 7;
    if (extra) {
        if (*size == length) return false;
        group = (unsigned char)buffer[(*size)++];
    }
    unsigned kind = group & 7;
    if (kind > 4 || (!index && kind) || (index && !kind)) return false;
    static const char groups[] = {0, '(', '[', '{', 'p'};
    *frame = (QuestionFrame){.group = groups[kind], .unknown = (group & 8) != 0,
        .case_colon = (group & 16) != 0, .force_barrier = (group & 32) != 0,
        .query_result = (group & 64) != 0, .lambda_result = (group & 128) != 0};
    if (frame->case_colon && !question_read_guard(frame, buffer, length, size)) return false;
    if (!question_read_varint(buffer, length, size, &frame->pending)) return false;
    if (extra && (!question_read_varint(buffer, length, size, &frame->query_pending) ||
        !question_read_varint(buffer, length, size, &frame->lambda_query) ||
        !question_read_varint(buffer, length, size, &frame->generic_pending))) return false;
    if (transfers && !question_read_transfers(frame, buffer, length, size)) return false;
    if (extra && !transfers && !frame->query_pending && !frame->lambda_query && !frame->generic_pending) return false;
    return frame->force_barrier || (!frame->lambda_query && !frame->lambda_result);
}

static bool question_read_guard(QuestionFrame *frame, const char *buffer, unsigned length, unsigned *size) {
    if (*size == length) return false;
    unsigned guard = (unsigned char)buffer[(*size)++];
    if (guard > 125 || ((guard & 6) == 6) || (guard && !(guard & 1)) || ((guard & 8) && !(guard & 6))) return false;
    if (frame->unknown && (guard & 54)) return false;
    frame->case_guard = guard & 1;
    frame->guard.role = ((guard >> 1) & 3) | ((guard & 32) ? GUARD_SUFFIX_COMPLETE : 0);
    frame->guard.handoff = (guard & 16) != 0;
    frame->guard.ordinary_scanned = (guard & 64) != 0;
    if (guard & 8) {
        if (!question_read_varint(buffer, length, size, &frame->guard.prefix) || !frame->guard.prefix) return false;
    }
    return true;
}

static bool question_read_transfers(QuestionFrame *frame, const char *buffer, unsigned length, unsigned *size) {
    if (*size == length || frame->group != 'p') return false;
    unsigned mask = (unsigned char)buffer[(*size)++];
    if (!mask || (mask & ~15U)) return false;
    for (unsigned i = 0; i < 4; i++) if (mask & (1U << i)) {
        if (*size == length) return false;
        unsigned value = (unsigned char)buffer[(*size)++];
        if ((value & 3) == 3 || ((value >> 4) & 3) == 3 || (value & 68) != 68) return false;
        frame->rank_modes[i] = (uint16_t)(256 | value);
    }
    return true;
}

static bool question_read_varint(const char *buffer, unsigned length, unsigned *size, uint32_t *value) {
    *value = 0;
    for (unsigned shift = 0;; shift += 7) {
        if (*size == length || shift > 28) return false;
        unsigned byte = (unsigned char)buffer[(*size)++];
        if (shift == 28 && (byte & 240)) return false;
        *value |= (uint32_t)(byte & 127) << shift;
        if (!(byte & 128)) return !shift || (byte & 127);
    }
}

static unsigned question_frame_modes(QuestionFrame frame) {
    unsigned group = frame.group == '(' ? 1 : frame.group == '[' ? 2 : frame.group == '{' ? 3 : frame.group == 'p' ? 4 : 0;
    return group | (frame.unknown ? 8 : 0) | (frame.case_colon ? 16 : 0) |
        (frame.force_barrier ? 32 : 0) | (frame.query_result ? 64 : 0) | (frame.lambda_result ? 128 : 0);
}

#endif
