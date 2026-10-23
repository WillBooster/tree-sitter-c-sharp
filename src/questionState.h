#ifndef TREE_SITTER_C_SHARP_QUESTION_STATE_H_
#define TREE_SITTER_C_SHARP_QUESTION_STATE_H_

static bool question_read_modes(Scanner *scanner, unsigned flags, const char *buffer, unsigned length, unsigned *size);
static unsigned question_serialized_size(const Scanner *scanner);
static void question_serialize(const Scanner *scanner, char *buffer, unsigned *size);
static bool question_deserialize(Scanner *scanner, const char *buffer, unsigned length, unsigned *size);
static bool question_read_varint(const char *buffer, unsigned length, unsigned *size, uint32_t *value);

static unsigned question_frame_modes(QuestionFrame frame);
static bool question_read_rank(Scanner *scanner, unsigned flags, const char *buffer, unsigned length, unsigned *size);

typedef struct { bool unknown, extended, rank, cache, depths, confirmation; } QuestionSerialization;

static QuestionSerialization question_serialization_plan(const Scanner *scanner, unsigned available) {
    bool confirmation = scanner->ternary_confirmation.valid;
    bool extended = (!scanner->question_unknown || confirmation) && (scanner->question_frame_count > 1 ||
        scanner->question_frames[0].pending || scanner->question_frames[0].unknown || scanner->question_frames[0].case_colon || scanner->question_frames[0].force_barrier);
    bool unknown = scanner->question_unknown;
    unsigned extension_size = extended ? question_serialized_size(scanner) : 2;
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
    bool rank = !unknown && scanner->question_rank_role &&
        (scanner->question_type_uncertain || scanner->question_rank_role == RANK_PATTERN_COMPLETE) && available >= 5;
    if (rank) available -= 5;
    bool cache = !rank && (unknown || !scanner->question_type_uncertain) && scanner->question_access_cache && available >= 4;
    if (cache) available -= 4;
    bool depths = scanner->interpolation_stack.size && scanner->interpolation_stack.size * 2 <= available;
    return (QuestionSerialization){unknown, extended, rank, cache, depths, confirmation};
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
    if (state.extended) question_serialize(scanner, buffer, size);
    if (state.confirmation) {
        TernaryConfirmation value = scanner->ternary_confirmation;
        buffer[(*size)++] = (char)value.frame;
        buffer[(*size)++] = (char)(value.frame >> 8);
        for (unsigned byte = 0; byte < 4; byte++) buffer[(*size)++] = (char)(value.pending >> (byte * 8));
        buffer[(*size)++] = (char)((value.frame_unknown ? 1 : 0) | (value.unknown ? 2 : 0));
    }
}

static bool question_apply_event(Scanner *scanner, char event);

static void apply_question_events(Scanner *scanner, const char *events, unsigned count) {
    for (unsigned i = 0; i < count; i++) {
        if (question_apply_event(scanner, events[i])) continue;
        scanner->question_unknown = true;
        scanner->question_access_cache = 0;
        return;
    }
}

static bool question_apply_event(Scanner *scanner, char event) {
    if (event == '(' || event == '[' || event == '{') {
        if (scanner->question_frame_count == QUESTION_FRAME_LIMIT) return false;
        scanner->question_frames[scanner->question_frame_count++] = (QuestionFrame){.group = (uint8_t)event};
        return true;
    }
    if (event == ')' || event == ']' || event == '}') return question_close_frame(scanner, event);
    QuestionFrame *frame = &scanner->question_frames[scanner->question_frame_count - 1];
    if (event == 'l') frame->force_barrier = true;
    if (event == ':') {
        if (frame->pending) frame->pending--;
        else if (!frame->unknown && !scanner->question_unknown) frame->case_colon = false;
    }
    if (event != ';') return true;
    frame->pending = 0;
    frame->unknown = false;
    frame->case_colon = false;
    if (scanner->question_frame_count == 1) reset_question_context(scanner);
    return true;
}

static bool question_close_frame(Scanner *scanner, char closing) {
    QuestionFrame *frame = &scanner->question_frames[scanner->question_frame_count - 1];
    bool root = scanner->question_frame_count == 1;
    if (root && question_context_idle(scanner) && !scanner->question_unknown) return true;
    char opening = closing == ')' ? '(' : closing == ']' ? '[' : '{';
    if (root || frame->group != opening) return false;
    scanner->question_frame_count--;
    return true;
}

static bool question_context_idle(const Scanner *scanner) {
    return scanner->question_frame_count == 1 && !scanner->question_frames[0].pending &&
        !scanner->question_frames[0].unknown && !scanner->question_frames[0].case_colon;
}

static void question_save_confirmation(Scanner *scanner, const Scanner *confirmed) {
    if (scanner->question_frame_count != confirmed->question_frame_count) return;
    int changed = -1;
    for (unsigned i = 0; i < scanner->question_frame_count; i++) {
        QuestionFrame actual = scanner->question_frames[i];
        QuestionFrame next = confirmed->question_frames[i];
        if (actual.group != next.group || actual.case_colon != next.case_colon || actual.force_barrier != next.force_barrier) return;
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
        if (!(flags & (QUESTION_STATE_ACCESS_CACHE | QUESTION_STATE_CONFIRMATION)) ||
            ((flags & QUESTION_STATE_EXTENDED) && !(flags & QUESTION_STATE_CONFIRMATION)) ||
            (flags & (QUESTION_STATE_RANK_ROLE | QUESTION_STATE_TYPE_UNCERTAIN))) return false;
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
    if (!scanner->question_rank_role || scanner->question_rank_role > RANK_PATTERN_COMPLETE) return false;
    if (!scanner->question_type_uncertain && scanner->question_rank_role != RANK_PATTERN_COMPLETE) return false;
    return true;
}

static unsigned question_serialized_size(const Scanner *scanner) {
    unsigned size = 2;
    for (unsigned i = 0; i < scanner->question_frame_count; i++) {
        uint32_t pending = scanner->question_frames[i].pending;
        size++;
        do { size++; pending >>= 7; } while (pending);
    }
    return size;
}

static void question_serialize(const Scanner *scanner, char *buffer, unsigned *size) {
    buffer[(*size)++] = (char)scanner->question_frame_count;
    buffer[(*size)++] = (char)(scanner->question_frame_count >> 8);
    for (unsigned i = 0; i < scanner->question_frame_count; i++) {
        QuestionFrame frame = scanner->question_frames[i];
        buffer[(*size)++] = (char)question_frame_modes(frame);
        do {
            unsigned byte = frame.pending & 127;
            frame.pending >>= 7;
            buffer[(*size)++] = (char)(byte | (frame.pending ? 128 : 0));
        } while (frame.pending);
    }
}

static bool question_deserialize(Scanner *scanner, const char *buffer, unsigned length, unsigned *size) {
    if (*size + 2 > length) return false;
    unsigned count = (unsigned char)buffer[(*size)++];
    count |= (unsigned)(unsigned char)buffer[(*size)++] << 8;
    if (!count || count > QUESTION_FRAME_LIMIT) return false;
    scanner->question_frame_count = count;
    for (unsigned i = 0; i < count; i++) {
        if (*size == length) return false;
        unsigned group = (unsigned char)buffer[(*size)++];
        if ((group & ~31U) || (!i && (group & 3)) || (i && !(group & 3))) return false;
        static const char groups[] = {0, '(', '[', '{'};
        QuestionFrame frame = {.group = groups[group & 3], .unknown = (group & 4) != 0,
            .case_colon = (group & 8) != 0, .force_barrier = (group & 16) != 0};
        if (!question_read_varint(buffer, length, size, &frame.pending)) return false;
        scanner->question_frames[i] = frame;
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
    unsigned group = frame.group == '(' ? 1 : frame.group == '[' ? 2 : frame.group == '{' ? 3 : 0;
    return group | (frame.unknown ? 4 : 0) | (frame.case_colon ? 8 : 0) | (frame.force_barrier ? 16 : 0);
}

#endif
