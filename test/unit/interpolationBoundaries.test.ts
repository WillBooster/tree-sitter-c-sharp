import { Language, Parser } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

import { editTree, syntaxSnapshot } from '../helpers/syntaxSnapshot';

let language: Language;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load('tree-sitter-c_sharp.wasm');
});

const interpolate = [
  (hole: string) => `$"{${hole}}"`,
  (hole: string) => `$@"{${hole}}"`,
  (hole: string) => `$"""{${hole}}"""`,
  (hole: string) => `$$"""{{${hole}}}"""`,
];

test('keeps interpolation format text outside access and nullable expressions', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const expression of [
      'a?[0]',
      'a?[.5]',
      'a?[..5]',
      ...[
        '^1',
        '(0)',
        '-1',
        '!x',
        'b?[0]',
        'x as int?',
        'typeof(T?)',
        'typeof(T)',
        'sizeof(int)',
        'checked(0)',
        'unchecked(0)',
        'delegate { return 1; }',
        'int.MaxValue',
        'x += 1',
        'default',
        'nameof',
        'from',
        'with',
        'nint',
        'nuint',
        'x is int',
        'x as string',
        'M<T?>()',
        'M<T?, U>()',
        '(T?)x',
        'new T()',
        'new()',
        'f()',
        '() => 0',
        '(int x) => x',
        '[]',
        '*p',
        '&a',
      ].map((index) => `a?[${index}]`),
      ...[
        String.raw`'a'`,
        String.raw`'\n'`,
        String.raw`'\e'`,
        String.raw`'\u0061'`,
        String.raw`'\x61'`,
        String.raw`'\U00000061'`,
        String.raw`'\''`,
        String.raw`\u0061`,
      ].map((index) => `a?[${index}]`),
      'a?.b?[0]',
      'a?[c ? 0 : 1]',
      'x is T?[]',
      'a as T?[]',
      'x as T?[0]',
      'x as T?[c ? 0 : 1]',
      'a?[0]?.b',
      'a?[0]?[1]',
    ]) {
      for (const format of ['?foo', '??=', '[]', 'C:D']) {
        for (const wrap of interpolate) {
          const source = `var r = ${wrap(`${expression}:${format}`)};`;
          const tree = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, source).toBe(false);
            const hole = tree.rootNode.descendantsOfType('interpolation')[0]!;
            expect(hole.namedChildren[1]?.text, source).toBe(expression);
            expect(
              hole.descendantsOfType('interpolation_format_clause').map((node) => node.text),
              source
            ).toEqual([`:${format}`]);
            expect(
              hole.descendantsOfType('conditional_expression').map((node) => node.text),
              source
            ).toEqual(expression.includes('c ?') ? ['c ? 0 : 1'] : []);
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

test('preserves nested expressions and multiple interpolation holes', () => {
  const parser = new Parser().setLanguage(language);
  const nested = 'x is a?.b ? [] : a is U?[] ? [a] : b';
  try {
    for (const wrap of interpolate) {
      for (const expression of [
        `(${nested})`,
        'f($"{a?[0]}")?[0]',
        'a?[f("?:", 0)]',
        'a?[b?[0] ?? 1]',
        'a?[0] + f($"{(c ? [1] : [2])}")?[1]',
        'f(() => { var y = a?[0]; return 1; })?[2]',
        'a?[f(() => { return 0; })]',
        'f(() => { int? y = 1; return b; })?[2]',
        'f(() => { if (a?[0] == 1) { } return b; })?[2]',
      ]) {
        const source = `var r = ${wrap(`${expression},10:?foo`)} + ${wrap('a?[0]?[1]:C:D')};`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const holes = tree.rootNode.descendantsOfType('interpolation');
          expect(holes[0]!.namedChildren[1]?.text, source).toBe(expression);
          expect(holes[0]!.namedChildren.find((node) => node.type === 'interpolation_alignment_clause')?.text).toBe(
            ',10'
          );
          expect(
            tree.rootNode.descendantsOfType('interpolation_format_clause').map((node) => node.text),
            source
          ).toEqual([':?foo', ':C:D']);
          expect(
            tree.rootNode.descendantsOfType('conditional_expression').map((node) => node.text),
            source
          ).toEqual(
            expression.startsWith('(x is')
              ? [nested, 'a is U?[] ? [a] : b']
              : expression.includes('(c ?')
                ? ['c ? [1] : [2]']
                : []
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

test('keeps incremental interpolation boundaries consistent through nested and incomplete edits', () => {
  const parser = new Parser().setLanguage(language);
  const sources = [
    'var r = $"{a?[0]:?foo}";',
    'var r = $"{a?[0] + global::N.F(b?[1])?[2]:?foo}";',
    'var r = $"{(a?[0] + global::N.F(b?[1])?[2]):?foo}";',
    'var r = $"{f(() => { var y = a?[0]; return 1; })?[2]:?x}";',
    'var r = $"{(c ? a?[0] : b?[1]):?foo}";',
    'var r = $"{(c ? a?[0] : b?[1]),10:??=}";',
    'var r = $"{(c ? a?[0] : ):??=}";',
    'var r = $"{f($"{a?[0]}")?[0]:?foo}";',
    'var r = $"{(f(a?[0], x is null) ? f($"{a?[0]}")?[0] : b):X}";',
    'var r = $"{(f(a?[0], x is null) ? f($"{x as int?:?foo}")?[0] : b):X}";',
    'var r = $"{(f(a?[0], x is null) ? f(() => { return a?[0]; })?[0] : b):X}";',
    `var r = $"{(f(a?[0], x is null) ? f($"{x as int?:?foo}")${'?[0]'.repeat(16)} : b):X}";`,
    `var r = $"{(f(a?[0], x is null) ? f($"{x as int?:?foo}")${'?[0]'.repeat(15)}?[1] : b):X}";`,
    'var r = $"{a?[0] + f($"{(c ? [1] : [2])}")?[1]:?foo}";',
    'var r = $$"""{{a?[c ? 0 : 1]:??=}}""";',
    'var r = $$"""{{x is T?[]:C:D}} {{a?[0]:?foo}}""";',
  ].map((source) => `${source}\nclass Following { int Value => 1; }`);
  let previous = sources[0]!;
  let tree = parser.parse(previous)!;
  try {
    for (const source of [...sources.slice(1), ...sources.toReversed()]) {
      editTree(tree, previous, source);
      const incremental = parser.parse(source, tree)!;
      const fresh = parser.parse(source)!;
      try {
        expect(syntaxSnapshot(incremental.rootNode), source).toEqual(syntaxSnapshot(fresh.rootNode));
        expect(
          fresh.rootNode.descendantsOfType('class_declaration').map((node) => node.text),
          source
        ).toEqual(['class Following { int Value => 1; }']);
        if (!source.includes(': )')) expect(fresh.rootNode.hasError, source).toBe(false);
      } finally {
        tree.delete();
        tree = incremental;
        fresh.delete();
        previous = source;
      }
    }
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('preserves structural nesting when incremental edits exhaust optional proof storage', () => {
  const parser = new Parser().setLanguage(language);
  let previous = 'var r = a;';
  let tree = parser.parse(previous)!;
  try {
    for (const depth of [168, 169, 170, 171, 254, 255, 171, 170, 169]) {
      const hasAccessChain = depth < 170;
      const expression = hasAccessChain
        ? `(f(a?[0], x is null) ? f($"{x as int?:?foo}")${'?[0]'.repeat(16)} : b):X`
        : 'a';
      const source = `var r = ${'$"{'.repeat(depth)}${expression}${'}"'.repeat(depth)};`;
      editTree(tree, previous, source);
      const incremental = parser.parse(source, tree)!;
      const fresh = parser.parse(source)!;
      try {
        expect(fresh.rootNode.hasError, source).toBe(false);
        expect(incremental.rootNode.descendantsOfType('interpolated_string_expression')).toHaveLength(
          depth + Number(hasAccessChain)
        );
        expect(syntaxSnapshot(incremental.rootNode), source).toEqual(syntaxSnapshot(fresh.rootNode));
      } finally {
        tree.delete();
        tree = incremental;
        fresh.delete();
        previous = source;
      }
    }
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('recognizes a root colon before alias-shaped format text while preserving parenthesized aliases', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const wrap of interpolate) {
      for (const [expression, format] of [
        ['global', ':N.F(b?[1])?[2]:?foo'],
        ['a?[0] + global', ':N.F(b?[1])?[2]:?foo'],
        ['(a?[0] + global::N.F(b?[1])?[2])', '?foo'],
      ]) {
        const source = `var r = ${wrap(`${expression}:${format}`)};`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const hole = tree.rootNode.descendantsOfType('interpolation')[0]!;
          expect(hole.namedChildren[1]?.text, source).toBe(expression);
          expect(
            hole.descendantsOfType('interpolation_format_clause').map((node) => node.text),
            source
          ).toEqual([`:${format}`]);
          expect(hole.descendantsOfType('conditional_expression'), source).toHaveLength(0);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('recovers malformed interpolation holes without swallowing the following class', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const wrap of interpolate) {
      const sources = [
        'a?[0]:X',
        'x is T?[.),]:X',
        'x is T?[;{:-1',
        'a?[,,$"y"]',
        'a?[;{]:',
        'T?[]:-1',
        ...['!!}', '!! }', '!!,}', '!!}}', '!}'].map((index) => `x is T?[${index}:-1`),
        'x is T?[!!}:-1}',
        'x is T?[!!}:X',
        'x is T?[!!}:-1, b:?foo',
        'a?[!}:-1',
        String.raw`a?[1b,\u0061[]:X`,
        ...['typeof', 'sizeof', 'checked', 'unchecked', 'delegate', 'int', 'string', '+='].flatMap((index) =>
          ['X', '?foo'].map((format) => `a?[${index}]:${format}`)
        ),
        ...['{', '{|', ',{', 'stackalloc|{', 'new{'].flatMap((tail) =>
          ['X', '-1', '?foo'].flatMap((format) => ['a', 'x is T'].map((receiver) => `${receiver}?[;${tail}]:${format}`))
        ),
        ...['X', '-1', '?foo'].map((format) => `a?[,delegate)^{?[0]]:${format}`),
        ...['{.),], b:?foo', '{.),]]', '{.), b:?foo'].flatMap((tail) =>
          ['', ':X', ':-1', ':?foo'].map((format) => `x is T?[${tail}${format}`)
        ),
        ...[';{]', ';,{]', ';stackalloc|{]', '.),typeof,{]'].map((tail) => `x is T?[${tail}`),
        'a?[,{]',
        'x is int?[;|{+], b:?foo:X',
        'a?[;]:?foo',
        'a?[.]:?foo',
        ...['/', '<', '>', '|', '%', '?', "''", 'a ?'].map((index) => `a?[${index}]:X`),
        'x is T?[<]:C:D',
        ...['()', '(', '(()', 'new'].flatMap((index) =>
          ['X', '?foo', 'C:D', '-1'].map((format) => `a?[${index}]:${format}`)
        ),
        ...['(*', '(&'].flatMap((index) => ['X', '?foo', 'C:D'].map((format) => `a?[${index}]:${format}`)),
        ...["x is T?['], b:?foo", "x is T?['] , b:?foo"].flatMap((hole) =>
          [':X', ':?foo', ''].map((format) => hole + format)
        ),
        'x is T?[(^+^], b:?foo',
        'x is T?[=]:C:D',
        'x is T?[.]:C:D',
        'a?[0;]:?foo',
        'a?[(;)]:?foo',
        'a ? int:X',
        '0 ? int : true.b,-2:',
        'x is int ? a :X',
        'x is T?[]:C:D',
      ].map((hole) => `var r = ${wrap(hole)};\nclass Following { int Value => 1; }`);
      if (wrap === interpolate[0]) {
        for (const prefix of ['$@', '@$']) {
          for (const newline of ['\n', '\r\n']) {
            sources.push(`var r = ${prefix}"{x is T?[;{:}${newline}}${newline}class Following { int Value => 1; }`);
          }
        }
        sources.push(
          'var r = $"{x is T?[;|{+], b:?foo:X}";\nclass Following { int Value => 1; }',
          'var r = $@"{x is T?[;|{+], b:?foo:X}";\nclass Following { int Value => 1; }'
        );
        for (const newline of ['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029']) {
          for (const format of ['', ' ', String.raw`\t`]) {
            for (const trailing of ['', ' ', '\t', '\u00A0']) {
              sources.push(
                `var r = $"{f($"{a?[0]}")?[0]:${format}${newline}?foo}${trailing}${newline}class Following { int Value => 1; }`,
                `var r = $"{a?[0]:${format}${newline}?foo}${trailing}${newline}";${newline}class Following { int Value => 1; }`
              );
            }
          }
          for (const expression of ['a?[0]', 'f($"{a?[0]}")?[0]', 'f(() => { return a?[0]; })?[0]']) {
            sources.push(`var r = $"{${expression}:x${newline}?foo}";\nclass Following { int Value => 1; }`);
          }
        }
      }
      let previous = sources[0]!;
      let tree = parser.parse(previous)!;
      try {
        for (const source of [...sources.slice(1), ...sources.toReversed()]) {
          editTree(tree, previous, source);
          const incremental = parser.parse(source, tree)!;
          const fresh = parser.parse(source)!;
          try {
            expect(syntaxSnapshot(incremental.rootNode), source).toEqual(syntaxSnapshot(fresh.rootNode));
            expect(
              fresh.rootNode.descendantsOfType('class_declaration').map((node) => node.text),
              source
            ).toEqual(['class Following { int Value => 1; }']);
          } finally {
            tree.delete();
            tree = incremental;
            fresh.delete();
            previous = source;
          }
        }
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves outer conditional ownership across nested interpolation and lambda completion', () => {
  const parser = new Parser().setLanguage(language);
  const consequences = [
    '[A] () => x',
    '[A] (x) => x',
    'f(() => a?[0])?[0]',
    'f(() => { return a?[0]; })?[0]',
    ...interpolate.flatMap((inner) =>
      [
        'a?[0]',
        'x as int?',
        'x as int?:?foo',
        'f(() => { return a?[0]; })?[0]',
        'f(() => { T var = value; return var; })',
        'f(() => { (T first, U second) tuple = value; return tuple; })',
        'from T item in items select item',
        'x is var item',
      ].map((hole) => `f(${inner(hole)})?[0]`)
    ),
  ].flatMap((consequence) => [consequence, consequence + '?[0]'.repeat(15)]);
  try {
    for (const condition of ['f(a?[0], x is null)', 'f(a?[0], x is T)', 'f(a?[0], x as T)', 'f(a?[0], x is T?[])']) {
      for (const consequence of consequences) {
        for (const outer of interpolate) {
          const source = `var r = ${outer(`(${condition} ? ${consequence} : b):X`)};`;
          const tree = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, source).toBe(false);
            expect(
              tree.rootNode
                .descendantsOfType('conditional_expression')
                .map((node) =>
                  ['condition', 'consequence', 'alternative'].map((field) => node.childForFieldName(field)?.text)
                ),
              source
            ).toEqual([[condition, consequence, 'b']]);
            expect(
              tree.rootNode.descendantsOfType('interpolation_format_clause').map((node) => node.text),
              source
            ).toEqual(consequence.includes(':?foo') ? [':?foo', ':X'] : [':X']);
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
