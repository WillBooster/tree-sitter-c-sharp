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
      ['var result = value is (1 | 2);', ['(1 | 2)']],
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

test('retains existing supertype captures inside ordinary name-call arguments', () => {
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

test('keeps qualified positional arguments inside the is pattern with direct member captures', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  const query = new Query(language, '(expression) @expression\n(lvalue_expression) @lvalue');
  try {
    for (const suffix of ['', ' && ready', ' ? [1] : [2]']) {
      const source = `var result = shape is Shapes.Point(1, 2)${suffix};`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(
          tree.rootNode.descendantsOfType('is_pattern_expression').map((node) => node.text),
          source
        ).toEqual(['shape is Shapes.Point(1, 2)']);
        const invocation = tree.rootNode.descendantsOfType('invocation_expression')[0]!;
        expect(invocation.childForFieldName('function')?.text).toBe('Shapes.Point');
        expect(invocation.childForFieldName('arguments')?.text).toBe('(1, 2)');
        const captures = query.captures(tree.rootNode).map(({ name, node }) => [name, node.text]);
        expect(captures).toContainEqual(['lvalue', 'Shapes']);
        expect(captures).not.toContainEqual(['expression', 'Shapes']);
        expect(captures).not.toContainEqual(['expression', 'Shapes.Point']);
        expect(captures).not.toContainEqual(['lvalue', 'Shapes.Point']);
      } finally {
        tree.delete();
      }
    }
  } finally {
    query.delete();
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

test('preserves parenthesized constant nodes in every delimited pattern context', () => {
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
          const pattern = tree.rootNode.descendantsOfType('constant_pattern').find((node) => node.text === constant);
          expect(
            pattern?.namedChildren.map((node) => node.type),
            source
          ).toEqual(['parenthesized_expression']);
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

test('preserves complete constants through repeated parentheses and genuine nested patterns', () => {
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
            ).toEqual([constant]);
            expect(tree.rootNode.descendantsOfType('parenthesized_pattern'), source).toHaveLength(0);
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
