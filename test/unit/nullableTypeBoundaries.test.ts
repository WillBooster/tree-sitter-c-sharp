import { Language, Parser } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

let language: Language;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load('tree-sitter-c_sharp.wasm');
});

test('keeps nullable named tuple alternatives outside the preceding type test', () => {
  assertAlternatives([
    'y as (int? a, string b)',
    'y as (int a, string? b)',
    'y as (int? a, string? b)',
    'y as List<(int? a, string b)>',
    'y as ((int? a, string b) nested, int? count)',
    'y as (int? @item, string? item\u0301)',
    'y as (int?[] items, string? name)',
  ]);
});

test('completes nullable as-types before binary operators and type tests', () => {
  assertAlternatives([
    ...['==', '!=', '<', '<=', '>', '>=', '&&', '||', '|', '^', '%', '<<', '>>'].map(
      (operator) => `a as T? ${operator} b`
    ),
    'a as T? is U',
    'a as T? as U',
    'a as T? is not null',
    '(a as T?) == b',
    'a as T?[] == b',
    'a as T? ?? b',
    'a?[0] as T? != b',
    'a?[0] as T? && b',
    'a?[0] as T? is U',
    'a?[0] as T? as U',
  ]);
});

test('completes generic as-types before relational and shift operators', () => {
  assertAlternatives([
    'a as List<int> < b',
    'a as A.B<int> <= b',
    'a as List<int?> << b',
    'a as delegate*<int, void> < b',
    'a as List<(int a, string b)> <= b',
    'a as A<int>.B<string> < b',
    'a as List<int>[] < b',
    'a as List<int>? < b',
    ...['==', '>', '>=', '&&', '??'].map((operator) => `a as List<int> ${operator} b`),
  ]);
});

test('retains expression-starting unary operators after a ternary question', () => {
  assertAlternatives(['+', '-', '*', '&', '!', '~', '++', '--'].map((operator) => `a as T ? ${operator}b : c`));
});

test('retains unary operands and identifier-led alternatives after a ternary question', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const operand of ['!b?[0]', 'item', 'item?[0]', 'new C()', 'await F()', 'x => x']) {
      const source = `var result = x is T?[] ? [1] : a as T ? ${operand} : c;`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const conditionals = tree.rootNode.descendantsOfType('conditional_expression');
        expect(
          conditionals.map((node) => node.childForFieldName('condition')?.text),
          source
        ).toEqual(['x is T?[]', 'a as T']);
        expect(conditionals[1]?.childForFieldName('consequence')?.text, source).toBe(operand);
        if (operand.endsWith('?[0]')) {
          expect(
            tree.rootNode.descendantsOfType('conditional_access_expression').map((node) => node.text),
            source
          ).toEqual([operand.replace(/^[!&]/, '')]);
        }
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

function assertAlternatives(alternatives: string[]): void {
  const parser = new Parser().setLanguage(language);
  try {
    for (const alternative of alternatives) {
      const source = `var result = x is T?[] ? [1] : ${alternative};`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const conditional = tree.rootNode.descendantsOfType('conditional_expression')[0];
        expect(conditional?.childForFieldName('condition')?.text, source).toBe('x is T?[]');
        expect(conditional?.childForFieldName('consequence')?.text, source).toBe('[1]');
        expect(conditional?.childForFieldName('alternative')?.text, source).toBe(alternative);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
}
