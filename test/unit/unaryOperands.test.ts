import { Language, Parser } from '@willbooster/web-tree-sitter';
import { afterAll, beforeAll, expect, test } from 'vitest';

let parser: Parser;

beforeAll(async () => {
  await Parser.init();
  parser = new Parser().setLanguage(await Language.load('tree-sitter-c_sharp.wasm'));
});

afterAll(() => parser.delete());

test('keeps compound ampersand tokens distinct from trivia-separated address operators', () => {
  for (const expression of ['&&a', '&=a']) {
    const tree = parser.parse(`class C { unsafe void M() { var result = ${expression}; } }`)!;
    try {
      expect(tree.rootNode.hasError, expression).toBe(true);
    } finally {
      tree.delete();
    }
  }
  for (const expression of ['& &a', '&/* gap */&a', '&\n&a']) {
    const tree = parser.parse(`class C { unsafe void M() { var result = ${expression}; } }`)!;
    try {
      expect(tree.rootNode.hasError, expression).toBe(false);
      expect(tree.rootNode.descendantsOfType('prefix_unary_expression'), expression).toHaveLength(2);
    } finally {
      tree.delete();
    }
  }
});

test('retains logical and assignment ampersands after suppressed receivers', () => {
  for (const receiver of ['f<T>(a)', '(a[i])']) {
    for (const operator of ['&&', '&=']) {
      const expression = `${receiver}!${operator}b`;
      const tree = parser.parse(`var result = ${expression};`)!;
      try {
        expect(tree.rootNode.hasError, expression).toBe(false);
        expect(tree.rootNode.descendantsOfType('cast_expression'), expression).toHaveLength(0);
        const operation = tree.rootNode.descendantsOfType(
          operator === '&&' ? 'binary_expression' : 'assignment_expression'
        )[0]!;
        expect(operation?.childForFieldName('left')?.text, expression).toBe(`${receiver}!`);
        expect(operation?.childForFieldName('operator')?.text, expression).toBe(operator);
        expect(operation?.childForFieldName('right')?.text, expression).toBe('b');
      } finally {
        tree.delete();
      }
    }
  }
});

test('retains query and prefix-range operands within unary operators and await', () => {
  for (const operator of ['!', '+', '-', '~', '^', '*', '&', '++', '--', 'await ']) {
    for (const [suffix, operand] of [
      ['from x in y select x + z', 'from x in y select x + z'],
      ['from x in y select x = z', 'from x in y select x = z'],
      ['..b', '..b'],
      ['..', '..'],
      ['..b + c', '..b'],
      ['..b..c', '..b'],
      ['.. ..b', '.. ..b'],
      ['..b = c', '..b'],
      ['..a?.b = c', '..a?.b = c'],
    ] as const) {
      const expression = `${operator}${suffix}`;
      const tree = parser.parse(`var r = ${expression};`)!;
      try {
        expect(tree.rootNode.hasError, expression).toBe(false);
        const node = tree.rootNode.descendantsOfType(
          operator === 'await ' ? 'await_expression' : 'prefix_unary_expression'
        )[0];
        expect(node?.text, expression).toBe(`${operator}${operand}`);
        expect(node?.namedChild(0)?.text, expression).toBe(operand);
        expect(node?.namedChild(0)?.type, expression).toBe(
          operand.startsWith('from ') ? 'query_expression' : 'range_expression'
        );
        if (suffix === '..b = c') {
          const assignment = tree.rootNode.descendantsOfType('assignment_expression')[0];
          expect(assignment?.childForFieldName('left')?.text, expression).toBe(`${operator}..b`);
          expect(assignment?.childForFieldName('right')?.text, expression).toBe('c');
        }
      } finally {
        tree.delete();
      }
    }
  }
});

test('preserves unary query and range operands inside surrounding expressions', () => {
  for (const [expression, unary] of [
    ['a && !from x in y select x', '!from x in y select x'],
    ['F(!from x in y select x)', '!from x in y select x'],
    ['!-..b', '!-..b'],
    ['await !from x in y select x', '!from x in y select x'],
    ['x is !..b', '!..b'],
  ] as const) {
    const tree = parser.parse(`var r = ${expression};`)!;
    try {
      expect(tree.rootNode.hasError, expression).toBe(false);
      expect(tree.rootNode.descendantsOfType('prefix_unary_expression')[0]?.text, expression).toBe(unary);
      if (expression.startsWith('x is ')) {
        expect(tree.rootNode.descendantsOfType('constant_pattern')[0]?.text, expression).toBe(unary);
      }
    } finally {
      tree.delete();
    }
  }
});

test('keeps element access before ternary prefix-range arms', () => {
  for (const [expression, conditions, ranges] of [
    ['a?[0] ? ..b : c', ['a?[0]'], ['..b']],
    ['a?[0] == 1 ? ..b : c', ['a?[0] == 1'], ['..b']],
    ['xs[a?[0] ? ..2 : 1..]', ['a?[0]'], ['..2', '1..']],
    ['a ? b?[0] : c ? ..d : e', ['a', 'c'], ['..d']],
    ['a?[0]?.b ? ..c : d', ['a?[0]?.b'], ['..c']],
    ['x?[0] ? ..n : ..m', ['x?[0]'], ['..n', '..m']],
    ['a?.b ? ..b : c', ['a?.b'], ['..b']],
    ['a?[0] ? 1..b : c', ['a?[0]'], ['1..b']],
    ['a?[0] ? (..b) : c', ['a?[0]'], ['..b']],
  ] as const) {
    const tree = parser.parse(`var r = ${expression};`)!;
    try {
      expect(tree.rootNode.hasError, expression).toBe(false);
      expect(
        tree.rootNode
          .descendantsOfType('conditional_expression')
          .map((node) => node.childForFieldName('condition')?.text),
        expression
      ).toEqual(conditions);
      expect(
        tree.rootNode.descendantsOfType('range_expression').map((node) => node.text),
        expression
      ).toEqual(ranges);
    } finally {
      tree.delete();
    }
  }
});
