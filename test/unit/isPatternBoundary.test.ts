import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

let language: Language;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load('tree-sitter-c_sharp.wasm');
});

test('keeps logical operators and collection ternaries outside an is constant pattern', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  const query = new Query(language, '(is_pattern_expression) @test');
  try {
    const source = 'var result = x is null || y is null ? [1] : [2];';
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError).toBe(false);
      const conditional = tree.rootNode.descendantsOfType('conditional_expression')[0]!;
      expect(conditional.childForFieldName('condition')?.text).toBe('x is null || y is null');
      expect(query.captures(tree.rootNode).map(({ node }) => node.text)).toEqual(['x is null', 'y is null']);
    } finally {
      tree.delete();
    }
    const chain = parser.parse('var result = a == b && hook is not null && hook.Call() == false;')!;
    try {
      expect(chain.rootNode.hasError).toBe(false);
      expect(query.captures(chain.rootNode).map(({ node }) => node.text)).toEqual(['hook is not null']);
      expect(chain.rootNode.descendantsOfType('constant_pattern').map((node) => node.text)).toEqual(['null']);
    } finally {
      chain.delete();
    }
    const guardedCall = parser.parse(
      'var result = count > 1 || count == 1 && items[0] is not null && items[0]?.GetType() != typeof(object[]);'
    )!;
    try {
      expect(guardedCall.rootNode.hasError).toBe(false);
      expect(query.captures(guardedCall.rootNode).map(({ node }) => node.text)).toEqual(['items[0] is not null']);
    } finally {
      guardedCall.delete();
    }
  } finally {
    query.delete();
    parser.delete();
  }
});

test('retains arithmetic and shifts with qualified constants before surrounding operators', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  const query = new Query(language, '(lvalue_expression) @lvalue\n(expression) @expression');
  try {
    for (const constant of [
      '1 + 2 * 3 << 4',
      'A.B + 1',
      'int.MaxValue - 1',
      'A.B * 2',
      'A.B / 2',
      'A.B % 2',
      'A.B << 2',
      'A.B >> 2',
      'A.B >>> 2',
      'A.B.C + D.E.F * 2 << 3',
    ]) {
      for (const suffix of ['', ' | mask', ' && ready']) {
        const source = `var result = value is ${constant}${suffix};`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          expect(
            tree.rootNode.descendantsOfType('is_pattern_expression').map((node) => node.text),
            source
          ).toEqual([`value is ${constant}`]);
          expect(
            tree.rootNode.descendantsOfType('constant_pattern').map((node) => node.text),
            source
          ).toEqual([constant]);
          if (constant === 'A.B + 1') {
            const captures = query.captures(tree.rootNode).map(({ name, node }) => [name, node.text]);
            expect(captures).toContainEqual(['expression', 'A.B']);
            expect(captures).toContainEqual(['lvalue', 'A.B']);
            expect(captures).toContainEqual(['lvalue', 'A']);
            expect(captures).not.toContainEqual(['expression', 'A']);
          }
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    query.delete();
    parser.delete();
  }
});

test('preserves full constant expressions in switch and delimited patterns', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const [source, constants] of [
      ['switch (value) { case 1 | 2: break; }', ['1 | 2']],
      ['var result = value switch { 1 | 2 => true, _ => false };', ['1 | 2']],
      ['var result = value is (1 | 2);', ['1 | 2']],
      ['var result = value is { Property: 1 | 2 };', ['1 | 2']],
      ['var result = value is [1 | 2];', ['1 | 2']],
      ['var result = value is (1 | 2, 3 & 4);', ['(1 | 2, 3 & 4)']],
    ] as const) {
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(
          tree.rootNode.descendantsOfType('constant_pattern').map((node) => node.text),
          source
        ).toEqual(constants);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves complete qualified constants and existing member receiver captures', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  const captures = new Query(language, '(lvalue_expression) @lvalue\n(expression) @expression');
  const tree = parser.parse('var result = value is Namespace.Value.Member or Namespace.Value.Other && ready;')!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType('is_pattern_expression').map((node) => node.text)).toEqual([
      'value is Namespace.Value.Member or Namespace.Value.Other',
    ]);
    expect(tree.rootNode.descendantsOfType('constant_pattern').map((node) => node.text)).toEqual([
      'Namespace.Value.Member',
      'Namespace.Value.Other',
    ]);
    const recorded = captures.captures(tree.rootNode).map(({ name, node }) => [name, node.text]);
    expect(recorded).toContainEqual(['lvalue', 'Namespace']);
    expect(recorded).toContainEqual(['lvalue', 'Namespace.Value']);
    expect(recorded).not.toContainEqual(['expression', 'Namespace']);
  } finally {
    tree.delete();
    captures.delete();
    parser.delete();
  }
});

test('retains existing supertype captures inside intrinsic nameof arguments', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  const query = new Query(language, '(lvalue_expression) @lvalue\n(expression) @expression');
  const tree = parser.parse('var result = value is nameof(Type.Member);')!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType('constant_pattern').map((node) => node.text)).toEqual([
      'nameof(Type.Member)',
    ]);
    const captures = query.captures(tree.rootNode).map(({ name, node }) => [name, node.text]);
    expect(captures).toContainEqual(['lvalue', 'Type']);
    expect(captures).toContainEqual(['lvalue', 'Type.Member']);
    expect(captures).toContainEqual(['expression', 'Type.Member']);
    expect(captures).not.toContainEqual(['expression', 'Type']);
    expect(captures).not.toContainEqual(['lvalue', 'nameof']);
  } finally {
    tree.delete();
    query.delete();
    parser.delete();
  }
});

test('keeps qualified type-shaped calls as complete positional patterns before surrounding operators', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const name of ['Shapes.Point', 'A.B<T>', 'global::A.B<T>', '@nameof']) {
      for (const suffix of ['', ' && ready', ' ? [1] : [2]']) {
        const pattern = `${name}(1, 2)`;
        const source = `var result = shape is ${pattern}${suffix};`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          expect(tree.rootNode.descendantsOfType('is_pattern_expression')[0]?.text, source).toBe(`shape is ${pattern}`);
          const parsed = tree.rootNode.descendantsOfType('recursive_pattern')[0]!;
          expect(parsed.text, source).toBe(pattern);
          expect(parsed.childForFieldName('type')?.text, source).toBe(name);
          expect(parsed.descendantsOfType('positional_pattern_clause')[0]?.text, source).toBe('(1, 2)');
          expect(tree.rootNode.descendantsOfType('invocation_expression'), source).toHaveLength(0);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps qualified null-forgiving constants and their continuations inside is', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  const query = new Query(language, '(expression) @expression\n(lvalue_expression) @lvalue');
  try {
    for (const constant of ['A.B!', 'A.B!!', 'A.B!.C', 'A.B! + 1', 'A.B!!.C + 1 << 2']) {
      for (const suffix of ['', ' && ready', ' | mask']) {
        const source = `var result = value is ${constant}${suffix};`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          expect(
            tree.rootNode.descendantsOfType('is_pattern_expression').map((node) => node.text),
            source
          ).toEqual([`value is ${constant}`]);
          expect(
            tree.rootNode.descendantsOfType('constant_pattern').map((node) => node.text),
            source
          ).toEqual([constant]);
          const captures = query.captures(tree.rootNode).map(({ name, node }) => [name, node.text]);
          expect(captures).toContainEqual(['lvalue', 'A.B']);
          expect(captures).toContainEqual(['lvalue', 'A']);
          expect(captures).not.toContainEqual(['expression', 'A.B']);
          expect(captures).not.toContainEqual(['expression', 'A']);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    query.delete();
    parser.delete();
  }
});

test('keeps parenthesized operands and their canonical categories inside arithmetic constants', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  const query = new Query(
    language,
    '(expression) @expression\n(lvalue_expression) @lvalue\n(non_lvalue_expression) @non_lvalue'
  );
  try {
    for (const constant of [
      '(1 + 1) * 2',
      '(A.B + 1) << 2',
      '(A.B) + 1',
      '(1 | 2) + 3',
      '((1 | 2)) << 3',
      '((A.B)) + 1',
      '(((A.B))) + K',
      '((((A.B)))) << K',
    ]) {
      for (const suffix of ['', ' && ready', ' | mask']) {
        const source = `var result = value is ${constant}${suffix};`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          expect(
            tree.rootNode.descendantsOfType('is_pattern_expression').map((node) => node.text),
            source
          ).toEqual([`value is ${constant}`]);
          expect(
            tree.rootNode.descendantsOfType('constant_pattern').map((node) => node.text),
            source
          ).toEqual([constant]);
          const captures = query.captures(tree.rootNode).map(({ name, node }) => [name, node.text]);
          if (constant === '(A.B) + 1') {
            expect(captures).toContainEqual(['expression', '(A.B)']);
            expect(captures).toContainEqual(['lvalue', '(A.B)']);
            expect(captures).not.toContainEqual(['non_lvalue', '(A.B)']);
          }
          if (constant === '(1 + 1) * 2') {
            expect(captures).toContainEqual(['expression', '(1 + 1)']);
            expect(captures).toContainEqual(['non_lvalue', '(1 + 1)']);
            expect(captures).not.toContainEqual(['lvalue', '(1 + 1)']);
          }
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    query.delete();
    parser.delete();
  }
});

test('retains parenthesized postfix arithmetic inside is before logical operators', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  const query = new Query(language, '(lvalue_expression) @lvalue\n(expression) @expression');
  try {
    for (const suffix of ['', ' && ready']) {
      const source = `var result = value is (A.B)! + 1${suffix};`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(tree.rootNode.descendantsOfType('is_pattern_expression').map((node) => node.text)).toEqual([
          'value is (A.B)! + 1',
        ]);
        const captures = query.captures(tree.rootNode).map(({ name, node }) => [name, node.text]);
        expect(captures).toContainEqual(['lvalue', '(A.B)']);
        expect(captures).toContainEqual(['lvalue', 'A.B']);
        expect(captures).not.toContainEqual(['expression', '(A.B)']);
      } finally {
        tree.delete();
      }
    }
  } finally {
    query.delete();
    parser.delete();
  }
});

test('keeps arithmetic constants with nonliteral right operands before surrounding operators', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const constant of [
      'nameof(C) + C.S',
      '1 + K',
      '2 * K',
      '1 << K',
      '-1 + K',
      '"a" + K',
      '1 + K.Max',
      '1 + K[0]',
      '1 + (K)',
    ]) {
      for (const suffix of [' && ready', ' || ready', ' == other', ' ?? other']) {
        const source = `var result = value is ${constant}${suffix};`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          expect(
            tree.rootNode.descendantsOfType('is_pattern_expression').map((node) => node.text),
            source
          ).toEqual([`value is ${constant}`]);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps full constant expressions inside parentheses in every delimited pattern context', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const constant of ['(1)', '(1 + 2)', '(1 | 2)', '(null)', '("s")', '(sizeof(int))', '(A.B + 1)']) {
      for (const source of [
        `var result = value is ${constant};`,
        `switch (value) { case ${constant}: break; }`,
        `var result = value switch { ${constant} => true, _ => false };`,
        `var result = value is { Property: ${constant} };`,
        `var result = value is [${constant}];`,
        `var result = value is [.. ${constant}];`,
      ]) {
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          expect(
            tree.rootNode.descendantsOfType(['constant_pattern', 'parenthesized_pattern']).map((node) => node.text),
            source
          ).toContain(constant);
          expect(
            tree.rootNode.descendantsOfType('constant_pattern').map((node) => node.text),
            source
          ).toEqual([constant.slice(1, -1)]);
          expect(tree.rootNode.descendantsOfType('positional_pattern_clause'), source).toHaveLength(0);
        } finally {
          tree.delete();
        }
      }
    }
    const pattern = parser.parse('var result = value is (var item);')!;
    try {
      expect(pattern.rootNode.hasError).toBe(false);
      expect(pattern.rootNode.descendantsOfType('parenthesized_pattern').map((node) => node.text)).toEqual([
        '(var item)',
      ]);
    } finally {
      pattern.delete();
    }
  } finally {
    parser.delete();
  }
});

test('keeps conditional case labels intact alongside constant and declaration patterns', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const condition of ['A', 'A.B', 'global::A.B']) {
      const source = `switch (value) { case ${condition} ? First : Second: break; case 1: break; case nameof(value): break; case int item: break; }`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const sections = tree.rootNode.descendantsOfType('switch_section');
        expect(
          sections[0]?.namedChildren.map((node) => node.type),
          source
        ).toEqual(['conditional_expression', 'break_statement']);
        expect(sections[0]?.namedChild(0)?.text).toBe(`${condition} ? First : Second`);
        expect(sections[1]?.namedChild(0)?.type).toBe('constant_pattern');
        expect(sections[2]?.namedChild(0)?.type).toBe('constant_pattern');
        expect(sections[3]?.namedChild(0)?.type).toBe('declaration_pattern');
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps unguarded switch list patterns distinct from collection expressions', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  const query = new Query(language, '(pattern) @pattern\n(expression) @expression');
  try {
    for (const pattern of ['[]', '[1]', '[1, 2]', '[A.B]', '[nameof(value)]', '[1, ..]']) {
      for (const guard of ['', ' when ready']) {
        const source = `switch (value) { case ${pattern}${guard}: break; }`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const section = tree.rootNode.descendantsOfType('switch_section')[0]!;
          expect(section.namedChild(0)?.type, source).toBe('list_pattern');
          expect(section.namedChild(0)?.text).toBe(pattern);
          const captures = query.captures(tree.rootNode).map(({ name, node }) => [name, node.text]);
          expect(captures).toContainEqual(['pattern', pattern]);
          expect(captures).not.toContainEqual(['expression', pattern]);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    query.delete();
    parser.delete();
  }
});

test('preserves complete expressions through repeated pattern parentheses without singleton deconstruction', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const inner of ['1', '1 + 2', '1 | 2', 'null']) {
      for (const depth of [1, 2, 3, 5]) {
        const constant = `${'('.repeat(depth)}${inner}${')'.repeat(depth)}`;
        for (const source of [
          `var result = value is ${constant};`,
          `switch (value) { case ${constant}: break; }`,
          `var result = value is { Property: ${constant} };`,
          `var result = value is [${constant}];`,
        ]) {
          const tree = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, source).toBe(false);
            expect(
              tree.rootNode.descendantsOfType('constant_pattern').map((node) => node.text),
              source
            ).toEqual([inner]);
            expect(
              tree.rootNode.descendantsOfType('parenthesized_pattern').map((node) => node.text),
              source
            ).toContain(constant);
            expect(tree.rootNode.descendantsOfType('positional_pattern_clause'), source).toHaveLength(0);
          } finally {
            tree.delete();
          }
        }
      }
    }
    for (const pattern of ['((var item))', '((not null))', '((1 or 2))', '((> 1))']) {
      const tree = parser.parse(`var result = value is ${pattern};`)!;
      try {
        expect(tree.rootNode.hasError, pattern).toBe(false);
        expect(tree.rootNode.descendantsOfType('parenthesized_pattern').map((node) => node.text)).toContain(pattern);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps identifier-type cast constants complete through arithmetic and qualified values', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const cast of ['(T)A.B', '(Color)Colors.Red', '(T)A.B.C', '(T)A.B!', '(T)A.B(1)']) {
      for (const arithmetic of ['', ' + 1', ' << K']) {
        const constant = `${cast}${arithmetic}`;
        for (const source of [
          `var result = value is ${constant};`,
          `var result = value is ${constant} && ready;`,
          `f(value is ${constant}, other);`,
        ]) {
          const tree = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, source).toBe(false);
            expect(
              tree.rootNode.descendantsOfType('is_pattern_expression').map((node) => node.text),
              source
            ).toEqual([`value is ${constant}`]);
            expect(tree.rootNode.descendantsOfType('constant_pattern')[0]?.text).toBe(constant);
            const castNode = tree.rootNode.descendantsOfType('cast_expression')[0]!;
            expect(castNode.text).toBe(cast);
            expect(castNode.childForFieldName('value')?.text).toBe(cast.slice(cast.indexOf(')') + 1));
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

test('retains qualified parenthesized switch patterns and their query category', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  const query = new Query(language, '(pattern) @pattern');
  try {
    for (const depth of [1, 2, 3, 5]) {
      const pattern = `${'('.repeat(depth)}A.B${')'.repeat(depth)}`;
      const source = `switch (value) { case ${pattern}: break; }`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(tree.rootNode.descendantsOfType('switch_section')[0]?.namedChild(0)?.type).toBe('parenthesized_pattern');
        expect(tree.rootNode.descendantsOfType('constant_pattern').map((node) => node.text)).toEqual(['A.B']);
        expect(query.captures(tree.rootNode).map(({ node }) => node.text)).toContain(pattern);
      } finally {
        tree.delete();
      }
    }
  } finally {
    query.delete();
    parser.delete();
  }
});

test('keeps primary receivers and mixed call/member/postfix chains inside is constants', () => {
  const parser = new Parser().setLanguage(language);
  const query = new Query(language, '(expression) @expression\n(lvalue_expression) @lvalue');
  try {
    for (const constant of [
      '"hello".Length',
      'nameof(C).Length',
      '$"hello{value}".Length',
      'new C().Member().Next!',
      'A.B!(1, 2)',
      'nameof(C)!',
      '(Colors).Red',
      '((A.B)).C',
      '(1).ToString',
      '(1, 2).Item1',
      'nameof(C).Next().Last!',
      '"hello".Member().Next!',
    ]) {
      for (const suffix of ['', ' && ready', ' | mask']) {
        const source = `var result = value is ${constant}${suffix};`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          expect(
            tree.rootNode.descendantsOfType('is_pattern_expression').map((node) => node.text),
            source
          ).toEqual([`value is ${constant}`]);
          expect(
            tree.rootNode.descendantsOfType('constant_pattern').map((node) => node.text),
            source
          ).toEqual([constant]);
          if (constant === 'nameof(C)!') {
            const captures = query.captures(tree.rootNode).map(({ name, node }) => [name, node.text]);
            expect(captures).toContainEqual(['lvalue', 'nameof']);
            expect(captures).not.toContainEqual(['expression', 'nameof']);
            expect(captures).not.toContainEqual(['expression', 'nameof(C)']);
          }
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    query.delete();
    parser.delete();
  }
});

test('distinguishes ordinary positional calls from intrinsic nameof in nested pattern contexts', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const pattern of [
      'M()',
      'M((1))',
      'M((1), (2))',
      'A.B((1), (2))',
      'global::A<T>(1, 2)',
      'M(int x)',
      'M((>1))',
      'M((1 or 2))',
      'M((1)) item',
      'M() item',
      'M() { P: 1 } item',
      '@nameof(Type.Member)',
      'A.nameof(Type.Member)',
      'nameof<T>(Type.Member)',
      'nameofValue(C)',
      'nameofπ(C)',
      String.raw`nameo\u0066(C)`,
    ]) {
      for (const source of [
        `var result = value is ${pattern};`,
        `var result = value is { P: ${pattern} };`,
        `var result = value is [${pattern}];`,
        `var result = value switch { ${pattern} => 1, _ => 2 };`,
      ]) {
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          expect(
            tree.rootNode.descendantsOfType('recursive_pattern').map((node) => node.text),
            source
          ).toContain(pattern);
        } finally {
          tree.delete();
        }
      }
    }
    for (const constant of [
      'nameof(Type.Member)',
      'nameof((Foo))',
      'nameof(var(a, b))',
      'nameof(Foo(var(a, b)))',
      'nameof(C) + C.S',
      'nameof(C) << 1',
    ]) {
      for (const source of [
        `var result = value is ${constant} && ready;`,
        `var result = value is { P: ${constant} };`,
        `var result = value is [${constant}];`,
        `var result = value switch { ${constant} => 1, _ => 2 };`,
      ]) {
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          expect(
            tree.rootNode.descendantsOfType('constant_pattern').map((node) => node.text),
            source
          ).toEqual([constant]);
        } finally {
          tree.delete();
        }
      }
    }
    for (const name of ['nameofValue', 'nameofπ', 'nameof𐐀', String.raw`nameof\u0061`, '@nameof', 'varValue', '@var']) {
      const source = `var ${name} = ${name}(value);`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(tree.rootNode.descendantsOfType('invocation_expression')[0]?.childForFieldName('function')?.text).toBe(
          name
        );
        expect(tree.rootNode.descendantsOfType('variable_declarator')[0]?.childForFieldName('name')?.text).toBe(name);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps casts complete in delimited constants without changing unary-minus ambiguity', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const constant of ['(T)A', '(T)null', '(T)A.B', '(T)A.B(1)']) {
      for (const source of [
        `var result = value switch { ${constant} => 1, _ => 2 };`,
        `var result = value is { P: ${constant} };`,
        `var result = value is [${constant}];`,
        `var result = value is [.. ${constant}];`,
      ]) {
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const parsed = tree.rootNode.descendantsOfType('constant_pattern')[0]!;
          expect(parsed.text, source).toBe(constant);
          expect(parsed.namedChild(0)?.type, source).toBe('cast_expression');
        } finally {
          tree.delete();
        }
      }
    }
    for (const source of [
      'var result = value switch { (T)-1 => 1, _ => 2 };',
      'var result = value is { P: (T)-1 };',
      'var result = value is [(T)-1];',
    ]) {
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const parsed = tree.rootNode.descendantsOfType('constant_pattern')[0]!;
        expect(parsed.text, source).toBe('(T)-1');
        expect(parsed.namedChild(0)?.type, source).toBe('binary_expression');
      } finally {
        tree.delete();
      }
    }
    for (const pattern of ['(>1) item', '(1 or 2) item', '(var x) item']) {
      const tree = parser.parse(`var result = value is { P: ${pattern} };`)!;
      try {
        expect(tree.rootNode.hasError, pattern).toBe(false);
        const designated = tree.rootNode.descendantsOfType('recursive_pattern').find((node) => node.text === pattern)!;
        expect(designated.childForFieldName('name')?.text, pattern).toBe('item');
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves parenthesized tuple-designation patterns and genuine positional clauses', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const pattern of ['(var (a, b))', '((var (a, _)))', '(((var (a, (b, c)))))']) {
      for (const source of [
        `var result = value is ${pattern};`,
        `var result = value is not ${pattern};`,
        `var result = value is { P: ${pattern} };`,
        `var result = value is [${pattern}];`,
        `var result = value switch { ${pattern} => 1, _ => 2 };`,
      ]) {
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          expect(
            tree.rootNode.descendantsOfType('parenthesized_pattern').map((node) => node.text),
            source
          ).toContain(pattern);
        } finally {
          tree.delete();
        }
      }
    }
    for (const pattern of ['M(var (a, b))', '(var (a, b), other)', 'M() item']) {
      const tree = parser.parse(`var result = value is ${pattern};`)!;
      try {
        expect(tree.rootNode.hasError, pattern).toBe(false);
        expect(tree.rootNode.descendantsOfType('is_pattern_expression')[0]?.childForFieldName('pattern')?.type).toBe(
          'recursive_pattern'
        );
        expect(tree.rootNode.descendantsOfType('positional_pattern_clause').length, pattern).toBeGreaterThan(0);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves tuple-var patterns through negation and nested named positional clauses', () => {
  const parser = new Parser().setLanguage(language);
  const query = new Query(language, '(expression) @expression\n(lvalue_expression) @lvalue');
  try {
    for (const pattern of [
      '(not (var (a, b)))',
      '((not (var (a, _))))',
      'Foo(Foo(var (a, b)))',
      'Foo(P: Foo(var (a, b)))',
    ]) {
      for (const source of [
        `var result = value is ${pattern};`,
        `var result = value is { P: ${pattern} };`,
        `var result = value is [${pattern}];`,
        `var result = value switch { ${pattern} => 1, _ => 2 };`,
      ]) {
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          expect(tree.rootNode.descendantsOfType('var_pattern'), source).toHaveLength(1);
          expect(tree.rootNode.descendantsOfType('invocation_expression'), source).toHaveLength(0);
          if (pattern.startsWith('(')) {
            expect(
              tree.rootNode.descendantsOfType('parenthesized_pattern').map((node) => node.text),
              source
            ).toContain(pattern);
          }
        } finally {
          tree.delete();
        }
      }
    }
    const labeled = parser.parse('var result = value is { P: Foo(Label: Foo(var(a, b))) };')!;
    try {
      expect(labeled.rootNode.hasError).toBe(false);
      const captures = query.captures(labeled.rootNode).map(({ name, node }) => [name, node.text]);
      expect(captures).toContainEqual(['expression', 'P']);
      expect(captures).toContainEqual(['lvalue', 'P']);
      expect(captures).not.toContainEqual(['expression', 'Label']);
      expect(captures).not.toContainEqual(['lvalue', 'Label']);
    } finally {
      labeled.delete();
    }
    const call = parser.parse('var result = Foo(Foo(var(a, b)));')!;
    try {
      expect(call.rootNode.hasError).toBe(false);
      expect(call.rootNode.descendantsOfType('var_pattern')).toHaveLength(0);
      expect(call.rootNode.descendantsOfType('invocation_expression')).toHaveLength(3);
    } finally {
      call.delete();
    }
  } finally {
    query.delete();
    parser.delete();
  }
});
