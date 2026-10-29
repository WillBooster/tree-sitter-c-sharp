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
    ['(T)(a)', 'T', '(a)'],
    ['(nint)(a)', 'nint', '(a)'],
    ['(nuint)!a', 'nuint', '!a'],
    ['(F<T>)(a)', 'F<T>', '(a)'],
    ['(obj.F<T>)(a)', 'obj.F<T>', '(a)'],
    ['(T)!&b', 'T', '!&b'],
    ['(T[])!&b', 'T[]', '!&b'],
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

test('retains parenthesized operands across directive trivia before continuations', () => {
  for (const directive of ['#pragma warning disable CS0168', '#line 42', '#nullable enable', '#region R\n#endregion']) {
    for (const suffix of ['? 1 : 2', '+ 1', '== b', '.Length']) {
      const expression = `(a)\n${directive}\n${suffix}`;
      const tree = parser.parse(`var result = ${expression};`)!;
      try {
        expect(tree.rootNode.hasError, expression).toBe(false);
        expect(tree.rootNode.descendantsOfType('cast_expression'), expression).toHaveLength(0);
        expect(tree.rootNode.descendantsOfType('parenthesized_expression')[0]?.text, expression).toBe('(a)');
      } finally {
        tree.delete();
      }
    }
  }
});

test('retains ordinary cast operands separated or selected by directives', () => {
  for (const type of ['T', 'T[]']) {
    for (const value of ['#pragma warning disable CS0168\na', '#if true\na\n#else\nb\n#endif\n']) {
      const expression = `(${type})\n${value}`;
      const tree = parser.parse(`var result = ${expression};`)!;
      try {
        expect(tree.rootNode.hasError, expression).toBe(false);
        const casts = tree.rootNode.descendantsOfType('cast_expression');
        expect(casts, expression).toHaveLength(1);
        expect(casts[0]?.childForFieldName('type')?.text, expression).toBe(type);
      } finally {
        tree.delete();
      }
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

test('keeps ambiguous parenthesized operands before surrounding binary operators', () => {
  for (const receiver of ['a[i]', 'a[0]', 'arr[i, j]', 'nint', 'nuint']) {
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

test('retains parenthesized and negated collection cast operands in constant patterns', () => {
  for (const type of ['T', 'T[]', 'T[,]']) {
    for (const value of ['(a)', '!(a)', '![a]']) {
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

test('retains chained generic invocations in expression contexts', () => {
  for (const [expression, functionText] of [
    ['GetHandler<T>(x)(y)', 'GetHandler<T>(x)'],
    ['Factory<Foo>(options)(request)', 'Factory<Foo>(options)'],
    ['f<b>(c)(d, e)', 'f<b>(c)'],
    ['x.f<b>(c)(d)', 'x.f<b>(c)'],
    ['F<G<T>>(a)(b)', 'F<G<T>>(a)'],
    ['F<T>(a)(b)(c)', 'F<T>(a)(b)'],
    ['var<T>(a)(b)', 'var<T>(a)'],
    ['extension<T>(a)(b)', 'extension<T>(a)'],
    ['nint<T>(a)(b)', 'nint<T>(a)'],
    ['nuint<T>(a)(b)', 'nuint<T>(a)'],
    ['F<var>(a)(b)', 'F<var>(a)'],
    ['F<G<var>>(a)(b)', 'F<G<var>>(a)'],
    ['F<(var,T)>(a)(b)', 'F<(var,T)>(a)'],
    ['F<(T var,U other)>(a)(b)', 'F<(T var,U other)>(a)'],
    ['F<ref T>(a)(b)', 'F<ref T>(a)'],
    ['F<ref readonly T>(a)(b)', 'F<ref readonly T>(a)'],
    ['F<delegate*<ref int,void>>(a)(b)', 'F<delegate*<ref int,void>>(a)'],
    ['F<T>\n#pragma warning disable CS0168\n(a)(b)', 'F<T>\n#pragma warning disable CS0168\n(a)'],
    ['F\n#line 100\n<T>(a)(b)', 'F\n#line 100\n<T>(a)'],
    ['F<\n#pragma warning disable CS0168\nT>(a)(b)', 'F<\n#pragma warning disable CS0168\nT>(a)'],
    ['@await<T>(a)(b)', '@await<T>(a)'],
    ['α<T>(a)(b)', 'α<T>(a)'],
    ['F<(T,U)>(a)(b)', 'F<(T,U)>(a)'],
    ['F /* gap */ <T> /* gap */ (a)(b)', 'F /* gap */ <T> /* gap */ (a)'],
  ]) {
    for (const source of [`var r = ${expression};`, `class C { object M() { return ${expression}; } }`]) {
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(tree.rootNode.descendantsOfType('cast_expression'), source).toHaveLength(0);
        const invocation = tree.rootNode.descendantsOfType('invocation_expression')[0]!;
        expect(invocation?.text, source).toBe(expression);
        expect(invocation.childForFieldName('function')?.text, source).toBe(functionText);
      } finally {
        tree.delete();
      }
    }
  }
});

test('retains generic call chains in conditional binding owners', () => {
  for (const root of ['a?.G<T>', 'a?.b.G<T>', 'a?[0].G<T>', 'a.b?.G<T>', 'new T[0]?.G<U>', 'a?.b!.G<T>']) {
    for (const tail of ['(x)(y)', '(x)!(y)', '(x)!!(y)(z)', '(x)(y)(z)(w)', '(x)(y)!', '(x)(y)!!']) {
      const expression = `${root}${tail}`;
      const source = `var r = ${expression};`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(tree.rootNode.descendantsOfType('cast_expression'), source).toHaveLength(0);
        const calls = tree.rootNode.descendantsOfType('invocation_expression');
        expect(calls, source).toHaveLength(tail.match(/\(/g)!.length);
        const conditional = tree.rootNode.descendantsOfType('conditional_access_expression')[0]!;
        expect(conditional.text, source).toBe(expression.replace(/!+$/, ''));
        if (expression.endsWith('!')) {
          const suppression = tree.rootNode.descendantsOfType('postfix_unary_expression')[0]!;
          expect(suppression.text, source).toBe(expression);
          expect(suppression.namedChildren[0]?.text, source).toBe(expression.slice(0, -1));
        }
        expect(calls[0]!.childForFieldName('function')?.text, source).toBe(
          conditional.childForFieldName('consequence')!.text.slice(0, -3)
        );
      } finally {
        tree.delete();
      }
    }
  }
  for (const expression of ['a?.G<T>!(x)(y)', 'a?.G<T>!!(x)(y)', 'a?[0].G<T>!(x)(y)']) {
    const tree = parser.parse(`var r = ${expression};`)!;
    try {
      expect(tree.rootNode.hasError, expression).toBe(false);
      expect(tree.rootNode.descendantsOfType('invocation_expression'), expression).toHaveLength(0);
      const cast = tree.rootNode.descendantsOfType('cast_expression')[0]!;
      expect(cast.childForFieldName('type')?.text, expression).toBe('x');
      expect(cast.childForFieldName('value')?.text, expression).toBe('(y)');
    } finally {
      tree.delete();
    }
  }
});

test('keeps parenthesized expression arguments in relational comparisons', () => {
  for (const expression of ['F<(a)>(x)(y)', 'F<((a), b)>(x)(y)', 'F<a+b>(x)(y)']) {
    const tree = parser.parse(`var r = ${expression};`)!;
    try {
      expect(tree.rootNode.hasError, expression).toBe(false);
      expect(tree.rootNode.descendantsOfType('generic_name'), expression).toHaveLength(0);
      const cast = tree.rootNode.descendantsOfType('cast_expression')[0];
      expect(cast?.childForFieldName('type')?.text, expression).toBe('x');
      expect(cast?.childForFieldName('value')?.text, expression).toBe('(y)');
    } finally {
      tree.delete();
    }
  }
});

test('keeps qualified casts independent of earlier generic calls', () => {
  for (const call of ['F<T>(x)(y)', 'F<G<T>>(x)(y)', '(F<T>)(U)']) {
    for (const type of ['T.U', 'A.B.C']) {
      for (const value of ['(a).b', '(a)[0]', '(a)++', '(a).b(1)']) {
        const expression = `${call} + (${type})${value}`;
        for (const source of [
          `var r = ${expression};`,
          `class C { object M() { return ${expression}; } }`,
          `var r = ${call}; var s = (${type})${value};`,
          `class C { void M() { var q = ${call}; var r = (${type})${value}; M2(); } }`,
        ]) {
          const tree = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, source).toBe(false);
            const cast = tree.rootNode
              .descendantsOfType('cast_expression')
              .find((node) => node.childForFieldName('type')?.text === type);
            expect(cast?.text, source).toBe(`(${type})${value}`);
            expect(cast?.childForFieldName('value')?.text, source).toBe(value);
          } finally {
            tree.delete();
          }
        }
      }
    }
  }
});

test('retains bitwise ampersands after suppressed generic invocations', () => {
  for (const call of ['f<T>(a)', 'obj.f<T>(a)']) {
    for (const suppression of ['!', '!!', '! /* gap */']) {
      const left = `${call}${suppression}`;
      const source = `var r = ${left}&b;`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(tree.rootNode.descendantsOfType('cast_expression'), source).toHaveLength(0);
        const binary = tree.rootNode.descendantsOfType('binary_expression')[0]!;
        expect(binary?.childForFieldName('operator')?.text, source).toBe('&');
        expect(binary.childForFieldName('left')?.text, source).toBe(left.replace(' /* gap */', ''));
        expect(tree.rootNode.descendantsOfType('invocation_expression')[0]?.text, source).toBe(call);
      } finally {
        tree.delete();
      }
    }
  }
});

test('retains mixed unary prefixes before parenthesized cast operands', () => {
  for (const type of ['T', 'T[]']) {
    for (const prefix of ['!+', '!-', '!*', '!&', '!^', '~', '!!~']) {
      const expression = `(${type})${prefix}(a)`;
      const tree = parser.parse(`var r = ${expression};`)!;
      try {
        expect(tree.rootNode.hasError, expression).toBe(false);
        const cast = tree.rootNode.descendantsOfType('cast_expression')[0]!;
        expect(cast?.childForFieldName('type')?.text, expression).toBe(type);
        expect(cast.childForFieldName('value')?.text, expression).toBe(`${prefix}(a)`);
      } finally {
        tree.delete();
      }
    }
  }
});

test('keeps later cast ownership independent of earlier cast-shaped terms', () => {
  for (const earlier of ['(T)(x) && ', '(T)(x) || ', 'y = (T)(x) == null && ']) {
    for (const [value, continuation] of [
      ['(y).z', 'is V'],
      ['(y).z', 'as V'],
      ['(y).c.d', 'is not V'],
      ['(y).c()', 'is V'],
      ['(y)[0]', 'is V'],
    ]) {
      const expression = `${earlier}(U)${value} ${continuation}`;
      for (const source of [`var r = ${expression};`, `class C { object M() { return ${expression}; } }`]) {
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const cast = tree.rootNode
            .descendantsOfType('cast_expression')
            .find((node) => node.childForFieldName('type')?.text === 'U');
          expect(cast?.text, source).toBe(`(U)${value}`);
          expect(cast?.childForFieldName('value')?.text, source).toBe(value);
        } finally {
          tree.delete();
        }
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

test('parses cast closing proofs with varied operands and types', () => {
  for (const pattern of [
    'R((T[])a.B)',
    'R((T[]) { P: 1 })',
    'R((T<U>[])a)',
    'R((T<U>[]))',
    'R((T[])a)',
    'R((T[] /* gap */ ) /* operand */ a.B)',
    'R(((T)a))',
    'R(((T[] /* gap */ )a))',
  ]) {
    const source = `var 名 = x is ${pattern};`;
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError, source).toBe(false);
    } finally {
      tree.delete();
    }
  }
});

test('retains generic-call ownership with varied type arguments and call openings', () => {
  for (const expression of [
    'F<T>(x)(y)',
    'F<T> + (x)(y)',
    'F<(T,U)>(x)(y)',
    'F<((T),U)>(x)(y)',
    'F /* gap */ <T> /* gap */ (x)(y)',
    'a?.G<T>(x)(y)',
    'a?.G<T>!(x)(y)',
    'a?.G<T>(x)!(y)',
    'a?[0].G<T>(x)!!(y)',
  ]) {
    const source = `var 名 = ${expression} + (T.U)(a).b;`;
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError, source).toBe(false);
    } finally {
      tree.delete();
    }
  }
});

test('retains generic calls in type-parameter attribute expressions', () => {
  const source = 'class C { void M<[A(F<T>(x)(y))] U>() {} }';
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType('cast_expression')).toHaveLength(0);
    expect(tree.rootNode.descendantsOfType('invocation_expression').map((node) => node.text)).toEqual([
      'F<T>(x)(y)',
      'F<T>(x)',
    ]);
    expect(tree.rootNode.descendantsOfType('type_parameter')[0]?.childForFieldName('name')?.text).toBe('U');
  } finally {
    tree.delete();
  }
});

test('keeps extension keywords distinct from generic names and reserved words', () => {
  for (const source of [
    'class C<T> { C<T>(int x) {} }',
    'struct S<T> where T : class { S<T>(int x) {} }',
    'var r = int<T>(x)(y);',
    'var r = __makeref<T>(x);',
  ]) {
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError, source).toBe(true);
      expect(tree.rootNode.descendantsOfType('extension_declaration'), source).toHaveLength(0);
    } finally {
      tree.delete();
    }
  }
  for (const [source, kind] of [
    ['static class C { extension<T>(T value) {} }', 'extension_declaration'],
    ['class C { void extension<T>(T value) {} }', 'method_declaration'],
  ] as const) {
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError, source).toBe(false);
      expect(tree.rootNode.descendantsOfType(kind), source).toHaveLength(1);
    } finally {
      tree.delete();
    }
  }
});
