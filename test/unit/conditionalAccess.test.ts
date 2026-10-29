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

test('preserves constant-pattern access inside the true branch of an enclosing conditional', () => {
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

test('preserves type-test ownership after dependent conditional element accesses', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const receiver of ['a?[0]?[i]', 'a?[0]?[i]?[j]']) {
      for (const pattern of ['T', 'T[]', 'T?[]', 'not null', '{ P: 1 }']) {
        const condition = `${receiver} is ${pattern}`;
        const source = `var result = ${condition} ? [1] : b;`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const ternary = tree.rootNode.descendantsOfType('conditional_expression')[0];
          expect(ternary?.childForFieldName('condition')?.text, source).toBe(condition);
          expect(ternary?.childForFieldName('consequence')?.text, source).toBe('[1]');
          expect(ternary?.childForFieldName('alternative')?.text, source).toBe('b');
        } finally {
          tree.delete();
        }
      }
    }
    for (const [expression, condition] of [
      ['a?[0] : b is T', 'a'],
      ['a?[0] ? b is T : c', 'a?[0]'],
      ['a?[0]?[i] is T ? [1] : b : c', 'a?[0]'],
      ['a?[0]?[i] is T ? [1] : b : c : d', 'a'],
      ['a?[0] : b?[i] is T ? [1] : c', 'a'],
    ]) {
      const tree = parser.parse(`var result = ${expression};`)!;
      try {
        expect(tree.rootNode.hasError, expression).toBe(false);
        expect(
          tree.rootNode.descendantsOfType('conditional_expression')[0]?.childForFieldName('condition')?.text,
          expression
        ).toBe(condition);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves nullable conditions before await and creation alternatives', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const alternative of [
      'await F()?[0]',
      'await F().P?[0]',
      'await (a + b)?[0]',
      'await F()?[0] : b',
      'await F()?[0] ? [1] : b',
      'new int?[0]',
      'new T?[0]',
      'new int?[c ? 1 : 2]',
      'new List<int?>()?[0]',
      'new int?()',
      'new int[0]?[i]',
      'new (int,int)?[0]',
      'stackalloc int?[0]',
    ]) {
      const source = `var result = x is T?[] ? [1] : ${alternative};`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const nodes = tree.rootNode.descendantsOfType('conditional_expression');
        expect(nodes[0]?.childForFieldName('condition')?.text, source).toBe('x is T?[]');
        expect(nodes[0]?.childForFieldName('consequence')?.text, source).toBe('[1]');
        expect(nodes[0]?.childForFieldName('alternative')?.text, source).toBe(alternative);
        if (alternative === 'await F()?[0] : b') {
          expect(nodes[1]?.childForFieldName('condition')?.text).toBe('await F()');
          expect(tree.rootNode.descendantsOfType('conditional_access_expression')).toHaveLength(0);
        } else if (alternative.startsWith('await')) {
          const awaited = tree.rootNode.descendantsOfType('await_expression')[0];
          expect(awaited?.descendantsOfType('conditional_access_expression')).toHaveLength(1);
        }
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('uses grammar identifier characters while proving nullable ownership', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const name of ['a\u0301', 'a\u203F', 'Ā', '變量', '𐐀', String.raw`a\u0301`, String.raw`a\u203f`]) {
      for (const [condition, alternative] of [
        ['x is T?[]', name],
        [`x is ${name}?[]`, 'fallback'],
        ['x is T?[]', `${name}?[0]`],
      ]) {
        const source = `var result = ${condition} ? [1] : ${alternative};`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const ternary = tree.rootNode.descendantsOfType('conditional_expression')[0];
          expect(ternary?.childForFieldName('condition')?.text, source).toBe(condition);
          expect(ternary?.childForFieldName('consequence')?.text, source).toBe('[1]');
          expect(ternary?.childForFieldName('alternative')?.text, source).toBe(alternative);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('retains nullable ownership through empty collections and expression continuations', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const alternative of [
      'a?[0] is T?[]',
      'a?[0] is T?[] t',
      'a?[0] is not null',
      'a?[0] is T?[] ? [a] : b',
      'a?[b](c)',
      'a?[b].c(c)',
      'a?[b](c, d)',
      'a?[b](c)?[d]',
      'f(x)?[g](h)',
      'a?[b](x?[0])',
      'a?[b](c ? [1] : d)',
      'y as (int a, string b)',
      'y as List<(int a, string b)>',
      'y as ((int a, int b) pair, string name)',
    ]) {
      const source = `var result = x is T?[] ? [1] : ${alternative};`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const ternary = tree.rootNode.descendantsOfType('conditional_expression')[0];
        expect(ternary?.childForFieldName('condition')?.text, source).toBe('x is T?[]');
        expect(ternary?.childForFieldName('consequence')?.text, source).toBe('[1]');
        expect(ternary?.childForFieldName('alternative')?.text, source).toBe(alternative);
      } finally {
        tree.delete();
      }
    }
    for (const consequence of ['[]', '[a]']) {
      const tree = parser.parse(`var result = x is T?[] ? ${consequence} : a is T?[] ? [a] : b;`)!;
      try {
        expect(tree.rootNode.hasError, consequence).toBe(false);
        const conditionals = tree.rootNode.descendantsOfType('conditional_expression');
        expect(
          conditionals.map((node) => node.childForFieldName('condition')?.text),
          consequence
        ).toEqual(['x is T?[]', 'a is T?[]']);
        expect(conditionals[0]?.childForFieldName('consequence')?.text).toBe(consequence);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('retains ternary collection access after nonprimary conditions', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const condition of [
      'x switch { _ => 1 }',
      'x with { A = 1 }',
      '1 + x switch { _ => 1 }',
      'x switch { _ => c ? 1 : 2 }',
      'x with { A = a?[0] }',
    ]) {
      for (const collection of ['[1]', '[a, b]', '[..a]', '[]']) {
        const consequence = `${collection}?[0]`;
        const source = `var result = ${condition} ? ${consequence} : d;`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const ternary = tree.rootNode.descendantsOfType('conditional_expression')[0];
          expect(ternary?.childForFieldName('condition')?.text, source).toBe(condition);
          const access = ternary?.childForFieldName('consequence');
          expect(access?.text, source).toBe(consequence);
          expect(access?.type, source).toBe('conditional_access_expression');
          expect(access?.childForFieldName('condition')?.text, source).toBe(collection);
          expect(ternary?.childForFieldName('alternative')?.text, source).toBe('d');
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('allows supported Unicode separators after speculative identifiers', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const name of ['a', 'a\u0301', String.raw`a\u0301`]) {
      for (const gap of ['\u00A0', '\u3000', '\uFEFF', '\u0085', '\u2028', '\u2029']) {
        const source = `var result = x is T?[] ? [1] : ${name}${gap};`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const ternary = tree.rootNode.descendantsOfType('conditional_expression')[0];
          expect(ternary?.childForFieldName('condition')?.text, source).toBe('x is T?[]');
          expect(ternary?.childForFieldName('alternative')?.text, source).toBe(name);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('counts empty collection alternatives when preserving dependent access chains', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const [expression, conditions] of [
      ['a?[0]?[i] is T?[] ? [1] : b : c', ['a?[0]?[i] is T', '[]']],
      ['a?[0]?[i] is T?[] ? [1] : b', ['a?[0]?[i] is T?[]']],
      ['a?[0]?[i] is T?[] ? [1] : b : c : d', ['a?[0]', '[i] is T', '[]']],
      ['a?[0]?[i] is T?[] ? [1] : b : c : d : e', ['a', '[0]', '[i] is T', '[]']],
      ['a?[0]?[i]?[j] is T?[,] : b : c : d', ['a', '[0]', '[i]']],
      ['a?[0]?[i]?[j] is T?[] ? [1] : b : c', ['a?[0]?[i]?[j] is T', '[]']],
      ['a?[0]?[i] is T?[]?[1] : b : c', ['a?[0]?[i] is T', '[]']],
      ['a?[0]?[i] is T?[]?[1] : b', ['a?[0]?[i] is T?[]']],
      ['a?[0] is T ? 1 : b', ['a?[0] is T']],
      ['a?[0] is T ? F() : b', ['a?[0] is T']],
      ['a?[0] ? b is T : c', ['a?[0]']],
    ] as const) {
      const tree = parser.parse(`var result = ${expression};`)!;
      try {
        expect(tree.rootNode.hasError, expression).toBe(false);
        expect(
          tree.rootNode
            .descendantsOfType('conditional_expression')
            .map((node) => node.childForFieldName('condition')?.text),
          expression
        ).toEqual(conditions);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('retains nullable tests around ordinary true arms and conditional-access alternatives', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const type of ['T?[]', 'T?[,]', 'T?[][]']) {
      for (const arm of [
        'a',
        'F()',
        '1',
        'a + b',
        'await F()',
        'new C()',
        'a?[0]',
        'a?.b',
        'a?[0]?[i]',
        '$"{a}"',
        '$@"text? {{ok}} {a}"',
        '@$"{a}"',
        '$$"""text? {{a}}"""',
        '$"{@a}"',
        '$@"{@a}"',
        '$$"""{{@a}}"""',
        '$"{a:0?}"',
        '$"{a,10:0?}"',
        '$@"{a:0?}"',
        '$$"""{{a:0?}}"""',
        '$"{global::A.Value:0?}"',
        '$"{a:0?// text}"',
        '$@"{a:0?/* text}"',
        '$$"""{{a:0?// text}}"""',
        '$"{$"{a}"}"',
        '$@"{$"{a}"}"',
        '$$"""{{$"{a}"}}"""',
        '$"{@$"{a:0?}"}"',
      ]) {
        const source = `var result = x is ${type} ? ${arm} : a is T?[] ? [a] : b;`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const ternaries = tree.rootNode.descendantsOfType('conditional_expression');
          expect(
            ternaries.map((node) => node.childForFieldName('condition')?.text),
            source
          ).toEqual([`x is ${type}`, 'a is T?[]']);
          expect(ternaries[0]?.childForFieldName('consequence')?.text, source).toBe(arm);
        } finally {
          tree.delete();
        }
      }
    }
    for (const type of ['T?[]', 'T?[,]', 'T?[][]']) {
      const source = `var result = x is ${type} ? a is T?[] ? [a] : b : a is T?[] ? [a] : b;`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const ternaries = tree.rootNode.descendantsOfType('conditional_expression');
        expect(
          ternaries.map((node) => node.childForFieldName('condition')?.text),
          source
        ).toEqual([`x is ${type}`, 'a is T', 'a is T?[]']);
        expect(ternaries[1]?.childForFieldName('consequence')?.text, source).toBe('[] ? [a]');
      } finally {
        tree.delete();
      }
    }
    for (const receiver of ['b?[0]', 'b?.m', 'b?[0]?[1]']) {
      for (const operator of ['+', '>', '==', '&']) {
        const condition = `${receiver} is T?[]`;
        const consequence = `f() ${operator} c?.d()`;
        const source = `var result = ${condition} ? ${consequence} : c;`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const ternary = tree.rootNode.descendantsOfType('conditional_expression')[0];
          expect(ternary?.childForFieldName('condition')?.text, source).toBe(condition);
          expect(ternary?.childForFieldName('consequence')?.text, source).toBe(consequence);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('ends delimited is patterns before ternary collection access and other alternatives', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const pattern of [
      '(1, 2)',
      'T(1)',
      'T(a?.b)',
      'obj.M()',
      'T<int>(1)',
      'not T(1)',
      'T(1) { P: 2 }',
      '(int x, int y)',
      '[]',
      '[1]',
      '(a)',
      '(a + b)',
      '(F())',
      '(a?.b)',
      '(a?[0])',
      '((1, 2))',
      '{ P: 1 }',
    ]) {
      const condition = `a is ${pattern}`;
      const source = `var result = ${condition} ? [1]?[0] : d;`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const ternary = tree.rootNode.descendantsOfType('conditional_expression')[0];
        expect(ternary?.childForFieldName('condition')?.text, source).toBe(condition);
        if (pattern.startsWith('T') || pattern.startsWith('obj.') || pattern.startsWith('not T')) {
          expect(
            tree.rootNode.descendantsOfType('recursive_pattern').map((node) => node.text),
            source
          ).toContain(pattern.replace(/^not /, ''));
        }
        const consequence = ternary?.childForFieldName('consequence');
        expect(consequence?.text, source).toBe('[1]?[0]');
        expect(consequence?.type, source).toBe('conditional_access_expression');
        const updated = `${source.slice(0, -2)}fallback;`;
        const fresh = parser.parse(updated)!;
        try {
          expect(fresh.rootNode.hasError, updated).toBe(false);
          expect(
            fresh.rootNode.descendantsOfType('conditional_expression')[0]?.childForFieldName('condition')?.text,
            updated
          ).toBe(condition);
        } finally {
          fresh.delete();
        }
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps access questions inside type-test conditional arguments', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const condition of ['x is not null', 'x is null', 'x is T', '(x is not null)']) {
      for (const consequence of ['c', 'c()', 'new C()']) {
        const inner = `b?[0] ? ${consequence} : a?.b`;
        const expression = `f?[${condition} ? ${inner} : x]`;
        const tree = parser.parse(`var result = ${expression};`)!;
        try {
          expect(tree.rootNode.hasError, expression).toBe(false);
          const conditionals = tree.rootNode.descendantsOfType('conditional_expression');
          expect(
            conditionals.map((node) => node.childForFieldName('condition')?.text),
            expression
          ).toEqual([condition, 'b?[0]']);
          expect(conditionals[0]?.childForFieldName('consequence')?.text, expression).toBe(inner);
          expect(
            tree.rootNode.descendantsOfType('conditional_access_expression').map((node) => node.text),
            expression
          ).toEqual([expression, 'b?[0]', 'a?.b']);
        } finally {
          tree.delete();
        }
      }
    }
    for (const receiver of ['(x switch { _ => 1 })', '(x with { A = 1 })']) {
      const expression = `${receiver}?[0]`;
      const tree = parser.parse(`var result = ${expression};`)!;
      try {
        expect(tree.rootNode.hasError, expression).toBe(false);
        expect(tree.rootNode.descendantsOfType('conditional_expression'), expression).toHaveLength(0);
        expect(tree.rootNode.descendantsOfType('conditional_access_expression')[0]?.text).toBe(expression);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('assigns question ownership in numeric nullable chains with varied suffixes', () => {
  const parser = new Parser().setLanguage(language);
  const prefix = 'var result = a is T?[] ? 1 : ';
  try {
    for (const [suffix, conditions] of [
      ['a is U?[] ? 2 : 0', ['a is T?[]', 'a is U?[]']],
      ['a is U?[] ? [1]?[0] : d', ['a is T?[]', 'a is U?[]']],
      ['a is U?[] ? 2 : 0 : d', ['a is T?[]', 'a is U', '[]']],
      ['a?[0] ? b : c', ['a is T?[]', 'a?[0]']],
    ] as const) {
      const source = `${prefix}${suffix};`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(
          tree.rootNode
            .descendantsOfType('conditional_expression')
            .map((node) => node.childForFieldName('condition')?.text),
          source
        ).toEqual(conditions);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves question ownership in siblings after numeric nullable chains', () => {
  const parser = new Parser().setLanguage(language);
  const first = 'a is T?[] ? 1 : 0';
  const second = 'a is U?[] ? [1]?[0] : d';
  try {
    for (const source of [
      `var result = F(${first}, ${second});`,
      `var result = F((${first}), ${second});`,
      `var result = [${first}, ${second}];`,
      `var first = ${first}; var second = ${second};`,
    ]) {
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(
          tree.rootNode
            .descendantsOfType('conditional_expression')
            .map((node) => node.childForFieldName('condition')?.text),
          source
        ).toEqual(['a is T?[]', 'a is U?[]']);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('assigns later ternary colons before consuming conditional element access', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const receiver of ['a?[0]', 'a?.b?[0]', 'a?[0]?.b']) {
      for (const type of ['T', 'int']) {
        for (const [consequence, alternative] of [
          ['b', 'c'],
          ['b ? d : e', 'c'],
          ['b', 'c ? d : e'],
        ]) {
          const condition = `${receiver} is ${type}`;
          const expression = `${condition} ? ${consequence} : ${alternative}`;
          for (const wrapped of [expression, `F(${expression})`, `flag ? ${expression} : z`]) {
            const tree = parser.parse(`var r = ${wrapped};`)!;
            try {
              expect(tree.rootNode.hasError, wrapped).toBe(false);
              const conditional = tree.rootNode
                .descendantsOfType('conditional_expression')
                .find((node) => node.childForFieldName('condition')?.text === condition);
              expect(conditional?.childForFieldName('consequence')?.text, wrapped).toBe(consequence);
              expect(conditional?.childForFieldName('alternative')?.text, wrapped).toBe(alternative);
              expect(
                conditional?.childForFieldName('condition')?.descendantsOfType('conditional_access_expression')[0]
                  ?.text,
                wrapped
              ).toBe(receiver);
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

test('retains collection ternaries when a later question belongs to a nullable type', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const consequence of ['[0] is T?', '[0] is T? ? b : c']) {
      const expression = `a ? ${consequence} : d`;
      for (const wrapped of [expression, `F(${expression})`, `flag ? ${expression} : z`]) {
        const tree = parser.parse(`var r = ${wrapped};`)!;
        try {
          expect(tree.rootNode.hasError, wrapped).toBe(false);
          const conditional = tree.rootNode
            .descendantsOfType('conditional_expression')
            .find((node) => node.childForFieldName('condition')?.text === 'a');
          expect(conditional?.childForFieldName('consequence')?.text, wrapped).toBe(consequence);
          expect(conditional?.childForFieldName('alternative')?.text, wrapped).toBe('d');
          expect(tree.rootNode.descendantsOfType('conditional_access_expression'), wrapped).toHaveLength(0);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves access proof after a completed ordinary ternary with nested questions', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const arm of ['f(a ? 1 : 2)', '(a ? 1 : 2)', 'a[b ? 1 : 2]']) {
      const expression = `c ? ${arm} : a?[0] is T ? b : c`;
      for (const wrapped of [expression, `F(${expression})`, `flag ? ${expression} : z`]) {
        const tree = parser.parse(`var r = ${wrapped};`)!;
        try {
          expect(tree.rootNode.hasError, wrapped).toBe(false);
          const conditionals = tree.rootNode.descendantsOfType('conditional_expression');
          const final = conditionals.at(-1)!;
          expect(final.childForFieldName('condition')?.text, wrapped).toBe('a?[0] is T');
          expect(final.childForFieldName('consequence')?.text, wrapped).toBe('b');
          expect(final.childForFieldName('alternative')?.text, wrapped).toBe('c');
          expect(
            tree.rootNode.descendantsOfType('conditional_access_expression').map((node) => node.text),
            wrapped
          ).toEqual(['a?[0]']);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves access ownership after typed branches with named expression continuations', () => {
  const parser = new Parser().setLanguage(language);
  const inputs = [
    ['c is T', 'f(a ? 1 : 2)'],
    ['c is T', 'obj.F(a ? 1 : 2)'],
    ['c is T', 'a[b ? 1 : 2]'],
    ['c is T', '@f(a ? 1 : 2)'],
    ['c is T', String.raw`\u0066(a ? 1 : 2)`],
    ['c is T', 'f /* invocation */ (a ? 1 : 2)'],
    ['c is T?[]', 'f(a ? 1 : 2)'],
    ['c is T?[]', 'f(a is U?[] ? [1] : c)'],
    ['c', 'f(a is T?[] ? [1] : c)'],
  ].flatMap(([condition, arm]) => {
    const expression = `${condition} ? ${arm} : a?[0] is T ? b : c`;
    return [expression, `F(${expression})`, `flag ? 0 : ${expression}`].map((wrapped) => `var r = ${wrapped};`);
  });
  try {
    for (const source of [...inputs, 'var r = c ? f(a) : a?[0] is T ? b : c;']) {
      const fresh = parser.parse(source)!;
      try {
        expect(fresh.rootNode.hasError, source).toBe(false);
        const final = fresh.rootNode.descendantsOfType('conditional_expression').at(-1)!;
        expect(
          ['condition', 'consequence', 'alternative'].map((field) => final.childForFieldName(field)?.text),
          source
        ).toEqual(['a?[0] is T', 'b', 'c']);
        expect(
          fresh.rootNode.descendantsOfType('conditional_access_expression').map((node) => node.text),
          source
        ).toEqual(['a?[0]']);
      } finally {
        fresh.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps receiver access when a later ternary alternative contains another type test', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const receiver of ['a?[0]', 'a?[0][1]', 'a?[0]?.b']) {
      for (const alternative of [
        'c is int',
        'c is not null',
        'c is T?[]',
        'c is int and bool',
        'c is U? ? d : e',
        'c as U? ? d : e',
        'c is int || d',
        '(c is int)',
        '[c is int]',
        'M(c is int)',
      ]) {
        const condition = `${receiver} is T`;
        const expression = `${condition} ? b : ${alternative}`;
        for (const wrapped of [
          expression,
          `F(${expression})`,
          ...(alternative === 'c is T?[]' ? [] : [`flag ? ${expression} : z`]),
        ]) {
          const tree = parser.parse(`var r = ${wrapped};`)!;
          try {
            expect(tree.rootNode.hasError, wrapped).toBe(false);
            const conditional = tree.rootNode
              .descendantsOfType('conditional_expression')
              .find((node) => node.childForFieldName('condition')?.text === condition);
            expect(conditional?.childForFieldName('consequence')?.text, wrapped).toBe('b');
            expect(conditional?.childForFieldName('alternative')?.text, wrapped).toBe(alternative);
            expect(
              conditional?.childForFieldName('condition')?.descendantsOfType('conditional_access_expression')[0]?.text,
              wrapped
            ).toBe(receiver);
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

test('preserves nullable true arms and their surrounding conditional ownership', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const arm of ['a is T?', 'a as T?', 'new T?[1]', 'new T?[b ? 1 : 2]', 'new T?[] {a}']) {
      const expression = `c ? ${arm} : d`;
      for (const wrapped of [expression, `F(${expression})`, `flag ? ${expression} : z`]) {
        const tree = parser.parse(`var r = ${wrapped};`)!;
        try {
          expect(tree.rootNode.hasError, wrapped).toBe(false);
          const conditional = tree.rootNode
            .descendantsOfType('conditional_expression')
            .find((node) => node.childForFieldName('condition')?.text === 'c');
          expect(conditional?.childForFieldName('consequence')?.text, wrapped).toBe(arm);
          expect(conditional?.childForFieldName('alternative')?.text, wrapped).toBe('d');
          expect(
            conditional
              ?.childForFieldName('consequence')
              ?.descendantsOfType('nullable_type')
              .map((node) => node.text),
            wrapped
          ).toEqual(['T?']);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves receiver proof through collection arms and argument boundaries', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const receiver of ['a?[0]', 'a?[0]?[i]', 'a?[0]?.b']) {
      for (const consequence of ['b', '[1]', '[]']) {
        for (const alternative of [
          'c is int',
          'new X().Y',
          'delegate { }',
          'stackalloc int[1]',
          'from x in xs select x',
        ]) {
          const condition = `${receiver} is T`;
          const expression = `${condition} ? ${consequence} : ${alternative}`;
          for (const wrapped of [`F(${expression}, d)`, `flag ? ${expression} : z`]) {
            const tree = parser.parse(`var r = ${wrapped};`)!;
            try {
              expect(tree.rootNode.hasError, wrapped).toBe(false);
              const conditional = tree.rootNode
                .descendantsOfType('conditional_expression')
                .find((node) => node.childForFieldName('condition')?.text === condition);
              expect(conditional?.childForFieldName('consequence')?.text, wrapped).toBe(consequence);
              expect(conditional?.childForFieldName('alternative')?.text, wrapped).toBe(alternative);
              expect(
                conditional?.childForFieldName('condition')?.descendantsOfType('conditional_access_expression')[0]
                  ?.text,
                wrapped
              ).toBe(receiver);
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

test('preserves alternative access after a type test with a question-free true arm', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const condition of ['o is Foo', 'o is int', '(d is T)']) {
      for (const consequence of [
        'x',
        '@x',
        'α /* comment */',
        'x.y',
        'this.y',
        'Foo.Bar',
        'x.y()',
        'x()',
        'x[0]',
        '(x)',
        '-x',
        'nameof(x)',
        '"s"',
        'x as Y',
        'x is U',
      ]) {
        for (const receiver of ['args?[0]', 'args?[0]?[i]', 'args?[0]?.M']) {
          const alternative = `${receiver} is T ? y : z`;
          const expression = `${condition} ? ${consequence} : ${alternative}`;
          const tree = parser.parse(`var r = ${expression};`)!;
          try {
            expect(tree.rootNode.hasError, expression).toBe(false);
            const outer = tree.rootNode.descendantsOfType('conditional_expression')[0]!;
            expect(outer.childForFieldName('condition')?.text, expression).toBe(condition);
            expect(outer.childForFieldName('consequence')?.text, expression).toBe(
              consequence.replace(' /* comment */', '')
            );
            const inner = outer.childForFieldName('alternative')!;
            expect(inner.type, expression).toBe('conditional_expression');
            expect(inner.childForFieldName('condition')?.text, expression).toBe(`${receiver} is T`);
            expect(
              inner.childForFieldName('condition')?.descendantsOfType('conditional_access_expression')[0]?.text,
              expression
            ).toBe(receiver);
            expect(inner.childForFieldName('consequence')?.text, expression).toBe('y');
            expect(inner.childForFieldName('alternative')?.text, expression).toBe('z');
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

test('keeps later nullable logical patterns out of ternary colon counts', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const pattern of [
      'T? and U',
      'T? or U',
      'int? and not U',
      'T? and { P: 1 }',
      'T? and 1',
      'T? or "s"',
      'T? /* question */ or /* operand */ @U',
    ]) {
      for (const expression of [
        `y ? a ? b : c ? [a] : d ? [] : x is ${pattern} : w`,
        `flag ? a?[0] is T ? b : x is ${pattern} : w`,
      ]) {
        const tree = parser.parse(`var r = ${expression};`)!;
        try {
          expect(tree.rootNode.hasError, expression).toBe(false);
          const conditionals = tree.rootNode.descendantsOfType('conditional_expression');
          const access = expression.startsWith('flag');
          expect(
            conditionals.map((node) => node.childForFieldName('condition')?.text),
            expression
          ).toEqual(access ? ['flag', 'a?[0] is T'] : ['y', 'a', 'c', 'd']);
          const last = conditionals.at(-1)!;
          expect(last.childForFieldName('consequence')?.text, expression).toBe(access ? 'b' : '[]');
          expect(last.childForFieldName('alternative')?.text, expression).toBe(`x is ${pattern}`);
          expect(
            tree.rootNode.descendantsOfType('conditional_access_expression').map((node) => node.text),
            expression
          ).toEqual(access ? ['a?[0]'] : []);
          expect(tree.rootNode.descendantsOfType('nullable_type'), expression).toHaveLength(1);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('continues outside completed conditional assignments while retaining ordinary right-hand-side postfixes', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const target of ['a?.b', 'a?[0]', 'a?.b?.c', 'a?[0]?[1]', 'true?.b', 'default(T)?[0]']) {
      for (const [right, suffix, parentKind] of [
        ['c as T[]', '.d()', 'member_access_expression'],
        ['c as T?', '.d()', 'member_access_expression'],
        ['c as List<int>.d', '()', 'invocation_expression'],
        ['c as List<int>', '!', 'postfix_unary_expression'],
        ['b with { P = 1 }', '.d()', 'member_access_expression'],
        ['b with { P = 1 }', '[0]', 'element_access_expression'],
        ['b with { P = 1 }', '()', 'invocation_expression'],
      ]) {
        const assignmentText = `${target} = ${right}`;
        const expression = `${assignmentText}${suffix}`;
        const tree = parser.parse(`var result = ${expression};`)!;
        try {
          expect(tree.rootNode.hasError, expression).toBe(false);
          const access = tree.rootNode.descendantsOfType('conditional_access_expression')[0];
          expect(access?.text, expression).toBe(assignmentText);
          expect(access?.parent?.text, expression).toBe(suffix === '.d()' ? `${assignmentText}.d` : expression);
          expect(access?.parent?.type, expression).toBe(parentKind);
          const assignment = access?.descendantsOfType('assignment_expression')[0];
          expect(assignment?.childForFieldName('right')?.text, expression).toBe(right);
        } finally {
          tree.delete();
        }
      }
      for (const right of ['c.d()', 'c[0]', 'c()', 'c!', '(c as T[]).d()', '(b with { P = 1 }).d()']) {
        const expression = `${target} = ${right}`;
        const tree = parser.parse(`var result = ${expression};`)!;
        try {
          expect(tree.rootNode.hasError, expression).toBe(false);
          const access = tree.rootNode.descendantsOfType('conditional_access_expression')[0];
          expect(access?.text, expression).toBe(expression);
          const assignment = access?.descendantsOfType('assignment_expression')[0];
          expect(assignment?.childForFieldName('right')?.text, expression).toBe(right);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('continues suppressed conditional assignments without shortening ordinary conditional chains', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const target of ['a?.b', 'a?[0]', 'default(T)?[0]']) {
      for (const right of ['c as T[]', 'c as List<int>', 'b with { P = 1 }']) {
        for (const suppression of ['!', '!!']) {
          for (const suffix of ['.e()', '[0]', '()', ' + d', ' = d']) {
            const assignmentText = `${target} = ${right}`;
            const expression = `${assignmentText}${suppression}${suffix}`;
            const tree = parser.parse(`var result = ${expression};`)!;
            try {
              expect(tree.rootNode.hasError, expression).toBe(false);
              const access = tree.rootNode.descendantsOfType('conditional_access_expression')[0];
              expect(access?.text, expression).toBe(assignmentText);
              expect(access?.parent?.type, expression).toBe('postfix_unary_expression');
              expect(access?.parent?.text, expression).toBe(`${assignmentText}!`);
              expect(
                tree.rootNode.descendantsOfType('postfix_unary_expression').map((node) => node.text),
                expression
              ).toEqual(suppression === '!!' ? [`${assignmentText}!!`, `${assignmentText}!`] : [`${assignmentText}!`]);
              const assignment = access?.childForFieldName('consequence');
              expect(assignment?.type, expression).toBe('assignment_expression');
              expect(assignment?.childForFieldName('right')?.text, expression).toBe(right);
            } finally {
              tree.delete();
            }
          }
        }
      }
    }
    for (const expression of ['a?.b!.c', 'a?[0]!!.c', 'a?.b = c!.e', 'a?[0] = c!![0]']) {
      const tree = parser.parse(`var result = ${expression};`)!;
      try {
        expect(tree.rootNode.hasError, expression).toBe(false);
        const access = tree.rootNode.descendantsOfType('conditional_access_expression')[0];
        expect(access?.text, expression).toBe(expression);
        expect(access?.descendantsOfType('postfix_unary_expression').length, expression).toBeGreaterThan(0);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves conditional accesses across directives and later nullable operands', () => {
  const parser = new Parser().setLanguage(language);
  const expressions = [
    `c ? [
#if DEBUG
1
#endif
] : []`,
    `items?[
#if DEBUG
0
#else
1
#endif
]`,
    `c ? [
// note
#region r
1
#endregion
] : []`,
    `a?[b ?
#if X
c
#else
d
#endif
:e]`,
    'list?[0] != null ? (int?)list[0] : null',
    '(x?[1] ? 1 : typeof(T?))',
    'M(a?[0] ? default(int?) : null)',
    'M(a?[0] ?? (int?)3)',
  ];
  try {
    for (const expression of expressions) {
      const source = `class C { void M() { var y = ${expression}; } }
class Following {}`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(
          tree.rootNode.descendantsOfType('class_declaration').map((node) => node.childForFieldName('name')?.text),
          source
        ).toEqual(['C', 'Following']);
        if (expression.includes('?[')) {
          expect(tree.rootNode.descendantsOfType('conditional_access_expression'), source).toHaveLength(1);
        } else {
          expect(tree.rootNode.descendantsOfType('conditional_expression'), source).toHaveLength(1);
        }
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('retains spaced conditional member access inside element arguments', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const trivia of ['', ' ', '/* gap */', '\n', '// gap\n']) {
      const expression = `a?[x?${trivia}.y]`;
      for (const source of [`var y = ${expression};`, `var y = $"{${expression}:X}";`]) {
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          expect(
            tree.rootNode
              .descendantsOfType('conditional_access_expression')
              .map((node) => node.childForFieldName('condition')?.text),
            source
          ).toEqual(['a', 'x']);
          expect(tree.rootNode.descendantsOfType('element_binding_expression'), source).toHaveLength(1);
          expect(tree.rootNode.descendantsOfType('member_binding_expression')[0]?.text, source).toBe('.y');
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});
