import { Language, Parser } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

import { editTree, syntaxSnapshot } from '../helpers/syntaxSnapshot';

let language: Language;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load('tree-sitter-c_sharp.wasm');
});

const interpolate = [
  (hole: string) => `$"{${hole}}"`,
  (hole: string) => `$@"{${hole}}"`,
  (hole: string) => `$"""{${hole}}"""`,
  (hole: string) => `$$"""{{${hole}}}"""`,
];

test('keeps interpolation format text outside access and nullable expressions', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const expression of [
      'a?[0]',
      'a?.b?[0]',
      'a?[c ? 0 : 1]',
      'x is T?[]',
      'a as T?[]',
      'a?[0]?.b',
      'a?[0]?[1]',
    ]) {
      for (const format of ['?foo', '??=', '[]', 'C:D']) {
        for (const wrap of interpolate) {
          const source = `var r = ${wrap(`${expression}:${format}`)};`;
          const tree = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, source).toBe(false);
            const hole = tree.rootNode.descendantsOfType('interpolation')[0]!;
            expect(hole.namedChildren[1]?.text, source).toBe(expression);
            expect(
              hole.descendantsOfType('interpolation_format_clause').map((node) => node.text),
              source
            ).toEqual([`:${format}`]);
            expect(
              hole.descendantsOfType('conditional_expression').map((node) => node.text),
              source
            ).toEqual(expression.includes('c ?') ? ['c ? 0 : 1'] : []);
          } finally {
            tree.delete();
          }
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves nested expressions and multiple interpolation holes', () => {
  const parser = new Parser().setLanguage(language);
  const nested = 'x is a?.b ? [] : a is U?[] ? [a] : b';
  try {
    for (const wrap of interpolate) {
      for (const expression of [
        `(${nested})`,
        'f($"{a?[0]}")?[0]',
        'a?[f("?:", 0)]',
        'a?[b?[0] ?? 1]',
        'a?[0] + f($"{(c ? [1] : [2])}")?[1]',
      ]) {
        const source = `var r = ${wrap(`${expression},10:?foo`)} + ${wrap('a?[0]?[1]:C:D')};`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const holes = tree.rootNode.descendantsOfType('interpolation');
          expect(holes[0]!.namedChildren[1]?.text, source).toBe(expression);
          expect(holes[0]!.namedChildren.find((node) => node.type === 'interpolation_alignment_clause')?.text).toBe(
            ',10'
          );
          expect(
            tree.rootNode.descendantsOfType('interpolation_format_clause').map((node) => node.text),
            source
          ).toEqual([':?foo', ':C:D']);
          expect(
            tree.rootNode.descendantsOfType('conditional_expression').map((node) => node.text),
            source
          ).toEqual(
            expression.startsWith('(x is')
              ? [nested, 'a is U?[] ? [a] : b']
              : expression.includes('(c ?')
                ? ['c ? [1] : [2]']
                : []
          );
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps incremental interpolation boundaries consistent through nested and incomplete edits', () => {
  const parser = new Parser().setLanguage(language);
  const sources = [
    'var r = $"{a?[0]:?foo}";',
    'var r = $"{(c ? a?[0] : b?[1]):?foo}";',
    'var r = $"{(c ? a?[0] : b?[1]),10:??=}";',
    'var r = $"{(c ? a?[0] : ):??=}";',
    'var r = $"{f($"{a?[0]}")?[0]:?foo}";',
    'var r = $"{a?[0] + f($"{(c ? [1] : [2])}")?[1]:?foo}";',
    'var r = $$"""{{a?[c ? 0 : 1]:??=}}""";',
    'var r = $$"""{{x is T?[]:C:D}} {{a?[0]:?foo}}""";',
  ].map((source) => `${source}\nclass Following { int Value => 1; }`);
  let previous = sources[0]!;
  let tree = parser.parse(previous)!;
  try {
    for (const source of [...sources.slice(1), ...sources.toReversed()]) {
      editTree(tree, previous, source);
      const incremental = parser.parse(source, tree)!;
      const fresh = parser.parse(source)!;
      try {
        expect(syntaxSnapshot(incremental.rootNode), source).toEqual(syntaxSnapshot(fresh.rootNode));
        expect(
          fresh.rootNode.descendantsOfType('class_declaration').map((node) => node.text),
          source
        ).toEqual(['class Following { int Value => 1; }']);
        if (!source.includes(': )')) expect(fresh.rootNode.hasError, source).toBe(false);
      } finally {
        tree.delete();
        tree = incremental;
        fresh.delete();
        previous = source;
      }
    }
  } finally {
    tree.delete();
    parser.delete();
  }
});
