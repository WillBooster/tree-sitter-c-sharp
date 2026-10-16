import { Language, Parser } from '@willbooster/web-tree-sitter';
import { afterAll, beforeAll, expect, test } from 'vitest';

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
  for (const operand of ['..b', 'from y in z select y']) {
    const expression = `x is (T?)${operand}`;
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
