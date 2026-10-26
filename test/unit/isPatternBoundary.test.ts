import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

import { editTree, syntaxSnapshot } from '../helpers/syntaxSnapshot';

let language: Language;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load('tree-sitter-c_sharp.wasm');
});

test('preserves case patterns, guards and statement labels across clause edits', () => {
  const samples = [
    {
      source: 'switch (x) { case T?[] y when a ? b : c: label: break; case 2: break; }',
      pattern: 'declaration_pattern',
      guards: ['when a ? b : c'],
      labels: ['label'],
    },
    {
      source: 'switch (x) { case y when a ? [1] : b is T?[]? and not null: break; case 2: break; }',
      pattern: 'constant_pattern',
      guards: ['when a ? [1] : b is T?[]? and not null'],
      labels: [],
    },
    {
      source: 'switch (x) { case 1 when c ? x is T? { } : d: case a ? [1] : b: break; }',
      pattern: 'constant_pattern',
      guards: ['when c ? x is T? { } : d'],
      labels: ['b'],
    },
    {
      source: 'switch (x) { case 1 when c ? x is T? { P: 1 } : d: case A.B ? [] : b: break; }',
      pattern: 'constant_pattern',
      guards: ['when c ? x is T? { P: 1 } : d'],
      labels: ['b'],
    },
    {
      source: 'switch (x) { case 1 when global::A.Ready: case a ? [1] : b: break; }',
      pattern: 'constant_pattern',
      guards: ['when global::A.Ready'],
      labels: ['b'],
    },
    {
      source: 'switch (x) { case 1 when F(global::A.Ready): case a ? [1] : b: break; }',
      pattern: 'constant_pattern',
      guards: ['when F(global::A.Ready)'],
      labels: ['b'],
    },
    {
      source: 'switch (x) { case 1 when $"{a:x}" == ready: case a ? [1] : b: break; }',
      pattern: 'constant_pattern',
      guards: ['when $"{a:x}" == ready'],
      labels: ['b'],
    },
    {
      source: 'switch (x) { case y when new T?[1] ? [b ? c : d] : b: break; }',
      pattern: 'constant_pattern',
      guards: ['when new T?[1] ? [b ? c : d]'],
      guardKinds: ['array_creation_expression'],
      labels: ['b'],
    },
    {
      source: 'switch (x) { case y when new T[1] ? [b ? c : d] : b: break; }',
      pattern: 'constant_pattern',
      guards: ['when new T[1] ? [b ? c : d]'],
      guardKinds: ['array_creation_expression'],
      labels: ['b'],
    },
    { source: 'switch (x) { case a ? [1] : b: break; }', pattern: 'type_pattern', guards: [], labels: ['b'] },
    { source: 'switch (x) { case a ? [] : b: break; }', pattern: 'type_pattern', guards: [], labels: ['b'] },
    { source: 'switch (x) { case A.B ? [1] : b: break; }', pattern: 'type_pattern', guards: [], labels: ['b'] },
    {
      source: 'switch (x) { case T?[] y when /* guard */ (a ? [1] : b): label: break; }',
      pattern: 'declaration_pattern',
      guards: ['when /* guard */ (a ? [1] : b)'],
      labels: ['label'],
    },
    {
      source: 'switch (x) { case T whenfoo: label: break; case T @when: other: break; }',
      pattern: 'declaration_pattern',
      guards: [],
      labels: ['label', 'other'],
    },
    {
      source:
        'switch (x) { case y when a ? [1] : b: outer: switch (z) { case T?[] q when c ? [] : d: inner: break; case A.B ? [1] : last: break; } break; }',
      pattern: 'constant_pattern',
      guards: ['when a ? [1] : b', 'when c ? [] : d'],
      labels: ['outer', 'inner', 'last'],
    },
    {
      source:
        'switch (x) { case y when F(() => { switch (z) { case q when ready: break; } return a; }) ? [1] : b: break; }',
      pattern: 'constant_pattern',
      guards: ['when F(() => { switch (z) { case q when ready: break; } return a; }) ? [1] : b', 'when ready'],
      labels: [],
    },
    {
      source:
        'switch (x) { case y when F(() => { switch (z) { case q when c ? d : e: break; } return a; }) ? [1] : b: break; }',
      pattern: 'constant_pattern',
      guards: ['when F(() => { switch (z) { case q when c ? d : e: break; } return a; }) ? [1] : b', 'when c ? d : e'],
      labels: [],
    },
    {
      source: 'switch(x) { case y when a?[0] ? b : G<A,B> ? [new T?()] : 0: label: break; }',
      pattern: 'constant_pattern',
      guards: ['when a?[0] ? b : G<A,B> ? [new T?()] : 0: label'],
      labels: [],
    },
    {
      source: 'switch(x) { case y when a?[0] ? a : new T[1] ? [1] : d: label: break; }',
      pattern: 'constant_pattern',
      guards: ['when a?[0] ? a : new T[1] ? [1] : d'],
      labels: ['label'],
    },
    {
      source: 'switch(x) { case y when a?[0] ? b : G<A,B> ? [new (int,int)?()] : 0: label: break; }',
      pattern: 'constant_pattern',
      guards: ['when a?[0] ? b : G<A,B> ? [new (int,int)?()] : 0: label'],
      labels: [],
    },
    {
      source: 'switch (x) { case n when p && y as T ? [3] : c: label: break; }',
      pattern: 'constant_pattern',
      guards: ['when p && y as T ? [3]'],
      labels: ['c', 'label'],
    },
    { source: 'var r = x switch { T?[] y when a ? [1] : b => 1, _ => 0 };', guards: ['when a ? [1] : b'], labels: [] },
  ];
  const parser = new Parser().setLanguage(language);
  const query = new Query(language, '(when_clause) @guard (labeled_statement (identifier) @label)');
  let previous = 'var r = 0;';
  let tree = parser.parse(previous)!;
  try {
    for (const sample of [...samples, ...samples.toReversed()]) {
      const fresh = parser.parse(sample.source)!;
      editTree(tree, previous, sample.source);
      const incremental = parser.parse(sample.source, tree)!;
      try {
        expect(fresh.rootNode.hasError, sample.source).toBe(false);
        if (sample.pattern) {
          expect(fresh.rootNode.descendantsOfType('switch_section')[0]?.firstNamedChild?.type, sample.source).toBe(
            sample.pattern
          );
        }
        const captures = query.captures(fresh.rootNode);
        if (sample.guardKinds) {
          expect(
            fresh.rootNode.descendantsOfType('when_clause').map((node) => node.firstNamedChild?.type),
            sample.source
          ).toEqual(sample.guardKinds);
        }
        expect(
          captures.filter(({ name }) => name === 'guard').map(({ node }) => node.text),
          sample.source
        ).toEqual(sample.guards);
        expect(
          captures.filter(({ name }) => name === 'guard').map(({ node }) => [node.startIndex, node.endIndex]),
          sample.source
        ).toEqual(
          sample.guards.map((guard) => [sample.source.indexOf(guard), sample.source.indexOf(guard) + guard.length])
        );
        expect(
          captures.filter(({ name }) => name === 'label').map(({ node }) => node.text),
          sample.source
        ).toEqual(sample.labels);
        expect(syntaxSnapshot(incremental.rootNode), sample.source).toEqual(syntaxSnapshot(fresh.rootNode));
      } finally {
        fresh.delete();
        tree.delete();
      }
      tree = incremental;
      previous = sample.source;
    }
    for (const incomplete of [
      'switch (x) { case y when',
      'switch (x) { case T?[] y when a ?',
      'switch (x) { case y when a ? [1] : b:',
      'switch (x) { case T?[] y:',
    ]) {
      editTree(tree, previous, incomplete);
      const incremental = parser.parse(incomplete, tree)!;
      const fresh = parser.parse(incomplete)!;
      try {
        expect(fresh.rootNode.hasError, incomplete).toBe(true);
        expect(syntaxSnapshot(incremental.rootNode), incomplete).toEqual(syntaxSnapshot(fresh.rootNode));
      } finally {
        fresh.delete();
        tree.delete();
      }
      tree = incremental;
      previous = incomplete;
    }
  } finally {
    tree.delete();
    query.delete();
    parser.delete();
  }
});

test('retains function-pointer types on positional recursive patterns', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const type of ['delegate*<void>', 'delegate*unmanaged<void>', 'delegate*unmanaged[Cdecl]<int,void>']) {
      for (const clause of ['(p,q)', '(1,2)', '(p,q) { P: 1 } item']) {
        const pattern = `${type} ${clause}`;
        for (const statement of [
          `var result = x is ${pattern};`,
          `var result = x switch { ${pattern} => 1, _ => 0 };`,
          `switch (x) { case ${pattern}: break; }`,
          `var result = x is { P: ${pattern} };`,
          `var result = x is [${pattern}];`,
        ]) {
          const source = `class C { unsafe void M() { ${statement} } }`;
          const tree = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, source).toBe(false);
            const recursive = tree.rootNode
              .descendantsOfType('recursive_pattern')
              .find((node) => node.childForFieldName('type')?.type === 'function_pointer_type');
            expect(recursive?.text, source).toBe(pattern);
            expect(recursive?.childForFieldName('type')?.text, source).toBe(type);
            expect(
              recursive?.namedChildren.find((node) => node.type === 'positional_pattern_clause')?.text,
              source
            ).toBe(clause.slice(0, clause.indexOf(')') + 1));
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

test('distinguishes await expressions from constant-pattern roots', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const expression of ['x is await T()', 'x is { P: await T() }', 'x is (await T())']) {
      const tree = parser.parse(`class C { async void M() { var result = ${expression}; } }`)!;
      try {
        expect(tree.rootNode.hasError, expression).toBe(true);
      } finally {
        tree.delete();
      }
    }
    for (const expression of ['await T()', 'x is (throw new Exception())']) {
      const tree = parser.parse(`class C { async void M() { var result = ${expression}; } }`)!;
      try {
        expect(tree.rootNode.hasError, expression).toBe(false);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
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
    for (const [expression, bounded] of [
      ['x is a && y', 'x is a'],
      ['x is not null && y', 'x is not null'],
    ]) {
      const tree = parser.parse(`var result = ${expression};`)!;
      try {
        expect(tree.rootNode.hasError, expression).toBe(false);
        const binary = tree.rootNode.descendantsOfType('binary_expression').find((node) => node.text === expression)!;
        expect(binary?.childForFieldName('left')?.text, expression).toBe(bounded);
        expect(binary?.childForFieldName('operator')?.text, expression).toBe('&&');
        expect(
          tree.rootNode.descendantsOfType('is_pattern_expression').map((node) => node.text),
          expression
        ).toEqual([bounded]);
      } finally {
        tree.delete();
      }
    }
  } finally {
    query.delete();
    parser.delete();
  }
});

test('retains arithmetic and shifts with qualified constants before surrounding operators', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  const query = new Query(language, '(binary_expression left: (member_access_expression) @operand)');
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
            expect(captures).toContainEqual(['operand', 'A.B']);
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
      ['var result = value is Foo(1 | 2);', ['1 | 2']],
      ['var result = value is Foo(A.B << 2);', ['A.B << 2']],
      ['var result = value is (1 | 2, 3 & 4);', ['1 | 2', '3 & 4']],
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

test('keeps complete qualified constants in logical patterns', () => {
  const parser = new Parser();
  parser.setLanguage(language);
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
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('parses intrinsic nameof as a constant pattern', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  const query = new Query(language, '(expression) @expression');
  const tree = parser.parse('var result = value is nameof(Type.Member);')!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType('constant_pattern').map((node) => node.text)).toEqual([
      'nameof(Type.Member)',
    ]);
    const captures = query.captures(tree.rootNode).map(({ name, node }) => [name, node.text]);
    expect(captures).toContainEqual(['expression', 'Type.Member']);
  } finally {
    tree.delete();
    query.delete();
    parser.delete();
  }
});

test('keeps qualified null-forgiving constants and their continuations inside is', () => {
  const parser = new Parser();
  parser.setLanguage(language);
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
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps parenthesized operands inside arithmetic constants', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  const query = new Query(language, '(binary_expression left: (parenthesized_expression) @operand)');
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
            expect(captures).toContainEqual(['operand', '(A.B)']);
          }
          if (constant === '(1 + 1) * 2') {
            expect(captures).toContainEqual(['operand', '(1 + 1)']);
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
  try {
    for (const suffix of ['', ' && ready']) {
      const source = `var result = value is (A.B)! + 1${suffix};`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(tree.rootNode.descendantsOfType('is_pattern_expression').map((node) => node.text)).toEqual([
          'value is (A.B)! + 1',
        ]);
      } finally {
        tree.delete();
      }
    }
  } finally {
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

test('keeps conditional case labels intact alongside constant and declaration patterns', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const [whenTrue, whenFalse] of [
      ['First', 'Second'],
      ['1', '2'],
    ]) {
      for (const condition of ['A', 'A.B', 'global::A.B', 'A + B', 'A && B', 'A + B == C', 'A * B < C', 'A | B']) {
        const source = `switch (value) { case ${condition} ? ${whenTrue} : ${whenFalse}: break; case 1: break; case nameof(value): break; case int item: break; }`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const sections = tree.rootNode.descendantsOfType('switch_section');
          expect(
            sections[0]?.namedChildren.map((node) => node.type),
            source
          ).toEqual(['constant_pattern', 'break_statement']);
          expect(sections[0]?.namedChild(0)?.namedChild(0)?.type).toBe('conditional_expression');
          expect(sections[0]?.namedChild(0)?.text).toBe(`${condition} ? ${whenTrue} : ${whenFalse}`);
          expect(sections[1]?.namedChild(0)?.type).toBe('constant_pattern');
          expect(sections[2]?.namedChild(0)?.type).toBe('constant_pattern');
          expect(sections[3]?.namedChild(0)?.type).toBe('declaration_pattern');
        } finally {
          tree.delete();
        }
      }
    }
    const source = 'switch (value) { case A + B ? [1] : [2]: break; }';
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError, source).toBe(false);
      const conditional = tree.rootNode.descendantsOfType('conditional_expression')[0];
      expect(conditional?.childForFieldName('condition')?.text).toBe('A + B');
      expect(conditional?.childForFieldName('consequence')?.text).toBe('[1]');
      expect(conditional?.childForFieldName('alternative')?.text).toBe('[2]');
    } finally {
      tree.delete();
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
    for (const inner of ['1', '1 + 2', '1 | 2', 'null', 'A.B', 'int.MaxValue']) {
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
              tree.rootNode.descendantsOfType('constant_pattern').map((node) => node.text.replaceAll(/^\(+|\)+$/g, '')),
              source
            ).toEqual([inner]);
            expect(
              tree.rootNode.descendantsOfType(['constant_pattern', 'parenthesized_pattern']).map((node) => node.text),
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

test('preserves parenthesized qualified switch constant boundaries and captures', () => {
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
        const parsed = tree.rootNode.descendantsOfType('switch_section')[0]?.namedChild(0);
        expect(['constant_pattern', 'parenthesized_pattern'], source).toContain(parsed?.type);
        expect(parsed?.text, source).toBe(pattern);
        expect(tree.rootNode.descendantsOfType('positional_pattern_clause'), source).toHaveLength(0);
        expect(
          tree.rootNode.descendantsOfType('constant_pattern').map((node) => node.text.replaceAll(/^\(+|\)+$/g, ''))
        ).toEqual(['A.B']);
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
  try {
    for (const constant of [
      '"hello".Length',
      'nameof(C).Length',
      '$"hello{value}".Length',
      'new C().Member().Next!',
      'A.B!(1, 2)',
      'nameof(C)!',
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
        } finally {
          tree.delete();
        }
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
  const query = new Query(language, '(expression) @expression');
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

test('accepts contextual identifiers before a qualified positional pattern name', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const name of [
      'nameof.C',
      'var.C',
      'nameof.A.B',
      'var.A.B',
      'nameof.C<T>',
      'var.C<T>',
      'global::nameof.C',
      'global::var.C',
    ]) {
      const pattern = `${name}(var item)`;
      for (const source of [
        `var result = value is ${pattern};`,
        `var result = value is ${pattern} && ready;`,
        `var result = value is not ${pattern};`,
        `var result = value is { P: ${pattern} };`,
        `var result = value is [${pattern}];`,
        `var result = value switch { ${pattern} => 1, _ => 2 };`,
      ]) {
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const parsed = tree.rootNode.descendantsOfType('recursive_pattern').find((node) => node.text === pattern)!;
          expect(parsed.childForFieldName('type')?.text, source).toBe(name);
          expect(
            parsed.descendantsOfType('positional_pattern_clause').map((node) => node.text),
            source
          ).toEqual(['(var item)']);
          expect(parsed.descendantsOfType('invocation_expression'), source).toHaveLength(0);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('distinguishes contextual attribute targets from reserved keywords in collections', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const name of ['field', 'method', 'param', 'property', 'type', 'typevar']) {
      for (const source of [`var values = [${name}];`, `[${name}: Marker] class C { }`]) {
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          if (source.startsWith('var')) {
            expect(tree.rootNode.descendantsOfType('collection_expression')[0]?.namedChild(0)?.text, source).toBe(name);
          } else {
            expect(tree.rootNode.descendantsOfType('attribute_target_specifier')[0]?.text, source).toBe(`${name}:`);
          }
        } finally {
          tree.delete();
        }
      }
    }
    for (const name of ['event', 'return']) {
      const source = `var values = [${name}];`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(true);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps name-shaped is types in later logical operands', () => {
  const parser = new Parser().setLanguage(language);
  const query = new Query(language, '(binary_expression right: (is_pattern_expression) @typeTest)');
  try {
    for (const operator of ['||', '&&']) {
      for (const name of ['C', 'C<T>', '@nameof']) {
        const source = `var result = x is null ${operator} x is ${name} ? x : null;`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          expect(
            query.captures(tree.rootNode).map(({ node }) => node.text),
            source
          ).toEqual([`x is ${name}`]);
          const conditional = tree.rootNode.descendantsOfType('conditional_expression')[0]!;
          expect(conditional.childForFieldName('condition')?.text, source).toBe(`x is null ${operator} x is ${name}`);
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

test('parses nested generic positional and parenthesized logical patterns', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const parameter of ['int item', 'var item']) {
      const source = `var result = value is Foo(A.Bar<T>(${parameter}, A.B)) matched;`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(
          tree.rootNode.descendantsOfType('recursive_pattern').map((node) => node.text),
          source
        ).toEqual([`Foo(A.Bar<T>(${parameter}, A.B)) matched`, `A.Bar<T>(${parameter}, A.B)`]);
        expect(
          tree.rootNode.descendantsOfType('constant_pattern').map((node) => node.text),
          source
        ).toEqual(['A.B']);
      } finally {
        tree.delete();
      }
    }
    for (const pattern of ['not (A.B or C.D)', 'not ((A.B or C.D))']) {
      const source = `var result = value is ${pattern};`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps parenthesized negated patterns inside is', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const pattern of ['(not A.B)', '((not A.B))', 'not (A.B or C.D)']) {
      const source = `var result = value is ${pattern};`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(tree.rootNode.descendantsOfType('is_pattern_expression')[0]?.text, source).toBe(`value is ${pattern}`);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps indexed receivers inside supported member constants', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const constant of ['a.b[0].c', 'a.b[0][1].c', 'global::A.B[0].C', 'a.b[0].Call()', 'a.b[0]!.c']) {
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
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps complete constants inside nested generic positional patterns', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const constant of [
      'A.B + 1',
      '1 + A.B',
      'A.B << 2',
      'A.B | C.D',
      'A.B && C.D',
      '(A.B) + 1',
      '(A.B + 1) << 2',
      'A.B!',
    ] as const) {
      for (const parameter of ['int item', 'var item']) {
        const source = `var result = value is Foo(A.Bar<T>(${parameter}, ${constant})) matched;`;
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
  } finally {
    parser.delete();
  }
});

test('preserves named singleton positional clauses', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const child of ['A.B', 'int item', 'var item']) {
      const pattern = `(Name: ${child})`;
      for (const source of [`var result = value is ${pattern};`, `var result = value is [${pattern}];`]) {
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const positional = tree.rootNode.descendantsOfType('positional_pattern_clause');
          expect(
            positional.map((node) => node.text),
            source
          ).toEqual([pattern]);
          expect(positional[0]?.namedChildCount, source).toBe(1);
          expect(positional[0]?.namedChild(0)?.type, source).toBe('subpattern');
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves complete alias-qualified is type tests', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const type of [
      'global::A.B[]',
      'global::A.B[][]',
      'global::A.B[,]',
      'global::A.B<int>[]',
      'global::A.B<T>[]',
      'global::A.B<T[]>[]',
      'global::A.B.C[]',
      'Foo::A.B[]',
      'global::A.B?',
      'System.Collections.Generic.List<global::A.B>[]',
    ]) {
      for (const suffix of ['', ' && ready', ' || ready']) {
        const source = `var result = value is ${type}${suffix};`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const tests = tree.rootNode.descendantsOfType('is_pattern_expression');
          expect(
            tests.map((node) => node.text),
            source
          ).toEqual([`value is ${type}`]);
          expect(tests[0]?.childForFieldName('pattern')?.childForFieldName('type')?.text, source).toBe(type);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps logical patterns inside nested generic positional patterns', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const pattern of ['A.B or C.D', 'A.B and C.D', 'A.B | 1 or C.D & 2', '(A.B | 1 or C.D & 2)'] as const) {
      for (const declaration of ['int item', 'var item']) {
        const source = `var result = value is Foo(A.Bar<T>(${declaration}, ${pattern})) matched;`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          expect(tree.rootNode.descendantsOfType('recursive_pattern')[0]?.text, source).toBe(
            `Foo(A.Bar<T>(${declaration}, ${pattern})) matched`
          );
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('distinguishes array type patterns from member and index constants', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const [pattern, kind, types, constants] of [
      ['not A.B[0]', 'negated_pattern', ['A.B[0]'], []],
      ['other or A.B[0]', 'or_pattern', ['A.B[0]'], ['other']],
      ['other and A.B[0]', 'and_pattern', ['A.B[0]'], ['other']],
      ['[A.B[0].Call()]', 'list_pattern', [], ['A.B[0].Call()']],
    ] as const) {
      const source = `var result = value is ${pattern};`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const parsed = tree.rootNode.descendantsOfType('is_pattern_expression')[0]?.childForFieldName('pattern');
        expect([parsed?.type, parsed?.text], source).toEqual([kind, pattern]);
        expect(
          parsed?.descendantsOfType('type_pattern').map((node) => [node.childForFieldName('type')?.type, node.text]),
          source
        ).toEqual(types.map((type) => ['array_type', type]));
        expect(
          parsed?.descendantsOfType('constant_pattern').map((node) => node.text),
          source
        ).toEqual(constants);
        if (kind === 'list_pattern') {
          const call = parsed?.descendantsOfType('invocation_expression')[0];
          expect(call?.text, source).toBe('A.B[0].Call()');
          const member = call?.childForFieldName('function');
          expect([member?.type, member?.childForFieldName('expression')?.text], source).toEqual([
            'member_access_expression',
            'A.B[0]',
          ]);
        }
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('retains designations after completed untyped positional patterns', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const [clause, declarations] of [
      [
        '(int item, string name)',
        [
          ['int', 'item'],
          ['string', 'name'],
        ],
      ],
      ['(int item, C)', [['int', 'item']]],
      ['(Name: int item, Other: C)', [['int', 'item']]],
      ['(Name: int item)', [['int', 'item']]],
      ['(A.B, C.D)', []],
      ['(A.B<T>, C.D<U>)', []],
    ] as const) {
      const pattern = `${clause} matched`;
      for (const source of [
        `var result = value is ${pattern};`,
        `var result = value is ${pattern} && ready;`,
        `var result = value is not ${pattern};`,
        `var result = value is (${pattern});`,
        `var result = value is Foo(${pattern});`,
        `var result = value is { P: ${pattern} };`,
        `var result = value is [${pattern}];`,
        `var result = value switch { ${pattern} => 1, _ => 2 };`,
        `switch (value) { case ${pattern}: break; }`,
      ]) {
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const parsed = tree.rootNode.descendantsOfType('recursive_pattern').find((node) => node.text === pattern)!;
          expect(parsed.childForFieldName('name')?.text, source).toBe('matched');
          expect(parsed.namedChildren.find((node) => node.type === 'positional_pattern_clause')?.text, source).toBe(
            clause
          );
          expect(
            parsed
              .descendantsOfType('declaration_pattern')
              .map((node) => [node.childForFieldName('type')?.text, node.childForFieldName('name')?.text]),
            source
          ).toEqual(declarations);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('parses unnamed positional patterns with complex constant children', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const value of [
      'this',
      'base',
      'a?.b',
      '*p',
      '&a',
      'new C()',
      'nameof(a)[0]',
      'a is b',
      'a switch { 1 => 2 }',
      'a->b[0]',
      'a[0]?.b',
      'this[0]',
      'base[0]',
    ]) {
      for (const tuple of [`(${value}, 1)`, `(1, ${value})`, `(${value}, 1, 2)`]) {
        const source = `var result = value is ${tuple};`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const positional = tree.rootNode.descendantsOfType('recursive_pattern').find((node) => node.text === tuple);
          expect(
            positional?.namedChildren.find((node) => node.type === 'positional_pattern_clause')?.text,
            source
          ).toBe(tuple);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves operator expressions and positional patterns in their pattern owners', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const [source, kind, pattern, childKind, childText] of [
      [
        'var r=x is (A.B is object);',
        'constant_pattern',
        '(A.B is object)',
        'parenthesized_expression',
        '(A.B is object)',
      ],
      [
        'switch(x){case A.B is object:break;}',
        'constant_pattern',
        'A.B is object',
        'is_pattern_expression',
        'A.B is object',
      ],
      [
        'switch(x){case (A.B switch {_=>1}):break;}',
        'constant_pattern',
        '(A.B switch {_=>1})',
        'parenthesized_expression',
        '(A.B switch {_=>1})',
      ],
      ['switch(x){case new C().M():break;}', 'constant_pattern', 'new C().M()', 'invocation_expression', 'new C().M()'],
      ['switch(x){case A.B[0]():break;}', 'recursive_pattern', 'A.B[0]()', 'array_type', 'A.B[0]'],
    ] as const) {
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const owner =
          tree.rootNode.descendantsOfType('switch_section')[0]?.namedChildren[0] ??
          tree.rootNode.descendantsOfType('is_pattern_expression')[0]?.childForFieldName('pattern');
        expect([owner?.type, owner?.text], source).toEqual([kind, pattern]);
        expect([owner?.namedChildren[0]?.type, owner?.namedChildren[0]?.text], source).toEqual([childKind, childText]);
        if (kind === 'recursive_pattern') {
          expect(owner?.childForFieldName('type')?.text, source).toBe('A.B[0]');
          expect(owner?.namedChildren.find((node) => node.type === 'positional_pattern_clause')?.text, source).toBe(
            '()'
          );
        }
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps completed primary postfixes and conditional calls inside is before lower operators', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const constant of [
      '42!',
      '"text"!',
      '$"text{value}"!',
      'default(int)!',
      'sizeof(int)!',
      'typeof(C)!',
      'A.B?.C()',
      'b?.c!',
      'b?.c.d',
      'b?.c()',
      'b?.c.d!',
      'A.B?.C?.D()',
    ]) {
      for (const suffix of [' && ready', ' || ready', ' == other', ' | mask']) {
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
          const binary = tree.rootNode.descendantsOfType('binary_expression')[0]!;
          expect(binary.childForFieldName('left')?.text, source).toBe(`value is ${constant}`);
          expect(binary.childForFieldName('right')?.text, source).toBe(suffix.trim().split(' ').at(-1));
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves mixed binary precedence in every full-constant pattern owner', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const [constant, operator, left, right] of [
      ['a + b == c', '==', 'a + b', 'c'],
      ['a * b < c', '<', 'a * b', 'c'],
      ['A.B + 1 ?? 2', '??', 'A.B + 1', '2'],
      ['a + b * c', '+', 'a', 'b * c'],
      ['a << b + c', '<<', 'a', 'b + c'],
    ]) {
      for (const source of [
        `switch (value) { case ${constant}: break; }`,
        `var result = value switch { ${constant} => 1, _ => 2 };`,
        `var result = value is { P: ${constant} };`,
        `var result = value is [${constant}];`,
        `var result = value is Foo(${constant});`,
        `var result = value is (${constant});`,
      ]) {
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const binary = tree.rootNode.descendantsOfType('binary_expression').find((node) => node.text === constant)!;
          expect(binary.childForFieldName('operator')?.text, source).toBe(operator);
          expect(binary.childForFieldName('left')?.text, source).toBe(left);
          expect(binary.childForFieldName('right')?.text, source).toBe(right);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps bare slices in list patterns before guards and in nested owners', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const source of [
      'var r = x is [..];',
      'var r = x is [..] && done;',
      'var r = x is [..] || done;',
      'if (x is [..] && done) {}',
      'switch (x) { case [..] when ready: break; }',
      'var r = x switch { [..] when ready => 1, _ => 0 };',
      'var r = x is { Property: [..] };',
      'var r = x is Foo([..]) matched;',
      'var r = x is [[..]];',
      'var r = x is not [..];',
    ]) {
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(
          tree.rootNode.descendantsOfType('slice_pattern').map((node) => node.text),
          source
        ).toEqual(['..']);
        expect(
          tree.rootNode.descendantsOfType('list_pattern').some((node) => node.text === '[..]'),
          source
        ).toBe(true);
        const logical = tree.rootNode
          .descendantsOfType('binary_expression')
          .find((node) => ['&&', '||'].includes(node.childForFieldName('operator')?.text ?? ''));
        if (logical) expect(logical.childForFieldName('left')?.text, source).toBe('x is [..]');
      } finally {
        tree.delete();
      }
    }
    for (const [source, kind, text] of [
      ['var r = items[..];', 'range_expression', '..'],
      ['var r = [..items];', 'spread_element', '..items'],
    ] as const) {
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(
          tree.rootNode.descendantsOfType(kind).map((node) => node.text),
          source
        ).toEqual([text]);
        expect(tree.rootNode.descendantsOfType('slice_pattern'), source).toHaveLength(0);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps nested positional patterns distinct from parenthesized tuple constants', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const [pattern, parentheses] of [
      ['((1, 2))', ['((1, 2))']],
      ['(((1, 2)))', ['(((1, 2)))', '((1, 2))']],
    ] as const) {
      for (const source of [
        `var result = value is ${pattern};`,
        `var result = value is { Property: ${pattern} };`,
        `var result = value is [${pattern}];`,
      ]) {
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          expect(
            tree.rootNode.descendantsOfType('parenthesized_pattern').map((node) => node.text),
            source
          ).toEqual(parentheses);
          const positional = tree.rootNode.descendantsOfType('positional_pattern_clause');
          expect(
            positional.map((node) => node.text),
            source
          ).toEqual(['(1, 2)']);
          expect(
            positional[0]?.namedChildren.map((node) => [node.type, node.text]),
            source
          ).toEqual([
            ['subpattern', '1'],
            ['subpattern', '2'],
          ]);
          expect(
            tree.rootNode.descendantsOfType('constant_pattern').map((node) => node.text),
            source
          ).toEqual(['1', '2']);
          expect(tree.rootNode.descendantsOfType('tuple_expression'), source).toHaveLength(0);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps logical pattern operands inside list slices', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const [pattern, kind] of [
      ['Foo and string', 'and_pattern'],
      ['string or null', 'or_pattern'],
      ['> 1 and < 5', 'and_pattern'],
      ['not null', 'negated_pattern'],
      ['Foo or Bar and Baz', 'or_pattern'],
    ] as const) {
      for (const source of [
        `var result = value is [.. ${pattern}];`,
        `var result = value is [1, .. ${pattern}, 2];`,
        `var result = value switch { [.. ${pattern}] => 1, _ => 0 };`,
      ]) {
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const slice = tree.rootNode.descendantsOfType('slice_pattern')[0]!;
          expect(slice.text).toBe(`.. ${pattern}`);
          expect(slice.parent!.type).toBe('list_pattern');
          expect(slice.firstNamedChild!.type).toBe(kind);
          expect(slice.firstNamedChild!.text).toBe(pattern);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('retains positional subpatterns before a property clause', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const [elements, kind] of [
      ['a', 'constant_pattern'],
      ['int', 'type_pattern'],
      ['A a', 'declaration_pattern'],
      ['a, b', 'constant_pattern'],
      ['int, int', 'type_pattern'],
      ['A a, B b', 'declaration_pattern'],
    ] as const) {
      for (const property of ['{}', '{ c: 1 }']) {
        const pattern = `(${elements}) ${property}`;
        for (const source of [
          `var r = x is ${pattern};`,
          `var r = x is ${pattern} value;`,
          `var r = x is not ${pattern};`,
          `var r = x is (${pattern});`,
          `var r = x is ${pattern} or (d, e);`,
          `if (x is ${pattern}) {}`,
          `var r = x switch { ${pattern} => 1, _ => 2 };`,
          `switch (x) { case ${pattern}: break; }`,
        ]) {
          const tree = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, source).toBe(false);
            const recursive = tree.rootNode.descendantsOfType('recursive_pattern')[0]!;
            expect(recursive.childForFieldName('type'), source).toBeNull();
            const positional = recursive.namedChildren.find((node) => node.type === 'positional_pattern_clause')!;
            expect(positional?.text, source).toBe(`(${elements})`);
            expect(
              positional.namedChildren.map((node) => node.namedChildren[0]?.type),
              source
            ).toEqual(elements.split(', ').map(() => kind));
            expect(
              positional.namedChildren.map((node) => node.text),
              source
            ).toEqual(elements.split(', '));
            expect(recursive.namedChildren.find((node) => node.type === 'property_pattern_clause')?.text, source).toBe(
              property
            );
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

test('keeps sized-index arithmetic inside is constant patterns', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const operand of ['a[0]', 'a[i]', 'a[b[0]]', 'a[0][1]', 'A.B[0]', 'T[1, 2]']) {
      for (const operator of ['+', '-', '*', '/', '%', '<<']) {
        const pattern = `${operand} ${operator} 1`;
        const source = `class C { void M() { var r = x is ${pattern}; } }`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const owner = tree.rootNode.descendantsOfType('is_pattern_expression')[0]!;
          expect(owner.childForFieldName('pattern')?.text, source).toBe(pattern);
          expect(owner.childForFieldName('pattern')?.type, source).toBe('constant_pattern');
        } finally {
          tree.delete();
        }
      }
    }
    for (const operator of ['>>', '>>>', '&', '|', '^', '==', '&&', '??']) {
      const source = `class C { void M() { var r = x is a[0] ${operator} y; } }`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(tree.rootNode.descendantsOfType('is_pattern_expression')[0]?.text, source).toBe('x is a[0]');
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('retains await as a contextual type name in nonasync positional patterns', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const pattern of ['(await T)', '(await T, 1)', '(await T, 1, 2)', 'not (await T, 1)']) {
      const source = `class C { void M() { var r = x is ${pattern}; } }`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(
          tree.rootNode.descendantsOfType('declaration_pattern').map((node) => node.text),
          source
        ).toContain('await T');
        expect(tree.rootNode.descendantsOfType('await_expression'), source).toHaveLength(0);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});
