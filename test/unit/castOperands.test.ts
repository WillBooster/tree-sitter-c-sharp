import { Language, Parser } from '@willbooster/web-tree-sitter';
import { afterAll, beforeAll, expect, test } from 'vitest';

import { editTree, syntaxSnapshot } from '../helpers/syntaxSnapshot';

let parser: Parser;

beforeAll(async () => {
  await Parser.init();
  parser = new Parser().setLanguage(await Language.load('tree-sitter-c_sharp.wasm'));
});

afterAll(() => parser.delete());

test('retains prefix ranges and queries as cast operands with their syntax boundaries', () => {
  for (const [expression, type, value] of [
    ['(int)..b', 'int', '..b'],
    ['(int)..', 'int', '..'],
    ['(int)..b?.c', 'int', '..b?.c'],
    ['(int)..b + c', 'int', '..b'],
    ['(T?)..b ?? c', 'T?', '..b'],
    ['(int)..b switch { _ => c }', 'int', '..b'],
    ['(int)..b = c', 'int', '..b'],
    ['(int)..a?.b = c', 'int', '..a?.b = c'],
    ['(int).. ..b', 'int', '.. ..b'],
    ['(global::T)..b', 'global::T', '..b'],
    ['(T[])..b', 'T[]', '..b'],
    ['(T[,])..b', 'T[,]', '..b'],
    ['(T*)..b', 'T*', '..b'],
    ['(int)from x in y select x + z', 'int', 'from x in y select x + z'],
    ['(T)from x in y select x?.M', 'T', 'from x in y select x?.M'],
    ['(A.B)from x in y select x', 'A.B', 'from x in y select x'],
    ['(int)b + c', 'int', 'b'],
    ['(int)b..c', 'int', 'b'],
    ['(T).5', 'T', '.5'],
    ['(T[]).5', 'T[]', '.5'],
    ['(T)!..b', 'T', '!..b'],
  ]) {
    const tree = parser.parse(`var r = ${expression};`)!;
    try {
      expect(tree.rootNode.hasError, expression).toBe(false);
      const casts = tree.rootNode.descendantsOfType('cast_expression');
      expect(casts, expression).toHaveLength(1);
      expect(casts[0]?.childForFieldName('type')?.text, expression).toBe(type);
      expect(casts[0]?.childForFieldName('value')?.text, expression).toBe(value);
    } finally {
      tree.delete();
    }
  }
});

test('keeps cast range and query operands inside constant patterns', () => {
  for (const type of ['int', 'T?', 'global::T', 'T[]', 'T[,]']) {
    for (const operand of ['..b', 'from y in z select y']) {
      const expression = `x is (${type})${operand}`;
      const tree = parser.parse(`var r = ${expression};`)!;
      try {
        expect(tree.rootNode.hasError, expression).toBe(false);
        const pattern = tree.rootNode.descendantsOfType('is_pattern_expression')[0];
        expect(pattern?.text, expression).toBe(expression);
        expect(pattern?.childForFieldName('pattern')?.type, expression).toBe('constant_pattern');
        expect(pattern?.descendantsOfType('cast_expression')[0]?.childForFieldName('value')?.text, expression).toBe(
          operand
        );
      } finally {
        tree.delete();
      }
    }
  }
});

test('keeps expression-shaped cast candidates as range starts', () => {
  for (const name of ['T', 'A.B', 'List<int>', 'A.B<int>', 'global::T.A', '(T,U)', 'T[1]']) {
    const expression = `(${name})..b`;
    const tree = parser.parse(`var r = ${expression};`)!;
    try {
      expect(tree.rootNode.hasError, expression).toBe(false);
      expect(tree.rootNode.descendantsOfType('cast_expression'), expression).toHaveLength(0);
      expect(tree.rootNode.descendantsOfType('range_expression')[0]?.text, expression).toBe(expression);
    } finally {
      tree.delete();
    }
  }
});

test('allows escaped operator keywords and longer identifiers as cast operands', () => {
  for (const value of [
    'island',
    'asValue',
    '@is',
    '@as',
    '!@is',
    '~@as',
    '!!@is',
    String.raw`\u0069s`,
    String.raw`\u0061s`,
  ]) {
    const tree = parser.parse(`var result = (T)${value};`)!;
    try {
      expect(tree.rootNode.hasError).toBe(false);
      const cast = tree.rootNode.descendantsOfType('cast_expression')[0]!;
      expect(cast.childForFieldName('type')!.text).toBe('T');
      expect(cast.childForFieldName('value')!.text).toBe(value);
    } finally {
      tree.delete();
    }
  }
});

test('keeps definite casts as constants in positional subpatterns', () => {
  for (const type of ['T[]', 'T[,]', 'T[][]', 'T?[]', 'T[]?', 'N.T[]', 'T<U>[]', '(T,U)[]']) {
    for (const value of ['a', 'a.B', 'a?.B', '+a', '-a', '*a', '&a', '^a', '++a', '--a']) {
      const castText = `(${type})${value}`;
      for (const source of [
        `var r = x is R(${castText});`,
        `var r = x is R(Name: ${castText});`,
        `var r = x is R((${castText}) captured);`,
        `var r = x switch { R(${castText}) => 1, _ => 0 };`,
      ]) {
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const casts = tree.rootNode.descendantsOfType('cast_expression');
          expect(casts, source).toHaveLength(1);
          const cast = casts[0]!;
          expect(cast.text, source).toBe(castText);
          expect(cast.childForFieldName('type')?.text, source).toBe(type);
          expect(cast.childForFieldName('value')?.text, source).toBe(value);
          expect(cast.parent?.type, source).toBe('constant_pattern');
          expect(tree.rootNode.descendantsOfType('invocation_expression'), source).toHaveLength(0);
        } finally {
          tree.delete();
        }
      }
    }
  }
});

test('retains array patterns when no cast operand follows the closing parenthesis', () => {
  for (const [pattern, kind] of [
    ['(T[]) { P: 1 }', 'recursive_pattern'],
    ['(T[] item)', 'parenthesized_pattern'],
    ['(T[])', 'parenthesized_pattern'],
    ['(T<U>[])', 'parenthesized_pattern'],
  ] as const) {
    const source = `var r = x is R(${pattern});`;
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError, source).toBe(false);
      expect(tree.rootNode.descendantsOfType('cast_expression'), source).toHaveLength(0);
      expect(
        tree.rootNode.descendantsOfType(kind).map((node) => node.text),
        source
      ).toContain(pattern);
      expect(
        tree.rootNode.descendantsOfType('array_type').map((node) => node.text),
        source
      ).toEqual([pattern.includes('<U>') ? 'T<U>[]' : 'T[]']);
    } finally {
      tree.delete();
    }
  }
});

test('rechecks cast closing proofs after operand and type edits', () => {
  for (const patterns of [
    ['R((T[])a.B)', 'R((T[]) { P: 1 })'],
    ['R((T<U>[])a)', 'R((T<U>[]))'],
    ['R((T[])a)', 'R((T[] /* gap */ ) /* operand */ a.B)'],
    ['R(((T)a))', 'R(((T[] /* gap */ )a))'],
  ]) {
    for (const [before, after] of [patterns, patterns.toReversed()]) {
      const source = `var 名 = x is ${before};`;
      const updated = `var 名 = x is ${after};`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        editTree(tree, source, updated);
        const incremental = parser.parse(updated, tree)!;
        const fresh = parser.parse(updated)!;
        try {
          expect(incremental.rootNode.hasError, updated).toBe(false);
          expect(fresh.rootNode.hasError, updated).toBe(false);
          expect(syntaxSnapshot(incremental.rootNode), updated).toEqual(syntaxSnapshot(fresh.rootNode));
        } finally {
          incremental.delete();
          fresh.delete();
        }
      } finally {
        tree.delete();
      }
    }
  }
});
