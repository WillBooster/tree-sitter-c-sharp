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
    ['(T[])^a', 'T[]', '^a'],
    ['(T[])++a', 'T[]', '++a'],
    ['(T[])--a', 'T[]', '--a'],
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

test('keeps parenthesized expressions and patterns before contextual continuations', () => {
  for (const statement of [
    'var result = (a) switch { _ => 1 };',
    'switch (x) { case ((A)) when c: break; }',
    'var result = x switch { ((A)) when c => 1, _ => 2 };',
    'var result = ((a)) with { P = 1 };',
    'var result = from x in (a) select x;',
    'var result = from x in xs join y in (b) on x equals y select x;',
    'var result = from x in xs group x by (a) into y select y;',
    'var result = from x in xs where (a) select x;',
    'var result = from x in xs let y = (a) where y select x;',
  ]) {
    const source = `class C { object M() { ${statement} } }`;
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError, source).toBe(false);
      expect(tree.rootNode.descendantsOfType('cast_expression'), source).toHaveLength(0);
    } finally {
      tree.delete();
    }
  }
});

test('preserves division after ambiguous parenthesized cast candidates', () => {
  for (const operand of ['T', 'A.B']) {
    for (const operator of ['/', '/* before */ / /* after */']) {
      const expression = `(${operand}) ${operator} a`;
      for (const wrapped of [expression, `x is R(${expression})`, `x is { P: ${expression} }`]) {
        const tree = parser.parse(`var result = ${wrapped};`)!;
        try {
          expect(tree.rootNode.hasError, wrapped).toBe(false);
          expect(tree.rootNode.descendantsOfType('cast_expression'), wrapped).toHaveLength(0);
          const division = tree.rootNode
            .descendantsOfType('binary_expression')
            .find((node) => node.childForFieldName('operator')?.text === '/')!;
          expect(division?.childForFieldName('left')?.text, wrapped).toBe(`(${operand})`);
          expect(division?.childForFieldName('right')?.text, wrapped).toBe('a');
        } finally {
          tree.delete();
        }
      }
    }
  }
});

test('keeps indexed parenthesized operands before surrounding binary operators', () => {
  for (const receiver of ['a[i]', 'a[0]', 'arr[i, j]']) {
    for (const operator of ['+', '-', '*', '&', '&&', '^', '|']) {
      const expression = `(${receiver}) ${operator} b`;
      const tree = parser.parse(`var result = ${expression};`)!;
      try {
        expect(tree.rootNode.hasError, expression).toBe(false);
        expect(tree.rootNode.descendantsOfType('cast_expression'), expression).toHaveLength(0);
        const binary = tree.rootNode.descendantsOfType('binary_expression')[0]!;
        expect(binary?.text, expression).toBe(expression);
        expect(binary.childForFieldName('left')?.text, expression).toBe(`(${receiver})`);
        expect(binary.childForFieldName('operator')?.text, expression).toBe(operator);
        expect(binary.childForFieldName('right')?.text, expression).toBe('b');
      } finally {
        tree.delete();
      }
    }
  }
});

test('retains negated parenthesized and collection cast operands in constant patterns', () => {
  for (const type of ['T', 'T[]', 'T[,]']) {
    for (const value of ['!(a)', '![a]']) {
      const expression = `x is R((${type})${value})`;
      const tree = parser.parse(`var result = ${expression};`)!;
      try {
        expect(tree.rootNode.hasError, expression).toBe(false);
        const cast = tree.rootNode.descendantsOfType('cast_expression')[0]!;
        expect(cast?.childForFieldName('type')?.text, expression).toBe(type);
        expect(cast.childForFieldName('value')?.text, expression).toBe(value);
        expect(cast.parent?.type, expression).toBe('constant_pattern');
      } finally {
        tree.delete();
      }
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
    for (const value of ['a', 'a.B', 'a?.B', '+a', '-a', '*a', '&a']) {
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
