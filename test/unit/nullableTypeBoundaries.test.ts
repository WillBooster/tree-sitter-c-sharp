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
    ...['==', '!=', '<', '<=', '>', '>=', '&&', '||', '|', '%', '<<', '>>'].map((operator) => `a as T? ${operator} b`),
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

test('preserves nullable ownership before function-pointer calling conventions', () => {
  assertAlternatives([
    'a as delegate*<int, void>',
    'a as delegate* managed<int, void>',
    'a as delegate* unmanaged<int, void>',
    'a as delegate* unmanaged[Cdecl]<int, void>',
    'a as delegate* unmanaged[Stdcall, SuppressGCTransition]<int, void>',
    'a as delegate* /* convention */ unmanaged [Cdecl] <int, void>',
  ]);
});

test('preserves nested nullable tests after collection-valued pattern-test branches', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const pattern of [
      'T',
      'a?.b',
      'a?.b + c',
      'a?.b?[0]',
      '1 + 2',
      'default(T)',
      'T[]',
      'T[,]',
      'T[][]',
      'A.B',
      'A<B>',
      'global::A',
      'not T',
      'T and U',
      'T or U',
      'T?[]',
      'delegate*<int, void>',
      'delegate* managed<int, void>',
      'delegate* unmanaged<int, void>',
      'delegate* unmanaged[Cdecl]<int, void>',
      'delegate* unmanaged[Stdcall, SuppressGCTransition]<int, void>',
      'delegate* /* convention */ unmanaged [Cdecl] <int, void>',
    ]) {
      for (const consequence of ['[1]', '[1, 2]', '[]']) {
        const source = `var result = x is ${pattern} ? ${consequence} : a is U?[] ? [a] : b;`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          expect(
            tree.rootNode
              .descendantsOfType('conditional_expression')
              .map((node) => [node.childForFieldName('condition')?.text, node.childForFieldName('consequence')?.text]),
            source
          ).toEqual([
            [`x is ${pattern}`, consequence],
            ['a is U?[]', '[a]'],
          ]);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('retains expression-starting unary operators after a ternary question', () => {
  assertAlternatives(['+', '-', '*', '&', '!', '~', '^', '++', '--'].map((operator) => `a as T ? ${operator}b : c`));
});

test('retains unary operands and identifier-led alternatives after a ternary question', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const operand of ['!b?[0]', '^b', 'item', 'item?[0]', 'new C()', 'await F()', 'x => x']) {
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
