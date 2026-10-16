import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

assert.equal(process.argv.length, 4, 'Usage: generateIdentifierCharacters.mjs <parser.c> <header>');
const source = readFileSync(process.argv[2], 'utf8');
const tables = ['2', '3'].map((index) => {
  const name = `ts_lex_sym__identifier_token_character_set_${index}`;
  const declarations = [
    ...source.matchAll(new RegExp(`static const [^;]+\\b${name}(?:_\\w+)?\\[[\\s\\S]*?\\n?};`, 'g')),
  ];
  assert.ok(declarations.length > 0, `Missing generated identifier tables: ${name}`);
  const calls = [
    ...source.matchAll(
      new RegExp(`(ts_lex_\\w+_contains(?:_with_ascii)?)\\((${name}_ascii, [^\\n]+?), lookahead\\)`, 'g')
    ),
  ];
  const expressions = new Set(calls.map((match) => `${match[1]}(${match[2]}, character)`));
  assert.equal(expressions.size, 1, `Expected one identifier lookup representation: ${name}`);
  const [expression] = expressions;
  assert.ok(expression, `Missing identifier lookup: ${name}`);
  return { declarations: declarations.map((match) => match[0]).join('\n'), expression };
});
const helpers = [...new Set(tables.map(({ expression }) => expression.slice(0, expression.indexOf('('))))].map(
  (name) => {
    const matches = [...source.matchAll(new RegExp(`static inline bool ${name}\\([\\s\\S]*?\\n}`, 'g'))];
    assert.equal(matches.length, 1, `Expected one generated lookup helper: ${name}`);
    return matches[0][0];
  }
);
const header = `#ifndef TREE_SITTER_C_SHARP_IDENTIFIER_CHARACTERS_H_
#define TREE_SITTER_C_SHARP_IDENTIFIER_CHARACTERS_H_

#include "tree_sitter/parser.h"

${tables.map(({ declarations }) => declarations).join('\n\n')}

${helpers.join('\n\n')}

static bool is_id_start(int32_t character) {
    return character != 0x5c && ${tables[0].expression};
}

static bool is_id_continue(int32_t character) {
    return character != 0x5c && ${tables[1].expression};
}

#endif
`
  .replaceAll('ts_lex_', 'scanner_identifier_')
  .replaceAll(/[ \t]+$/gm, '');
writeFileSync(process.argv[3], header);
