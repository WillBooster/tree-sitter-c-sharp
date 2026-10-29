#ifndef TREE_SITTER_C_SHARP_NULLABLE_RANK_MEMO_H_
#define TREE_SITTER_C_SHARP_NULLABLE_RANK_MEMO_H_

static void rank_evaluate_collected_modes(const RankTokens *tokens, unsigned target, RankParse modes[2], bool collect);

static void rank_evaluate_modes(const RankTokens *tokens, unsigned target, RankParse modes[2]) {
    rank_evaluate_collected_modes(tokens, target, modes, false);
}

static void rank_evaluate_collected_modes(const RankTokens *tokens, unsigned target, RankParse modes[2], bool collect) {
    RankParse *memo = ts_calloc((size_t)tokens->size * 2, sizeof(RankParse));
    for (unsigned end = tokens->size; end > 0; end--) {
        unsigned start = end - 1;
        memo[start * 2 + 1] = rank_parse(tokens, memo, start, true, target, collect);
        memo[start * 2] = rank_parse(tokens, memo, start, false, target, collect);
    }
    modes[0] = memo[0];
    modes[1] = memo[1];
    ts_free(memo);
}

static RankParse rank_parse(const RankTokens *tokens, const RankParse *memo, unsigned start, bool force, unsigned target, bool collect) {
    RankParse result = {.end = start, .valid = true};
    RankToken first = tokens->contents[start];
    unsigned pos = start;
    bool nested = first.kind == RANK_NESTED_ATOM;
    bool primary = first.kind == RANK_ATOM || nested;
    if (first.kind == RANK_LAMBDA) return memo[(start + 1) * 2];
    if (primary || first.kind == RANK_NONPRIMARY_ATOM) {
        result = rank_atom_summary(first, force);
        pos++;
    }
    else if (first.kind == RANK_DEFINITE_TYPE || first.kind == RANK_IS_TYPE) {
        pos = rank_parse_type(tokens, memo, pos, force, target, &result, collect);
    } else {
        result.valid = false;
        return result;
    }
    while (result.valid && (tokens->contents[pos].kind == RANK_DEFINITE_TYPE || tokens->contents[pos].kind == RANK_IS_TYPE || tokens->contents[pos].kind == RANK_QUESTION || tokens->contents[pos].kind == RANK_CONTINUATION || tokens->contents[pos].kind == RANK_AS || tokens->contents[pos].kind == RANK_SWITCH || tokens->contents[pos].kind == RANK_BINARY || tokens->contents[pos].kind == RANK_BINARY_PRIMARY)) {
        if (tokens->contents[pos].kind == RANK_DEFINITE_TYPE || tokens->contents[pos].kind == RANK_IS_TYPE) {
            RankParse suffix = memo[pos * 2 + force];
            result.valid &= suffix.valid;
            result.collection_ternary |= suffix.collection_ternary;
            result.suffix_flags |= suffix.suffix_flags;
            result.types = rank_type_merge(result.types, suffix.types);
            if (suffix.role) result.role = suffix.role;
            result.end = suffix.end;
            return result;
        }
        if (tokens->contents[pos].kind == RANK_AS || tokens->contents[pos].kind == RANK_SWITCH || tokens->contents[pos].kind == RANK_BINARY || tokens->contents[pos].kind == RANK_BINARY_PRIMARY) {
            result.valid &= !force || !tokens->contents[pos].force_unsafe;
            result.collection_ternary |= tokens->contents[pos].force_unsafe;
            primary = tokens->contents[pos].kind == RANK_BINARY_PRIMARY;
            pos++;
            continue;
        }
        if (tokens->contents[pos].kind == RANK_CONTINUATION) {
            if (!primary) { result.valid = false; break; }
            pos++;
            continue;
        }
        RankParse when_true = memo[(pos + 1) * 2 + force];
        if (primary && tokens->contents[pos].collection && (force || tokens->contents[when_true.end].kind != RANK_COLON)) {
            pos += 2;
            continue;
        }
        pos = rank_conditional(tokens, memo, pos, force, target, &result, collect);
        primary = false;
    }
    result.end = pos;
    return result;
}

static RankParse rank_atom_summary(RankToken atom, bool force) {
    if (atom.kind == RANK_NESTED_ATOM) return atom.nested[force];
    return (RankParse){.valid = !force || !atom.force_unsafe, .collection_ternary = atom.force_unsafe};
}

static unsigned rank_parse_type(const RankTokens *tokens, const RankParse *memo, unsigned pos, bool force, unsigned target, RankParse *result, bool collect) {
    unsigned question = pos + 1;
    if (tokens->contents[pos].kind != RANK_DEFINITE_TYPE) {
        RankParse after = memo[(question + 1) * 2 + force];
        if (!after.valid) { result->valid = false; return after.end; }
        if (tokens->contents[after.end].kind == RANK_COLON) {
            result->suffix_flags |= tokens->contents[pos].suffix_flags;
            if (collect && tokens->contents[pos].guard_candidate) result->types = rank_type_merge(result->types, rank_type_role(GUARD_TERNARY));
            return question;
        }
    }
    if (collect && tokens->contents[pos].guard_candidate) result->types = rank_type_merge(result->types, rank_type_role(GUARD_NULLABLE));
    if (question == target) result->role = RANK_NULLABLE_LAST;
    return question + 2;
}

static unsigned rank_conditional(const RankTokens *tokens, const RankParse *memo, unsigned pos, bool force, unsigned target, RankParse *result, bool collect) {
    RankParse when_true = memo[(pos + 1) * 2 + force];
    if (tokens->contents[when_true.end].kind != RANK_COLON && !force && when_true.collection_ternary) {
        RankParse retry = memo[(pos + 1) * 2 + 1];
        if (retry.valid && tokens->contents[retry.end].kind == RANK_COLON) when_true = retry;
    }
    if (pos == target) result->role = RANK_TERNARY;
    result->suffix_flags |= tokens->contents[pos].suffix_flags;
    result->types = rank_type_merge(result->types, when_true.types);
    result->suffix_flags |= when_true.suffix_flags;
    if (when_true.role) result->role = when_true.role;
    result->collection_ternary |= tokens->contents[pos + 1].kind == RANK_ATOM && tokens->contents[pos + 1].collection;
    result->collection_ternary |= when_true.collection_ternary;
    result->valid &= when_true.valid;
    if (tokens->contents[when_true.end].kind == RANK_COLON) {
        RankParse alternative = memo[(when_true.end + 1) * 2 + force];
        result->types = rank_type_merge(result->types, alternative.types);
        result->suffix_flags |= alternative.suffix_flags;
        if (alternative.role) result->role = alternative.role;
        result->collection_ternary |= alternative.collection_ternary;
        result->valid &= alternative.valid;
        pos = alternative.end;
    } else {
        result->valid = false;
        pos = when_true.end;
    }
    return pos;
}

#endif
