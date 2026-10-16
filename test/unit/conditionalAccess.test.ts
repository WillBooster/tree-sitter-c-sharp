import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

let language: Language;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load('tree-sitter-c_sharp.wasm');
});

test('binds conditional member and element access before surrounding operators', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  const receivers = new Query(language, '(conditional_access_expression condition: _ @receiver)');
  try {
    for (const access of ['x?.Member', 'x?[0]']) {
      for (const expression of [
        `y || ${access}`,
        `y && ${access}`,
        `y + ${access}`,
        `y * ${access}`,
        `y ?? ${access}`,
        `y..${access}`,
        `!${access}`,
        `-${access}`,
        `await ${access}`,
        `(T)${access}`,
        `y ? ${access} : z`,
        `y ? z : ${access}`,
      ]) {
        const tree = parser.parse(`var result = ${expression};`)!;
        try {
          expect(tree.rootNode.hasError, expression).toBe(false);
          const nodes = tree.rootNode.descendantsOfType('conditional_access_expression');
          expect(
            nodes.map((node) => node.text),
            expression
          ).toEqual([access]);
          expect(nodes[0]?.childForFieldName('condition')?.text, expression).toBe('x');
          expect(
            receivers.captures(tree.rootNode).map(({ node }) => node.text),
            expression
          ).toEqual(['x']);
        } finally {
          tree.delete();
        }
      }
    }
    for (const receiver of [
      '(x || y)',
      '(x)',
      '(x.Member)',
      '(this)',
      '((x))',
      '(x[0])',
      '__makeref(tr)',
      '__refvalue(tr, string)',
      '__refvalue(tr, string[])',
      '__reftype(tr)',
      'Get()',
      'x.Member',
      'x[0]',
      'new C()',
      'x!',
      'this',
      'base',
      'delegate { return 1; }',
      'stackalloc[] {1}',
    ]) {
      for (const suffix of ['?.Member', '?[0]']) {
        const tree = parser.parse(`var result = ${receiver}${suffix};`)!;
        try {
          expect(tree.rootNode.hasError, receiver).toBe(false);
          const node = tree.rootNode.descendantsOfType('conditional_access_expression')[0];
          expect(node?.childForFieldName('condition')?.text, receiver).toBe(receiver);
          expect(
            receivers.captures(tree.rootNode).map(({ node }) => node.text),
            receiver
          ).toEqual([receiver]);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    receivers.delete();
    parser.delete();
  }
});

test('keeps ternary collection expressions distinct from conditional element binding', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const source of [
      'var result = c ? [1] : [2];',
      'class C { int[] M() { return x is T ? [1] : []; } }',
      'f(a ? [1] : [2]);',
      'var result = a ? b ? [c] : d : e;',
    ]) {
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(tree.rootNode.descendantsOfType('element_binding_expression'), source).toHaveLength(0);
        const conditionals = tree.rootNode.descendantsOfType('conditional_expression');
        expect(conditionals.at(-1)?.childForFieldName('consequence')?.type, source).toBe('collection_expression');
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves preprocessor-selected conditional receivers', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const suffix of ['?.Member', '?[0]']) {
      const tree = parser.parse(`class C { object M() =>
#if A
 a
#else
 b
#endif
 ${suffix}; }`)!;
      try {
        expect(tree.rootNode.hasError).toBe(false);
        const receiver = tree.rootNode
          .descendantsOfType('conditional_access_expression')[0]
          ?.childForFieldName('condition');
        expect(receiver?.type).toBe('preproc_if');
        expect(receiver?.descendantsOfType('identifier').map((node) => node.text)).toEqual(['A', 'a', 'b']);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps conditional indexing and type tests inside ternary conditions', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const access of ['items?[0]', 'items?.Value']) {
      for (const check of [
        'is Foo',
        'is Foo<int>',
        'is Foo[]',
        'is Foo?[]',
        'is A.B(P: 1)',
        'is { P: 1 }',
        'is string',
        'is not null',
        'is Foo value',
        '!= null',
      ]) {
        for (const separator of [' ? ', '?']) {
          const condition = `${access} ${check}`;
          const source = `var result = ${condition}${separator}[1] : [2];`;
          const tree = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, source).toBe(false);
            const ternary = tree.rootNode.descendantsOfType('conditional_expression')[0];
            expect(ternary?.childForFieldName('condition')?.text, source).toBe(condition);
            expect(ternary?.childForFieldName('consequence')?.type, source).toBe('collection_expression');
            expect(ternary?.childForFieldName('alternative')?.type, source).toBe('collection_expression');
            expect(
              tree.rootNode.descendantsOfType('conditional_access_expression').map((node) => node.text),
              source
            ).toEqual([access]);
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

test('preserves nullable type conditions before collection expression continuations', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const [condition, consequence, kind, nullable] of [
      ['x is T', '[][0]', 'element_access_expression', undefined],
      ['value is N.T<C>?[]', '[1]', 'collection_expression', 'N.T<C>?'],
      ['value is N.T?[]', '[1] as T', 'as_expression', 'N.T?'],
      ['o is string[]', 'items?[0]', 'conditional_access_expression', undefined],
      ['o is int[]', 'items?[0]', 'conditional_access_expression', undefined],
      ['o is A.B[]', 'items?[0]', 'conditional_access_expression', undefined],
      ['o is T[,]', 'items?[0]', 'conditional_access_expression', undefined],
      ['o is T?[]', 'items?[0]', 'conditional_access_expression', 'T?'],
      ['o is List<int>', 'items?[0]', 'conditional_access_expression', undefined],
      ...[
        'index',
        'true',
        'false',
        '"text"',
        "'c'",
        'left,right',
        '1 + index',
        'Call()',
        'index.P',
        'index ? 1 : 2',
      ].map((value) => ['x is T?[]', `[${value}]`, 'collection_expression', 'T?'] as const),
      ...['1', 'index', '1 + index', 'Call()'].map(
        (value) => ['x is T?[]', `[0] switch { _ => ${value} }`, 'switch_expression', 'T?'] as const
      ),
      ...['T?[]', 'T?[,]', 'T?[][]', 'N.T?[]', 'N.T<C>?[]'].flatMap((type) =>
        [
          ['[0] + x', 'binary_expression'],
          ['[0] + F<T,U>()', 'binary_expression'],
          ['[0] + F<N.T<U>,V>()', 'binary_expression'],
          ['[0] + (x?[1])', 'binary_expression'],
          ['[0] + x ? [1] : other', 'conditional_expression'],
          ['[0] + $"{x}"', 'binary_expression'],
          ['[0] + $"{x?[1]}"', 'binary_expression'],
          ['[0] + new C { P = x?[1] }', 'binary_expression'],
          ['[0] + [x?[1], y]', 'binary_expression'],

          ['[0] + x + y', 'binary_expression'],
          ['[0] + x.P', 'binary_expression'],
          ['[0] + x?.P', 'binary_expression'],
          ['[0] + Call()', 'binary_expression'],
          ['[0] + (x)', 'binary_expression'],
          ['[0] + x ?? y', 'binary_expression'],
          ['[0] + x * y', 'binary_expression'],
          ['[0] + x[0]', 'binary_expression'],
          ['[0] + x!', 'binary_expression'],
          ['[0] + x is T', 'is_pattern_expression'],
          ['[0] switch { _ => x } + y', 'binary_expression'],
          ['[index] + x', 'binary_expression'],
          ['[1, 2] + x', 'binary_expression'],
          ['[] + x', 'binary_expression'],
        ].map(([value, kind]) => [`value is ${type}`, value!, kind!, type.split('?')[0] + '?'] as const)
      ),
      ...['{ _ => 1, }', '{ 0 => Call(), _ => x, }', '{ _ => flag ? 1 : 2, }'].map(
        (body) => ['x is T?[]', `[0] switch ${body}`, 'switch_expression', 'T?'] as const
      ),
      ...(
        [
          ['List<int>', []],
          ['int[]', []],
          ['int?', ['int?']],
          ['G<int>[]', []],
          ['G<int?>', ['int?']],
          ['A.B<C.D>', []],
          ['global::N.T', []],
          ['T[,]', []],
          ['(int,int)', []],
          ['delegate*<int,void>', []],
          ['int*', []],
          ['G<int,string>', []],
          ['G<G<int>>', []],
          ['N.G<T?>[]', ['T?']],
          ['T?[]', ['T?']],
          ['T[][]', []],
          ['int?[,]', ['int?']],
        ] as const
      ).map(
        ([type, nestedNullable]) => ['x is T?[]', `[0] as ${type}`, 'as_expression', ['T?', ...nestedNullable]] as const
      ),
      ...[
        '+',
        '-',
        '*',
        '/',
        '%',
        '<<',
        '>>',
        '>>>',
        '<',
        '<=',
        '>',
        '>=',
        '==',
        '!=',
        '&',
        '^',
        '|',
        '&&',
        '||',
        '??',
      ].map((operator) => ['x is T?[]', `[0] ${operator} x`, 'binary_expression', 'T?'] as const),
    ] as const) {
      const source = `var result = ${condition} ? ${consequence} : fallback;`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const ternary = tree.rootNode.descendantsOfType('conditional_expression')[0];
        expect(ternary?.childForFieldName('condition')?.text, source).toBe(condition);
        expect(ternary?.childForFieldName('consequence')?.text, source).toBe(consequence);
        expect(ternary?.childForFieldName('consequence')?.type, source).toBe(kind);
        expect(
          tree.rootNode.descendantsOfType('nullable_type').map((node) => node.text),
          source
        ).toEqual(typeof nullable === 'string' ? [nullable] : (nullable ?? []));
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('distinguishes nullable as-types from parenthesized ternary conditions', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const source of ['var result = items?[0] as Foo ? [1] : [2];', 'var result = items?[0] as Foo?[1] : [2];']) {
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const ternary = tree.rootNode.descendantsOfType('conditional_expression')[0];
        expect(ternary?.childForFieldName('condition')?.text, source).toBe('items');
        expect(ternary?.childForFieldName('consequence')?.type, source).toBe('as_expression');
        expect(
          tree.rootNode.descendantsOfType('nullable_type').map((node) => node.text.replaceAll(' ', '')),
          source
        ).toEqual(['Foo?']);
      } finally {
        tree.delete();
      }
    }
    for (const access of ['items?[0]', 'items?.Value']) {
      const condition = `(${access} as Foo)`;
      const source = `var result = ${condition} ? [1] : [2];`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(
          tree.rootNode.descendantsOfType('conditional_expression')[0]?.childForFieldName('condition')?.text,
          source
        ).toBe(condition);
        expect(
          tree.rootNode.descendantsOfType('conditional_access_expression').map((node) => node.text),
          source
        ).toEqual([access]);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('queries index initializer targets separately from ternary collection values', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  const query = new Query(
    language,
    '(initializer_expression (assignment_expression left: (_) @target right: (conditional_expression) @value))'
  );
  const tree = parser.parse('var result = new C { [key] = choose ? [1] : [2] };')!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(query.captures(tree.rootNode).map(({ name, node }) => [name, node.text])).toEqual([
      ['target', '[key]'],
      ['value', 'choose ? [1] : [2]'],
    ]);
    expect(tree.rootNode.descendantsOfType('collection_expression').map((node) => node.text)).toEqual(['[1]', '[2]']);
  } finally {
    tree.delete();
    query.delete();
    parser.delete();
  }
});

test('keeps conditional receivers inside pointer unary operands', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const prefix of ['*', '&']) {
      for (const receiver of ['x', 'x!', 'Get()', 'x.y', 'x[0]', '(x)', 'this']) {
        for (const suffix of ['?.Member', '?[0]']) {
          const source = `var result = ${prefix}${receiver}${suffix};`;
          const tree = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, source).toBe(false);
            const access = tree.rootNode.descendantsOfType('conditional_access_expression')[0];
            expect(access?.childForFieldName('condition')?.text, source).toBe(receiver);
            expect(access?.parent?.type, source).toBe('prefix_unary_expression');
          } finally {
            tree.delete();
          }
        }
      }
    }
    for (const operand of ['*x!', '&Get()']) {
      const tree = parser.parse(`var result = ${operand} ? y : z;`)!;
      try {
        expect(tree.rootNode.hasError).toBe(false);
        expect(tree.rootNode.descendantsOfType('conditional_expression')[0]?.childForFieldName('condition')?.text).toBe(
          operand
        );
      } finally {
        tree.delete();
      }
    }
    for (const receiver of ['x!', 'Get()']) {
      const tree = parser.parse(`var result = *(T*)${receiver}?.Member;`)!;
      try {
        expect(tree.rootNode.hasError).toBe(false);
        const access = tree.rootNode.descendantsOfType('conditional_access_expression')[0];
        expect(access?.childForFieldName('condition')?.text).toBe(receiver);
        expect(access?.parent?.type).toBe('cast_expression');
        expect(access?.parent?.parent?.type).toBe('prefix_unary_expression');
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves parenthesized receiver categories across unary operators and pointer casts', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  const expressions = [
    'x',
    'x!',
    'Get()',
    'x.Member',
    'x[0]',
    'this',
    'base',
    'true',
    '1',
    '"s"',
    '$"s"',
    '(x,y)',
    'checked(x)',
    'unchecked(x)',
    'default(T)',
    'default',
    'typeof(T)',
    'sizeof(T)',
    '__makeref(x)',
    '__reftype(x)',
    '__refvalue(x,T)',
    'new C()',
    'new C[1]',
    'new { X=1 }',
    'new[] {1}',
    'new()',
    '[1]',
    'delegate { return 1; }',
    'stackalloc int[1]',
    'stackalloc[] {1}',
    'x+y',
    'x?y:z',
    'x??y',
    'x is T',
    'x as T',
    '(T)x',
    '(T*)x',
    'x=y',
    'await x',
    '!x',
    '-x',
    '&x',
    '*x',
    'x switch { _ => y }',
    'x with { A=1 }',
    '()=>x',
    '()=>{}',
    'from x in xs select x',
    'throw x',
  ];
  try {
    for (const expression of expressions) {
      for (const receiver of [`(${expression})`, `((${expression}))`]) {
        for (const prefix of ['', '*', '&', '-', '+', '!', '~', '^', 'await ', '++', '--', '*(T*)']) {
          for (const suffix of ['?.Member', '?[0]']) {
            const source = `var result = ${prefix}${receiver}${suffix};`;
            const tree = parser.parse(source)!;
            try {
              expect(tree.rootNode.hasError, source).toBe(false);
              const access = tree.rootNode.descendantsOfType('conditional_access_expression')[0];
              expect(access?.childForFieldName('condition')?.text, source).toBe(receiver);
            } finally {
              tree.delete();
            }
          }
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves conditional access inside constant patterns without fabricated postfix operators', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const receiver of ['null', '5', '"text"', 'true', 'default(T)', 'typeof(T)', 'sizeof(T)']) {
      for (const suffix of ['?.Member', '?[0]']) {
        for (const pattern of [`${receiver}${suffix}`, `not ${receiver}${suffix}`, `(${receiver}${suffix})`]) {
          for (const source of [
            `var result = x is ${pattern};`,
            `switch (x) { case (${pattern}): break; }`,
            `var result = x switch { ${pattern} => 1, _ => 0 };`,
          ]) {
            const tree = parser.parse(source)!;
            try {
              expect(tree.rootNode.hasError, source).toBe(false);
              const access = tree.rootNode.descendantsOfType('conditional_access_expression')[0];
              expect(access?.childForFieldName('condition')?.text, source).toBe(receiver);
              expect(
                tree.rootNode
                  .descendantsOfType('constant_pattern')
                  .some((node) => node.startIndex <= access!.startIndex && node.endIndex >= access!.endIndex),
                source
              ).toBe(true);
              expect(tree.rootNode.descendantsOfType('postfix_unary_expression'), source).toHaveLength(0);
            } finally {
              tree.delete();
            }
          }
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('distinguishes typed creation qualifiers from completed conditional receivers', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const [expression, accesses, nullableTypes] of [
      ['new C[1]?[0]', [], ['C[1]?']],
      ['new C[1]?.Member', ['new C[1]?.Member'], []],
      ['new C[1] {}?[0]', ['new C[1] {}?[0]'], []],
      ['new C()?[0]', ['new C()?[0]'], []],
      ['new C {}?.Member', ['new C {}?.Member'], []],
      ['stackalloc int[1]?.Member', [], ['int[1]?']],
      ['stackalloc int[1]?[0]', [], ['int[1]?']],
      ['stackalloc int[1] {1}?[0]', ['stackalloc int[1] {1}?[0]'], []],
      ['stackalloc[] {1}?.Member', ['stackalloc[] {1}?.Member'], []],
      ['(new C[1])?[0]', ['(new C[1])?[0]'], []],
      ['(stackalloc int[1])?.Member', ['(stackalloc int[1])?.Member'], []],
    ] as const) {
      const source = `var result = ${expression};`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(
          tree.rootNode.descendantsOfType('conditional_access_expression').map((node) => node.text),
          source
        ).toEqual(accesses);
        expect(
          tree.rootNode.descendantsOfType('nullable_type').map((node) => node.text),
          source
        ).toEqual(nullableTypes);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('supports named, modified, and range arguments in index initializers', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const key of ['key: 1', '1, 2', 'ref value', 'out value', 'in value', '..1', '1..2', 'flag ? a : b']) {
      const source = `var result = new C { [${key}] = value };`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const assignment = tree.rootNode.descendantsOfType('assignment_expression')[0];
        expect(assignment?.childForFieldName('left')?.text, source).toBe(`[${key}]`);
        expect(assignment?.childForFieldName('right')?.text, source).toBe('value');
        if (key.includes('..')) {
          expect(
            tree.rootNode.descendantsOfType('range_expression').map((node) => node.text),
            source
          ).toEqual([key]);
        }
      } finally {
        tree.delete();
      }
    }
    const nested = parser.parse('var result = new C { Child = { [key: 1] = value } };')!;
    try {
      expect(nested.rootNode.hasError).toBe(false);
      expect(
        nested.rootNode.descendantsOfType('assignment_expression').map((node) => node.childForFieldName('left')?.text)
      ).toEqual(['Child', '[key: 1]']);
    } finally {
      nested.delete();
    }
    for (const expression of ['new[] { [1, 2], [3] }', 'new int[][] { [1, 2], [3] }']) {
      const tree = parser.parse(`var result = ${expression};`)!;
      try {
        expect(tree.rootNode.hasError).toBe(false);
        expect(tree.rootNode.descendantsOfType('collection_expression').map((node) => node.text)).toEqual([
          '[1, 2]',
          '[3]',
        ]);
      } finally {
        tree.delete();
      }
    }
    const outside = parser.parse('[key] = value;')!;
    try {
      expect(outside.rootNode.hasError).toBe(false);
      expect(outside.rootNode.descendantsOfType('assignment_expression')[0]?.childForFieldName('left')?.type).toBe(
        'collection_expression'
      );
    } finally {
      outside.delete();
    }
  } finally {
    parser.delete();
  }
});

test('preserves nullable array conditions before complete expression alternatives', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const type of ['T?[]', 'T?[,]', 'T?[][]', 'N.T?[]', 'N.T<C>?[]']) {
      for (const consequence of ['[0]', '[index]']) {
        for (const alternative of [
          'fallback',
          'null',
          '2',
          '2.5',
          '"s"',
          "'c'",
          '-1',
          '!a',
          '~a',
          '(a)',
          '(flag ? [1] : [2])',
          'default',
          'default(T)',
          'new T()',
          'new T { P = a }',
          'new[]{a}',
          'typeof(T)',
          'sizeof(int)',
          'checked(a+1)',
          'await F()',
          'throw new E()',
          'F<T,U>()',
          '$"{a}"',
          '[a, b]',
          'a => a',
          '(a) => a',
          '(int a) => a',
          'static a => a',
          'async a => await F(a)',
          'static async (a) => await F(a)',
          '() => x?[0]',
          '() => { return x?[0]; }',
          '(a, b) => (a, b)',
          'delegate { return x?[0]; }',
          'a => (a?[0]:b)',
          'a => (a?[0])',
          'a => b => a?[0]',
          'a is int ? 1 : 2',
          'a is T ? a?[0] : b',
          '(a is T) ? [1] : [2]',
          'a + b ? 1 : 2',
          'a == b ? [1] : [2]',
          'a is List<T> ? [1] : [2]',
          'a is T?[] ? [1] : [2]',
          'a is null',
          'a is not null',
          'a is true',
          'a is false',
          'a is var y',
          'a is this.B',
          'a is base.B',
          'a is not true',
          'a is > 0 ? [1] : [2]',
          'a is >= 0 and <= 2 ? [1] : [2]',
          'a is null or U ? [1] : [2]',
          'a is > 0 and U ? [1] : [2]',
          'a is U and null ? [1] : [2]',
          'a is 1 + v.and ? [1] : [2]',
          'a is null?.and ? [1] : [2]',
          'a is 0 || and ? [1] : [2]',
          'a is 0 ?? and ? [1] : [2]',
          'a is 1 << 2 and T ? [1] : [2]',
          'a is G<T> and null ? [1] : [2]',
        ]) {
          const condition = `x is ${type}`;
          const source = `var result = ${condition} ? ${consequence} : ${alternative};`;
          const tree = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, source).toBe(false);
            const nodes = tree.rootNode.descendantsOfType('conditional_expression');
            const ternary = nodes[0];
            expect(ternary?.childForFieldName('condition')?.text, source).toBe(condition);
            expect(ternary?.childForFieldName('consequence')?.text, source).toBe(consequence);
            expect(ternary?.childForFieldName('alternative')?.text, source).toBe(alternative);
            expect(
              tree.rootNode.descendantsOfType('nullable_type').map((node) => node.text),
              source
            ).toEqual([type.split('?')[0] + '?', ...(alternative.startsWith('a is T?[]') ? ['T?'] : [])]);
            if (alternative === 'a is T?[] ? [1] : [2]') {
              expect(nodes[1]?.childForFieldName('condition')?.text, source).toBe('a is T?[]');
              expect(nodes[1]?.childForFieldName('consequence')?.text, source).toBe('[1]');
              expect(nodes[1]?.childForFieldName('alternative')?.text, source).toBe('[2]');
            }
            if (alternative === 'a => (a?[0]:b)') {
              expect(nodes[1]?.childForFieldName('condition')?.text, source).toBe('a');
              expect(nodes[1]?.childForFieldName('consequence')?.text, source).toBe('[0]');
              expect(nodes[1]?.childForFieldName('alternative')?.text, source).toBe('b');
            }
            if (['() => x?[0]', '() => { return x?[0]; }', 'delegate { return x?[0]; }'].includes(alternative)) {
              const access = tree.rootNode.descendantsOfType('conditional_access_expression')[0];
              expect(access?.childForFieldName('condition')?.text, source).toBe('x');
              expect(access?.childForFieldName('consequence')?.text, source).toBe('[0]');
            }
            if (alternative === '(flag ? [1] : [2])') {
              expect(nodes[1]?.childForFieldName('condition')?.text, source).toBe('flag');
              expect(nodes[1]?.childForFieldName('consequence')?.text, source).toBe('[1]');
              expect(nodes[1]?.childForFieldName('alternative')?.text, source).toBe('[2]');
            }
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

test('preserves nested nullable type boundaries in conditional alternatives', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const type of ['T?[]', 'T?[,]', 'T?[][]', 'N.T?[]', 'N.T<C>?[]']) {
      for (const [alternative, nullableTypes, innerCondition, innerConsequence, innerAlternative, asType] of [
        ['a as int?', ['int?'], undefined, undefined, undefined, 'int?'],
        ['a as T?[]', ['T?'], undefined, undefined, undefined, 'T?[]'],
        ['a as int? ? [1] : [2]', ['int?'], 'a as int?', '[1]', '[2]', 'int?'],
        ['a as List<T?[]>', ['T?'], undefined, undefined, undefined, 'List<T?[]>'],
        ['a as int? > b ? [1] : [2]', ['int?'], 'a as int? > b', '[1]', '[2]', 'int?'],
        ['a as int? >= b ? [1] : [2]', ['int?'], 'a as int? >= b', '[1]', '[2]', 'int?'],
        ['a as T?[] / b ? [1] : [2]', ['T?'], 'a as T?[] / b', '[1]', '[2]', 'T?[]'],
        ['a as int? / b ? [1] : [2]', ['int?'], 'a as int? / b', '[1]', '[2]', 'int?'],
        ['a is int?[] ? 1 : 2', ['int?'], 'a is int?[]', '1', '2'],
        ['a is T?[] y ? y : z', ['T?'], 'a is T?[] y', 'y', 'z'],
        ['a is global::N.T?[] ? [1] : [2]', ['global::N.T?'], 'a is global::N.T?[]', '[1]', '[2]'],
      ] as const) {
        const condition = `x is ${type}`;
        const source = `var result = ${condition}?[0] : ${alternative};`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const conditionals = tree.rootNode.descendantsOfType('conditional_expression');
          expect(conditionals[0]?.childForFieldName('condition')?.text, source).toBe(condition);
          expect(conditionals[0]?.childForFieldName('consequence')?.text, source).toBe('[0]');
          expect(conditionals[0]?.childForFieldName('alternative')?.text, source).toBe(alternative);
          expect(tree.rootNode.descendantsOfType('conditional_access_expression'), source).toHaveLength(0);
          expect(
            tree.rootNode.descendantsOfType('nullable_type').map((node) => node.text),
            source
          ).toEqual([type.split('?')[0] + '?', ...nullableTypes]);
          if (innerCondition !== undefined) {
            expect(conditionals[1]?.childForFieldName('condition')?.text, source).toBe(innerCondition);
            expect(conditionals[1]?.childForFieldName('consequence')?.text, source).toBe(innerConsequence);
            expect(conditionals[1]?.childForFieldName('alternative')?.text, source).toBe(innerAlternative);
          }
          if (asType !== undefined) {
            const asExpression = tree.rootNode.descendantsOfType('as_expression')[0];
            expect(asExpression?.childForFieldName('left')?.text, source).toBe('a');
            expect(asExpression?.childForFieldName('right')?.text, source).toBe(asType);
          }
        } finally {
          tree.delete();
        }
      }
    }
    const comparisons = 'a as int? > '.repeat(1000) + 'b';
    const source = `var result = x is T?[] ? [0] : ${comparisons} ? [1] : [2];`;
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError).toBe(false);
      const conditionals = tree.rootNode.descendantsOfType('conditional_expression');
      expect(conditionals).toHaveLength(2);
      expect(conditionals[0]?.childForFieldName('condition')?.text).toBe('x is T?[]');
      expect(conditionals[1]?.childForFieldName('condition')?.text).toBe(comparisons);
      expect(conditionals[1]?.childForFieldName('consequence')?.text).toBe('[1]');
      expect(conditionals[1]?.childForFieldName('alternative')?.text).toBe('[2]');
      expect(tree.rootNode.descendantsOfType('as_expression')).toHaveLength(1000);
      expect(tree.rootNode.descendantsOfType('nullable_type')).toHaveLength(1001);
    } finally {
      tree.delete();
    }
  } finally {
    parser.delete();
  }
});

test('keeps nullable array conditions independent of enclosing nullable parameters', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  const contexts = [
    (parameters: string, body: string) => `class C { void M(${parameters}) { ${body} } }`,
    (parameters: string, body: string) => `class C { C(${parameters}) { ${body} } }`,
    (parameters: string, body: string) => `class C { void M() { void Local(${parameters}) { ${body} } } }`,
    (parameters: string, body: string) => `class C { void M() { var f = (${parameters}) => { ${body} }; } }`,
    (parameters: string, body: string) => `class C { object this[${parameters}] { get { ${body} return null; } } }`,
  ];
  const inputs = ['int n', 'int? n', 'List<int?> n', 'T?[] n', 'Func<int?,T> n', 'string? n', '(int?,T) n'].flatMap(
    (parameter) =>
      contexts.flatMap((context) =>
        ['', 'var prior = 1;'].flatMap((prefix) =>
          ['Gen?[]', 'N.T?[]', 'Gen?[,]'].flatMap((type) =>
            ['[0]', '[index]'].map((consequence) => ({
              condition: `o is ${type}`,
              consequence,
              source: context(`object o, bool b, ${parameter}`, `${prefix} var r = o is ${type} ? ${consequence} : b;`),
            }))
          )
        )
      )
  );
  try {
    for (const { source, condition, consequence } of inputs) {
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const ternary = tree.rootNode.descendantsOfType('conditional_expression')[0];
        expect(ternary?.childForFieldName('condition')?.text, source).toBe(condition);
        expect(ternary?.childForFieldName('consequence')?.text, source).toBe(consequence);
        expect(ternary?.childForFieldName('alternative')?.text, source).toBe('b');
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves nullable array conditions around interpolated expression leaves', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  const payloads = [
    '$"{x}"',
    '$"{x?[0]}"',
    '$"{(x?[0]:y)}"',
    '$"pre{(flag ? x?[0] : y)}post"',
    '$@"{x}"',
    '@$"{x}"',
    '$"{F($"{x}")}"',
    '$"{x:00?}"',
    '$"{x,10:000}"',
    '$"{{literal?[0]:x}}"',
    '$"{F("x?[0]:y")}"',
    '$"""{x}"""',
    '$$"""{{x}}"""',
    '$$$"""{{{x}}}"""',
    '$""""{x}""""',
    '$$""""literal {x} {{x}}""""',
    '"""a?[0]:b"""',
    '"""\nabc?[0]:b\n"""',
    '$"""\n{x}\n"""',
    '$"""{F($"{x}")}"""',
    '$"""{F($"""{x}""")}"""',
    '""""raw "x" and """ triple""""',
    '$"""{x?[0]}"""',
    '$"""{(x?[0]:y)}"""',
    '$$"""{{x,10:000}}"""',
    '$$"""literal {x} {{(x?[0]:y)}}"""',
    '$$"""{{{x}}}"""',
    '$$$"""{{literal}} {{{x}}}"""',
  ];
  const placements = [
    (value: string) => value,
    (value: string) => `(${value})`,
    (value: string) => `F(${value})`,
    (value: string) => `F((${value}))`,
    (value: string) => `new C { P = ${value} }`,
    (value: string) => `[${value}]`,
  ];
  const inputs = ['T?[]', 'T?[,]', 'T?[][]', 'N.T?[]', 'N.T<C>?[]'].flatMap((type) =>
    ['+', '??'].flatMap((operator) =>
      payloads.flatMap((payload) =>
        placements.map((place) => ({
          condition: `x is ${type}`,
          consequence: `[0]${operator}${place(payload)}`,
          nullable: type.split('?')[0] + '?',
        }))
      )
    )
  );
  inputs.push(
    ...payloads.map((payload) => ({
      condition: 'x is T?[]',
      consequence: `[${payload}]`,
      nullable: 'T?',
    }))
  );
  try {
    for (const { condition, consequence, nullable } of inputs) {
      const source = `var r = ${condition} ? ${consequence} : fallback;`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const ternary = tree.rootNode.descendantsOfType('conditional_expression')[0];
        expect(ternary?.childForFieldName('condition')?.text, source).toBe(condition);
        expect(ternary?.childForFieldName('consequence')?.text, source).toBe(consequence);
        expect(ternary?.childForFieldName('alternative')?.text, source).toBe('fallback');
        expect(
          tree.rootNode.descendantsOfType('nullable_type').map((node) => node.text),
          source
        ).toEqual([nullable]);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves constant-pattern access when an enclosing conditional reparses its true branch', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const pattern of ['null', 'not null', 'true']) {
      const source = `var r=flag ? x is T?[]?[0] : a is ${pattern}?[1] : [2];`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const nodes = tree.rootNode.descendantsOfType('conditional_expression');
        expect(nodes[0]?.childForFieldName('condition')?.text, source).toBe('flag');
        expect(nodes[0]?.childForFieldName('consequence')?.text, source).toBe(`x is T?[]?[0] : a is ${pattern}?[1]`);
        expect(nodes[0]?.childForFieldName('alternative')?.text, source).toBe('[2]');
        expect(nodes[1]?.childForFieldName('condition')?.text, source).toBe('x is T');
        expect(nodes[1]?.childForFieldName('consequence')?.text, source).toBe('[]?[0]');
        expect(nodes[1]?.childForFieldName('alternative')?.text, source).toBe(`a is ${pattern}?[1]`);
        expect(tree.rootNode.descendantsOfType('nullable_type'), source).toHaveLength(0);
        expect(
          tree.rootNode
            .descendantsOfType('conditional_access_expression')
            .map((node) => [node.childForFieldName('condition')?.text, node.childForFieldName('consequence')?.text]),
          source
        ).toEqual([
          ['[]', '[0]'],
          [pattern === 'not null' ? 'null' : pattern, '[1]'],
        ]);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});
