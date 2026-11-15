import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test } from 'vitest';

const scriptPath = path.resolve(import.meta.dirname, '../../script/generateIdentifierCharacters.mjs');

interface SyntheticTableOptions {
  deadContinuationState?: boolean;
}

test('decodes v23 extended transitions with odd tag-op counts and excludes extended skip transitions', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'cs-id-chars-'));
  try {
    const parserPath = path.join(tempDir, 'parser.c');
    const headerPath = path.join(tempDir, 'identifierCharacters.h');
    writeFileSync(parserPath, buildSyntheticParserSource());
    execFileSync(process.execPath, [scriptPath, parserPath, headerPath], { encoding: 'utf8' });
    const header = readFileSync(headerPath, 'utf8');

    const startBlock = header.match(/identifier_start_ranges\[\]\s*=\s*\{([\s\S]*?)\};/)?.[1] ?? '';
    const continueBlock = header.match(/identifier_continue_ranges\[\]\s*=\s*\{([\s\S]*?)\};/)?.[1] ?? '';
    expect(startBlock.trim()).toBe('{0x100, 0x17f},');
    expect(continueBlock.trim()).toBe('{0x100, 0x17f}, {0x300, 0x36f},');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('treats states with template 0 as dead even when comb slots hold template 0', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'cs-id-chars-dead-'));
  try {
    const parserPath = path.join(tempDir, 'parser.c');
    const headerPath = path.join(tempDir, 'identifierCharacters.h');
    writeFileSync(parserPath, buildSyntheticParserSource({ deadContinuationState: true }));
    expect(() => execFileSync(process.execPath, [scriptPath, parserPath, headerPath], { stdio: 'pipe' })).toThrow(
      /Unexpected ASCII identifier-continuation membership/
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

function buildSyntheticParserSource(options: SyntheticTableOptions = {}): string {
  const asciiClass = Array.from({ length: 128 }, (_, cp) => {
    if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a) || cp === 0x5f) return 1;
    if (cp >= 0x30 && cp <= 0x39) return 2;
    return 0;
  });

  const unicodeSegments: [number, number][] = [
    [0xff, 0],
    [0x01_7f, 3],
    [0x02_ff, 0],
    [0x03_6f, 4],
    [0x1f_ff, 0],
    [0x20_0a, 5],
    [0x10_ff_ff, 0],
  ];

  // Row 0 (base 0) keeps unused comb entries with tmpl=0 and action=2 so a missing tmpl===0 guard falsely matches.
  const combPairs: [number, number][] = [
    [1, 0],
    [0, 2],
    [0, 2],
    [0, 2],
    [0, 0],
    [0, 0],
    [1, 0],
    [1, 2],
    [1, 0],
    [1, 0x80_00],
    [1, 0],
    [1, 0x80_04],
    [2, 0],
    [2, 2],
    [2, 2],
    [2, 0x80_00],
    [2, 0x80_00],
    [2, 0x80_06],
  ];

  const extTransitions = [2, 1, 0, 0xff_ff, 1, 0x80_00, 2, 0x80_01, 0, 0xff_ff];
  const extAccepts = [20, 7, 0];

  const stateMeta = [
    6,
    1,
    0,
    0,
    options.deadContinuationState ? 0 : 12,
    options.deadContinuationState ? 0 : 2,
    0,
    8,
    0,
    0,
    0,
    0x80_00,
  ];

  const stateCount = 3;
  const templateCount = 3;
  const classCount = 6;
  const unicodeRanges = unicodeSegments.length;
  const combLen = combPairs.length;
  const totalWords = 141 + unicodeRanges * 3 + stateCount * 4 + combLen * 2 + extTransitions.length + extAccepts.length;

  const table = [
    ...u32Words(totalWords),
    stateCount,
    templateCount,
    classCount,
    unicodeRanges,
    1,
    ...u32Words(combLen),
    ...u32Words(extTransitions.length),
    ...u32Words(extAccepts.length),
    ...asciiClass,
    ...unicodeSegments.flatMap(([end]) => u32Words(end)),
    ...unicodeSegments.map(([, cls]) => cls),
    ...stateMeta,
    ...combPairs.flat(),
    ...extTransitions,
    ...extAccepts,
  ];

  return `
enum ts_symbol_identifiers {
  anon_sym_if = 1,
  sym__identifier_token = 7,
};
static const uint8_t ts_string_data[] = { 105, 102, 0 };
static const uint32_t ts_symbol_name_offsets[] = {
  [anon_sym_if] = 0,
};
static const uint8_t ts_symbol_metadata[] = {
  [anon_sym_if] = 1,
  [sym__identifier_token] = 3,
};
static const uint16_t ts_lex_table[] = {
  ${table.join(', ')}
};
`;
}

function u32Words(value: number): [number, number] {
  return [value & 0xff_ff, (value >>> 16) & 0xff_ff];
}
