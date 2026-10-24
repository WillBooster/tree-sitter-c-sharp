#ifndef TREE_SITTER_C_SHARP_QUESTION_SUFFIX_H_
#define TREE_SITTER_C_SHARP_QUESTION_SUFFIX_H_

typedef struct {
    uint16_t count, index, frames;
    uint32_t pending;
    bool confirm;
    uint8_t roles[TREE_SITTER_SERIALIZATION_BUFFER_SIZE];
} QuestionSuffix;

typedef struct {
    bool regular, boundary;
    unsigned role;
    Array(char) roles;
    Array(unsigned) live;
} QuestionSuffixBuilder;

static void question_suffix_clear(QuestionSuffix *proof) {
    proof->count = proof->index = 0;
    proof->confirm = false;
}

static unsigned question_suffix_take(QuestionSuffix *proof, bool binding, bool eligible, unsigned frames, uint32_t pending) {
    if (proof->index >= proof->count) return 0;
    if (!eligible || proof->frames != frames || proof->pending != pending) {
        question_suffix_clear(proof);
        return 0;
    }
    unsigned role = 2;
    if (binding) {
        unsigned index = proof->index++;
        role = ((proof->roles[index / 8] >> (index % 8)) & 1) ? 2 : 1;
    }
    proof->confirm = role == 2;
    return role;
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
    if (count > sizeof(proof->roles) * 8) count = sizeof(proof->roles) * 8;
    memset(proof->roles, 0, sizeof(proof->roles));
    for (unsigned i = 0; i < count; i++)
        if (builder->roles.contents[i]) proof->roles[i / 8] |= 1U << (i % 8);
    proof->count = (uint16_t)count;
    proof->index = 0;
    proof->frames = (uint16_t)frames;
    proof->pending = pending;
    proof->confirm = false;
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

static void question_suffix_serialize(const QuestionSuffix *proof, char *buffer, unsigned *size) {
    if (proof->index >= proof->count) return;
    unsigned remaining = proof->count - proof->index;
    unsigned available = TREE_SITTER_SERIALIZATION_BUFFER_SIZE - *size;
    if (available <= 10) return;
    unsigned count = remaining < (available - 10) * 8 ? remaining : (available - 10) * 8;
    buffer[(*size)++] = (char)0xA9;
    buffer[(*size)++] = (char)proof->frames;
    buffer[(*size)++] = (char)(proof->frames >> 8);
    for (unsigned b = 0; b < 4; b++) buffer[(*size)++] = (char)(proof->pending >> (b * 8));
    buffer[(*size)++] = (char)count;
    buffer[(*size)++] = (char)(count >> 8);
    buffer[(*size)++] = proof->confirm;
    for (unsigned byte = 0; byte < (count + 7) / 8; byte++)
        buffer[(*size)++] = (char)question_suffix_byte(proof, byte * 8, count);
}

static void question_suffix_read(QuestionSuffix *proof, unsigned frame_count, const char *buffer, unsigned length, unsigned *size) {
    unsigned at = *size;
    *size = length;
    if (length - at < 11 || (unsigned char)buffer[at++] != 0xA9) return;
    unsigned frames = (unsigned char)buffer[at++];
    frames |= (unsigned)(unsigned char)buffer[at++] << 8;
    uint32_t pending = 0;
    for (unsigned b = 0; b < 4; b++) pending |= (uint32_t)(unsigned char)buffer[at++] << (b * 8);
    unsigned count = (unsigned char)buffer[at++];
    count |= (unsigned)(unsigned char)buffer[at++] << 8;
    unsigned confirm = (unsigned char)buffer[at++];
    if (!count || count > sizeof(proof->roles) * 8 || frames != frame_count || confirm > 1 || at + (count + 7) / 8 != length) return;
    proof->frames = (uint16_t)frames;
    proof->pending = pending;
    proof->confirm = confirm;
    proof->count = (uint16_t)count;
    proof->index = 0;
    memcpy(proof->roles, buffer + at, (count + 7) / 8);
}

#endif
