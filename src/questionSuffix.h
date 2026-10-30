#ifndef TREE_SITTER_C_SHARP_QUESTION_SUFFIX_H_
#define TREE_SITTER_C_SHARP_QUESTION_SUFFIX_H_

typedef struct {
    uint16_t count, index, frames;
    uint32_t pending;
    bool confirm;
    uint8_t period;
    uint64_t pattern;
    uint8_t roles[TREE_SITTER_SERIALIZATION_BUFFER_SIZE];
} QuestionSuffix;

typedef struct {
    bool regular, boundary;
    unsigned role;
    Array(char) roles;
    Array(unsigned) live;
} QuestionSuffixBuilder;

static void question_suffix_clear(QuestionSuffix *);
static unsigned question_suffix_byte(const QuestionSuffix *, unsigned, unsigned);
static unsigned question_suffix_period(const QuestionSuffixBuilder *);
static unsigned question_suffix_bit(const QuestionSuffix *, unsigned);
static uint64_t question_suffix_pack_pattern(const QuestionSuffixBuilder *, unsigned);
static unsigned question_suffix_pattern_byte(const QuestionSuffix *, unsigned, unsigned);
static bool question_suffix_read_pattern(QuestionSuffix *, const char *, unsigned, unsigned, unsigned);
static bool question_suffix_read_bitmap(QuestionSuffix *, const char *, unsigned, unsigned, unsigned);

static unsigned question_suffix_take(QuestionSuffix *proof, bool binding, bool member, bool eligible, unsigned frames, uint32_t pending) {
    if (proof->index >= proof->count) return 0;
    if (!eligible || proof->frames != frames || proof->pending != pending) {
        question_suffix_clear(proof);
        return 0;
    }
    if (member) return 0;
    unsigned role = 2;
    if (binding) {
        unsigned index = proof->index++;
        role = question_suffix_bit(proof, index) ? 2 : 1;
    }
    proof->confirm = role == 2;
    return role;
}

static void question_suffix_clear(QuestionSuffix *proof) {
    proof->count = proof->index = 0;
    proof->confirm = false;
    proof->period = 0;
}

static void question_suffix_dispose(QuestionSuffixBuilder *builder) {
    array_delete(&builder->roles);
    array_delete(&builder->live);
}

static void question_suffix_add(QuestionSuffixBuilder *builder, bool optional) {
    if (!builder->regular) return;
    unsigned index = builder->roles.size;
    array_push(&builder->roles, 0);
    if (optional) array_push(&builder->live, index);
}

static void question_suffix_colon(QuestionSuffixBuilder *builder) {
    if (!builder->regular || !builder->live.size) return;
    unsigned index = array_pop(&builder->live);
    if (index != UINT32_MAX) builder->roles.contents[index] = 1;
}

static void question_suffix_store(QuestionSuffix *proof, const QuestionSuffixBuilder *builder, unsigned frames, uint32_t pending) {
    unsigned count = builder->roles.size;
    unsigned period = question_suffix_period(builder);
    unsigned limit = period ? UINT16_MAX : sizeof(proof->roles) * 8;
    if (count > limit) count = limit;
    proof->period = (uint8_t)period;
    proof->pattern = question_suffix_pack_pattern(builder, period);
    if (!period) {
        memset(proof->roles, 0, sizeof(proof->roles));
        for (unsigned i = 0; i < count; i++)
            if (builder->roles.contents[i]) proof->roles[i / 8] |= 1U << (i % 8);
    }
    proof->count = (uint16_t)count;
    proof->index = 0;
    proof->frames = (uint16_t)frames;
    proof->pending = pending;
    proof->confirm = false;
}

static void question_suffix_serialize(const QuestionSuffix *proof, char *buffer, unsigned *size) {
    if (proof->index >= proof->count) return;
    unsigned remaining = proof->count - proof->index;
    unsigned available = TREE_SITTER_SERIALIZATION_BUFFER_SIZE - *size;
    if (available <= 10) return;
    unsigned period = proof->period < remaining ? proof->period : remaining;
    unsigned period_bytes = (period + 7) / 8;
    if (proof->period && available < 11 + period_bytes) return;
    unsigned count = remaining;
    unsigned capacity = (available - 10) * 8;
    if (!proof->period && count > capacity) count = capacity;
    buffer[(*size)++] = (char)(proof->period ? 0xAA : 0xA9);
    buffer[(*size)++] = (char)proof->frames;
    buffer[(*size)++] = (char)(proof->frames >> 8);
    for (unsigned b = 0; b < 4; b++) buffer[(*size)++] = (char)(proof->pending >> (b * 8));
    buffer[(*size)++] = (char)count;
    buffer[(*size)++] = (char)(count >> 8);
    buffer[(*size)++] = proof->confirm;
    if (proof->period) {
        buffer[(*size)++] = (char)period;
        for (unsigned byte = 0; byte < period_bytes; byte++)
            buffer[(*size)++] = (char)question_suffix_pattern_byte(proof, byte * 8, period);
    } else for (unsigned byte = 0; byte < (count + 7) / 8; byte++)
        buffer[(*size)++] = (char)question_suffix_byte(proof, byte * 8, count);
}

static unsigned question_suffix_byte(const QuestionSuffix *proof, unsigned offset, unsigned count) {
    unsigned index = proof->index + offset;
    unsigned shift = index % 8;
    unsigned value = proof->roles[index / 8] >> shift;
    if (shift && index / 8 + 1 < sizeof(proof->roles)) value |= (unsigned)proof->roles[index / 8 + 1] << (8 - shift);
    unsigned remaining = count - offset;
    if (remaining < 8) value &= (1U << remaining) - 1;
    return value;
}

static void question_suffix_read(QuestionSuffix *proof, unsigned frame_count, const char *buffer, unsigned length, unsigned *size) {
    unsigned at = *size;
    *size = length;
    if (length - at < 11) return;
    unsigned tag = (unsigned char)buffer[at++];
    if (tag != 0xA9 && tag != 0xAA) return;
    unsigned frames = (unsigned char)buffer[at++];
    frames |= (unsigned)(unsigned char)buffer[at++] << 8;
    uint32_t pending = 0;
    for (unsigned b = 0; b < 4; b++) pending |= (uint32_t)(unsigned char)buffer[at++] << (b * 8);
    unsigned count = (unsigned char)buffer[at++];
    count |= (unsigned)(unsigned char)buffer[at++] << 8;
    unsigned confirm = (unsigned char)buffer[at++];
    if (!count || frames != frame_count || confirm > 1) return;
    bool valid = tag == 0xAA ? question_suffix_read_pattern(proof, buffer, length, at, count)
        : question_suffix_read_bitmap(proof, buffer, length, at, count);
    if (!valid) return;
    proof->frames = (uint16_t)frames;
    proof->pending = pending;
    proof->confirm = confirm;
    proof->count = (uint16_t)count;
    proof->index = 0;
}

static unsigned question_suffix_period(const QuestionSuffixBuilder *builder) {
    unsigned count = builder->roles.size;
    if (!count) return 0;
    unsigned prefix = count < 128 ? count : 128;
    unsigned *borders = ts_calloc(prefix, sizeof(unsigned));
    for (unsigned i = 1; i < prefix; i++) {
        unsigned matched = borders[i - 1];
        while (matched && builder->roles.contents[i] != builder->roles.contents[matched]) matched = borders[matched - 1];
        if (builder->roles.contents[i] == builder->roles.contents[matched]) matched++;
        borders[i] = matched;
    }
    unsigned period = prefix - borders[prefix - 1];
    ts_free(borders);
    if (period > 64) return 0;
    for (unsigned i = period; i < count; i++)
        if (builder->roles.contents[i] != builder->roles.contents[i % period]) return 0;
    return period;
}

static unsigned question_suffix_bit(const QuestionSuffix *proof, unsigned index) {
    return proof->period ? (unsigned)((proof->pattern >> (index % proof->period)) & 1)
        : (proof->roles[index / 8] >> (index % 8)) & 1;
}

static uint64_t question_suffix_pack_pattern(const QuestionSuffixBuilder *builder, unsigned period) {
    uint64_t pattern = 0;
    for (unsigned i = 0; i < period; i++)
        if (builder->roles.contents[i]) pattern |= (uint64_t)1 << i;
    return pattern;
}

static unsigned question_suffix_pattern_byte(const QuestionSuffix *proof, unsigned offset, unsigned period) {
    unsigned value = 0;
    for (unsigned bit = 0; bit < 8 && offset + bit < period; bit++)
        value |= question_suffix_bit(proof, proof->index + offset + bit) << bit;
    return value;
}

static bool question_suffix_read_pattern(QuestionSuffix *proof, const char *buffer, unsigned length, unsigned at, unsigned count) {
    unsigned period = (unsigned char)buffer[at++];
    if (!period || period > 64 || period > count || at + (period + 7) / 8 != length) return false;
    uint64_t pattern = 0;
    for (unsigned byte = 0; byte < (period + 7) / 8; byte++) pattern |= (uint64_t)(unsigned char)buffer[at++] << (byte * 8);
    if (period < 64 && (pattern >> period)) return false;
    proof->period = (uint8_t)period;
    proof->pattern = pattern;
    return true;
}

static bool question_suffix_read_bitmap(QuestionSuffix *proof, const char *buffer, unsigned length, unsigned at, unsigned count) {
    if (count > sizeof(proof->roles) * 8 || at + (count + 7) / 8 != length) return false;
    proof->period = 0;
    memcpy(proof->roles, buffer + at, (count + 7) / 8);
    return true;
}

#endif
