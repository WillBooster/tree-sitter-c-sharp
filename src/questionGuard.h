#ifndef TREE_SITTER_C_SHARP_QUESTION_GUARD_H_
#define TREE_SITTER_C_SHARP_QUESTION_GUARD_H_

typedef enum { GUARD_NONE, GUARD_NULLABLE, GUARD_TERNARY, GUARD_NULLABLE_BOUND } QuestionGuardRole;

enum { GUARD_ROLE_MASK = 3, GUARD_SUFFIX_COMPLETE = 4 };

typedef struct {
    uint8_t role;
    bool handoff;
    uint32_t prefix;
} QuestionGuardCertificate;

typedef struct {
    unsigned count, prefix, runs;
    uint8_t first, last;
} RankTypeSummary;

static RankTypeSummary rank_type_merge(RankTypeSummary left, RankTypeSummary right) {
    if (!left.count) return right;
    if (!right.count) return left;
    bool join = left.last == right.first;
    if (join && left.runs == 1) left.prefix += right.prefix;
    left.count += right.count;
    left.runs += right.runs - join;
    left.last = right.last;
    return left;
}

static RankTypeSummary rank_type_role(unsigned role) {
    return (RankTypeSummary){.count = 1, .prefix = 1, .runs = 1, .first = role, .last = role};
}

#endif
