import { Language, Parser } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

let language: Language;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load('tree-sitter-c_sharp.wasm');
});

test('keeps coalescing after completed patterns independent of later element accesses', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const pattern of ['{}', '{ X: T }', '[1, 2]', '[..]', '(T)', '((T))', '(int, string)']) {
      for (const [tail, accesses] of [
        ['?? b?[0]', ['b?[0]']],
        ['?? f(b?[0])', ['b?[0]']],
        ['?? b?[0] ?? c?[0]', ['b?[0]', 'c?[0]']],
        ['? b?[0] : c?[0]', ['b?[0]', 'c?[0]']],
        ['? [1] : [2]', []],
      ] as const) {
        const source = `var r = a is ${pattern} ${tail};`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          expect(tree.rootNode.descendantsOfType('is_pattern_expression')[0]?.text, source).toBe(`a is ${pattern}`);
          expect(
            tree.rootNode.descendantsOfType('conditional_access_expression').map((node) => node.text),
            source
          ).toEqual(accesses);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('parses completed-pattern question proofs before conditional and coalescing operators', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const pattern of ['(T)', '[1, 2]', '{ X: T }']) {
      for (const expression of [`a is ${pattern} ? b?[0] : c?[0]`, `a is ${pattern} ?? b?[0]`]) {
        const source = `var 名 = ${expression};`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
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

test('preserves qualified nullable subpatterns after identifier constants', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const type of ['A.B?', 'A.B<int>?', 'N.A.B?', 'A.B?[]', 'A.B?[,][]']) {
      for (const designation of ['', ' value', ' @value']) {
        const pattern = `(Foo, ${type}${designation})`;
        for (const source of [
          `var result = o is ${pattern};`,
          `var result = o switch { ${pattern} => 1, _ => 2 };`,
          `switch (o) { case ${pattern}: break; }`,
        ]) {
          const tree = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, source).toBe(false);
            const recursive = tree.rootNode.descendantsOfType('recursive_pattern')[0]!;
            expect(recursive.text).toBe(pattern);
            const subpatterns = recursive.descendantsOfType('subpattern');
            expect(subpatterns).toHaveLength(2);
            expect(subpatterns[0]!.firstNamedChild!.type).toBe('constant_pattern');
            expect(subpatterns[0]!.text).toBe('Foo');
            const second = subpatterns[1]!.firstNamedChild!;
            expect(second.type).toBe(designation ? 'declaration_pattern' : 'type_pattern');
            expect(second.childForFieldName('type')!.text).toBe(type);
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

test('retains nullable array types with sized ranks in switch patterns', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const type of ['T?[0]', 'T?[a]', 'List<int>?[0]', 'T?[]']) {
      for (const designation of ['', ' item']) {
        const pattern = `${type}${designation}`;
        const tree = parser.parse(`var result = x switch { ${pattern} => 1, _ => 2 };`)!;
        try {
          expect(tree.rootNode.hasError).toBe(false);
          const arm = tree.rootNode.descendantsOfType('switch_expression_arm')[0]!;
          const actual = arm.firstNamedChild!;
          expect(actual.type).toBe(designation ? 'declaration_pattern' : 'type_pattern');
          expect(actual.text).toBe(pattern);
          expect(actual.childForFieldName('type')!.type).toBe('array_type');
          expect(actual.childForFieldName('type')!.text).toBe(type);
          expect(actual.descendantsOfType('nullable_type')[0]!.text).toBe(type.slice(0, type.indexOf('[')));
          expect(actual.descendantsOfType('conditional_access_expression')).toHaveLength(0);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('distinguishes nullable array positional patterns from member-call constants', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const type of ['T?[0]', 'A.B?[a]', 'List<int>?[0, 1]']) {
      const tree = parser.parse(`var result = x switch { ${type}() => 1, ${type}.M() => 2, _ => 3 };`)!;
      try {
        expect(tree.rootNode.hasError).toBe(false);
        const arms = tree.rootNode.descendantsOfType('switch_expression_arm');
        const recursive = arms[0]!.firstNamedChild!;
        expect(recursive.type).toBe('recursive_pattern');
        expect(recursive.childForFieldName('type')!.type).toBe('array_type');
        expect(recursive.childForFieldName('type')!.text).toBe(type);
        expect(recursive.descendantsOfType('positional_pattern_clause')[0]!.text).toBe('()');
        const constant = arms[1]!.firstNamedChild!;
        expect(constant.type).toBe('constant_pattern');
        expect(constant.firstNamedChild!.type).toBe('conditional_access_expression');
        expect(constant.text).toBe(`${type}.M()`);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
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

test('preserves nullable ownership before deeply nested generic, tuple, and function-pointer alternatives', () => {
  const shapes = [
    { open: 'L<', close: '>' },
    { open: '(', close: ', int)' },
    { open: 'delegate*<', close: ', void>' },
    { open: 'delegate* unmanaged[Cdecl]<', close: ', void>' },
    { open: 'L<(', close: '? value, int other)>' },
  ];
  assertAlternatives(shapes.map(({ open, close }) => `a as ${open.repeat(100)}int${close.repeat(100)} == b`));
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

test('isolates nullable switch-arm question state from later statements and methods', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const pattern of ['T?[]', 'T?[] item', 'U?[]', 'T[]', 'T[,]', 'T', '_']) {
      for (const value of ['1', 'a?.b', 'c ? 1 : 2']) {
        const source = `class C {
          object M1(object v) { return v switch { ${pattern} => ${value}, _ => 2 }; }
          void M2(object a, object b, object x) {
            var mid = 1;
            var result = x is T ? [1] : a is U?[] ? [a] : b;
          }
        }`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const result = tree.rootNode
            .descendantsOfType('variable_declarator')
            .find((node) => node.childForFieldName('name')?.text === 'result');
          expect(
            result
              ?.descendantsOfType('conditional_expression')
              .map((node) => [node.childForFieldName('condition')?.text, node.childForFieldName('consequence')?.text]),
            source
          ).toEqual([
            ['x is T', '[1]'],
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

test('preserves enclosing ternaries while switch and with operands replay their delimiters', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const value of ['a', 'a?.b', 'c ? 1 : 2']) {
      for (const operand of [`v switch { T?[] => ${value}, _ => 2 }`, `v with { P = ${value} }`]) {
        const source = `var result = flag ? ${operand} : x is U?[] ? [a] : b;`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const conditionals = tree.rootNode.descendantsOfType('conditional_expression');
          expect(conditionals[0]?.childForFieldName('condition')?.text, source).toBe('flag');
          expect(conditionals[0]?.childForFieldName('consequence')?.text, source).toBe(operand);
          const alternative = conditionals[0]?.childForFieldName('alternative');
          expect(alternative?.type, source).toBe('conditional_expression');
          expect(alternative?.childForFieldName('condition')?.text, source).toBe('x is U?[]');
          expect(alternative?.childForFieldName('consequence')?.text, source).toBe('[a]');
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps nullable tuple elements inside positional patterns before ternary branches', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const pattern of ['(T, U?)', '(int x, int? y)', '(T?, U?)', '(A.B, U?[])']) {
      const tree = parser.parse(`var result = a is ${pattern} ? b?[0] : c;`)!;
      try {
        expect(tree.rootNode.hasError).toBe(false);
        const conditional = tree.rootNode.descendantsOfType('conditional_expression')[0]!;
        expect(conditional.childForFieldName('condition')!.text).toBe(`a is ${pattern}`);
        expect(conditional.childForFieldName('consequence')!.text).toBe('b?[0]');
        expect(tree.rootNode.descendantsOfType('recursive_pattern')[0]!.text).toBe(pattern);
        expect(tree.rootNode.descendantsOfType('conditional_access_expression')[0]!.text).toBe('b?[0]');
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves nested expression conditions after generic type tests', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const condition of ['x is U', 'x as U', 'x is null', 'x < y', 'x == y', 'x != y', 'x is U value']) {
      const tree = parser.parse(`var result = a is List<T> ? ${condition} ? b : c?[0] : e;`)!;
      try {
        expect(tree.rootNode.hasError).toBe(false);
        const [outer, inner] = tree.rootNode.descendantsOfType('conditional_expression');
        expect(outer!.childForFieldName('condition')!.text).toBe('a is List<T>');
        expect(inner!.childForFieldName('condition')!.text).toBe(condition);
        expect(inner!.childForFieldName('alternative')!.text).toBe('c?[0]');
        expect(outer!.childForFieldName('alternative')!.text).toBe('e');
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('finishes nullable type tests before conditional logical operators', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const operator of ['&&', '||']) {
      const tree = parser.parse(`var result = a is T? ${operator} b ? c ? [1] : 1 : [1];`)!;
      try {
        expect(tree.rootNode.hasError).toBe(false);
        const [outer, inner] = tree.rootNode.descendantsOfType('conditional_expression');
        expect(outer!.childForFieldName('condition')!.text).toBe(`a is T? ${operator} b`);
        expect(inner!.childForFieldName('condition')!.text).toBe('c');
        expect(tree.rootNode.descendantsOfType('nullable_type')[0]!.text).toBe('T?');
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('retains nullable operands before relational and unary is-patterns', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const receiver of ['o as int?', 'x is int?', 'o as List<int>?', 'o as int?[]']) {
      for (const pattern of ['> 0', '< 0 or > 5', '-1', '>= 1', '^1', '-x']) {
        const expression = `${receiver} is ${pattern}`;
        const tree = parser.parse(`var result = ${expression};`)!;
        try {
          expect(tree.rootNode.hasError, expression).toBe(false);
          const outer = tree.rootNode.descendantsOfType('is_pattern_expression')[0]!;
          expect(outer.text).toBe(expression);
          expect(outer.childForFieldName('expression')!.text).toBe(receiver);
          expect(outer.childForFieldName('pattern')!.text).toBe(pattern);
          expect(tree.rootNode.descendantsOfType('conditional_expression')).toHaveLength(0);
          expect(tree.rootNode.descendantsOfType('nullable_type')).toHaveLength(1);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('retains qualified nullable logical subpatterns after parenthesized receivers', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const receiver of ['a', '(a)', '(a.b)', '((a))']) {
      for (const pattern of [
        '(Foo, A.B?)',
        '(Foo, C.D? or Foo)',
        '(Foo, C.D? and X)',
        '(Foo, C.D?[] or null)',
        '(Foo, C.D? or @is)',
      ]) {
        const tree = parser.parse(`var result = ${receiver} is ${pattern} ? x : y;`)!;
        try {
          expect(tree.rootNode.hasError, `${receiver} is ${pattern}`).toBe(false);
          const condition = tree.rootNode
            .descendantsOfType('conditional_expression')[0]!
            .childForFieldName('condition')!;
          expect(condition.childForFieldName('expression')!.text).toBe(receiver);
          const recursive = condition.childForFieldName('pattern')!;
          expect(recursive.type).toBe('recursive_pattern');
          expect(recursive.text).toBe(pattern);
          const second = recursive.descendantsOfType('subpattern')[1]!.firstNamedChild!;
          expect(second.type).toBe(
            pattern.includes(' or ') ? 'or_pattern' : pattern.includes(' and ') ? 'and_pattern' : 'type_pattern'
          );
          expect(second.descendantsOfType('nullable_type')[0]!.text).toBe(pattern.includes('A.B') ? 'A.B?' : 'C.D?');
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps contextual pattern-operator names available to ternary operands', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const consequence of [
      'or -1',
      'or(a)',
      'or is U',
      'or switch { _ => 1 }',
      'or with { X = 1 }',
      'and +1',
      '@or -1',
    ]) {
      const tree = parser.parse(`var result = o is T? ${consequence} : b;`)!;
      try {
        expect(tree.rootNode.hasError, consequence).toBe(false);
        const conditional = tree.rootNode.descendantsOfType('conditional_expression')[0]!;
        expect(conditional.childForFieldName('condition')!.text).toBe('o is T');
        expect(conditional.childForFieldName('consequence')!.text).toBe(consequence);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps nested nullable type questions separate from the following ternary question', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const type of ['List<T?>', 'List<T?[]>', 'List<List<T?>>', 'Dictionary<T?,U?>', 'G<(T?,U?)>']) {
      for (const collection of ['[0]', '[a]']) {
        const expression = `x is ${type}?${collection} ? [1] : [2]`;
        for (const wrapped of [expression, `c ? ${expression} : d`]) {
          const tree = parser.parse(`var result = ${wrapped};`)!;
          try {
            expect(tree.rootNode.hasError, wrapped).toBe(false);
            const ternary = tree.rootNode.descendantsOfType('conditional_expression').at(-1);
            expect(ternary?.childForFieldName('condition')?.text, wrapped).toBe(`x is ${type}`);
            expect(ternary?.childForFieldName('consequence')?.type, wrapped).toBe('conditional_access_expression');
            expect(ternary?.childForFieldName('consequence')?.text, wrapped).toBe(`${collection} ? [1]`);
            expect(ternary?.childForFieldName('alternative')?.text, wrapped).toBe('[2]');
            const access = ternary?.childForFieldName('consequence');
            expect(access?.childForFieldName('condition')?.text, wrapped).toBe(collection);
            expect(access?.childForFieldName('consequence')?.text, wrapped).toBe('[1]');
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
