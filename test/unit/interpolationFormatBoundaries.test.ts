import { Language, Parser } from '@willbooster/web-tree-sitter';
import { afterAll, beforeAll, expect, test } from 'vitest';

let language: Language;
let parser: Parser;

const wrappers = [
  { name: 'regular', open: '$"{', close: '}"' },
  { name: 'verbatim', open: '$@"{', close: '}"' },
  { name: 'raw', open: '$"""{', close: '}"""' },
  { name: 'raw with two dollars', open: '$$"""{{', close: '}}"""' },
];

beforeAll(async () => {
  await Parser.init();
  language = await Language.load('tree-sitter-c_sharp.wasm');
  parser = new Parser().setLanguage(language);
});

afterAll(() => parser.delete());

test('retains nullable cast ranks before interpolation format text', () => {
  const source =
    'class C { string M() { return $"{a is N.T?[] as T?[] ? [1] : f() is int?[] ? c : d as T?[]? ? b}"; } }';
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType('conditional_expression')).toHaveLength(0);
    expect(tree.rootNode.descendantsOfType('nullable_type').map((node) => [node.startIndex, node.endIndex])).toEqual([
      [38, 42],
      [48, 54],
      [48, 50],
    ]);
    expect(tree.rootNode.descendantsOfType('interpolation_format_clause').map((node) => node.text)).toEqual([
      ': f() is int?[] ? c : d as T?[]? ? b',
    ]);
  } finally {
    tree.delete();
  }
});

test('retains nullable logical type ranks before interpolation format text', () => {
  for (const sample of [
    {
      source: 'class C { string M() { return $"{a is T?[]? or T[] ? [] : d:x}"; } }',
      nullable: [
        [38, 43],
        [38, 40],
        [47, 52],
      ],
      format: [56, 61, ': d:x'],
    },
    {
      source: 'class C { string M() { return $"{a is T?[]? or T[,] ? [] : d:x}"; } }',
      nullable: [
        [38, 43],
        [38, 40],
        [47, 53],
      ],
      format: [57, 62, ': d:x'],
    },
    {
      source: 'class C { string M() { return $"{f() is T?[]? or T[] ? [] : d:x}"; } }',
      nullable: [
        [40, 45],
        [40, 42],
        [49, 54],
      ],
      format: [58, 63, ': d:x'],
    },
  ]) {
    const tree = parser.parse(sample.source)!;
    try {
      expect(tree.rootNode.hasError, sample.source).toBe(false);
      expect(tree.rootNode.descendantsOfType('conditional_expression'), sample.source).toHaveLength(0);
      expect(
        tree.rootNode.descendantsOfType('nullable_type').map((node) => [node.startIndex, node.endIndex]),
        sample.source
      ).toEqual(sample.nullable);
      expect(
        tree.rootNode
          .descendantsOfType('interpolation_format_clause')
          .map((node) => [node.startIndex, node.endIndex, node.text]),
        sample.source
      ).toEqual([sample.format]);
    } finally {
      tree.delete();
    }
  }
});

test.each(wrappers)('retains IS and coalescing operands before $name interpolation formats', ({ open, close }) => {
  for (const { expression, format, declaration } of [
    { expression: 'a is T?[] is T? || a ? [1]', format: ': a is N.T?[] or List<T?>' },
    { expression: 'x is T?[] ?? y as T is T?[] t', format: ': c' },
    { expression: 'a is T?[] is U ?? c ? [1]', format: ': d :x' },
    { expression: 'f(a) is T?[]? || b?[i] as T?[]?[] is U ?? a ? [1]', format: ': c:X' },
    { expression: 'a is T?[] && a is T?[] ? c', format: ': b', declaration: 'T?[] ? c' },
  ]) {
    for (const parenthesized of [false, true]) {
      const source = `var r = ${open}${parenthesized ? `(${expression})` : expression}${format}${close};`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(tree.rootNode.descendantsOfType('conditional_expression'), source).toHaveLength(0);
        expect(
          tree.rootNode.descendantsOfType('interpolation_format_clause').map((node) => node.text),
          source
        ).toEqual([format]);
        if (declaration) {
          const start = source.indexOf(declaration);
          expect(
            tree.rootNode
              .descendantsOfType('declaration_pattern')
              .map((node) => [
                node.text,
                node.startIndex,
                node.endIndex,
                node.childForFieldName('type')?.text,
                node.childForFieldName('name')?.text,
              ]),
            source
          ).toEqual([[declaration, start, start + declaration.length, 'T?[] ?', 'c']]);
        }
      } finally {
        tree.delete();
      }
    }
  }
});

test.each(wrappers)('retains sized AS ranks and $name format boundaries', ({ open, close }) => {
  const expression = 'a is T?[] || b as T ? [1] : c';
  for (const parenthesized of [false, true]) {
    const source = `var r = ${open}${parenthesized ? `(${expression})` : expression}${close};`;
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError, source).toBe(false);
      expect(tree.rootNode.descendantsOfType('conditional_expression'), source).toHaveLength(parenthesized ? 1 : 0);
      expect(
        tree.rootNode
          .descendantsOfType('interpolation_format_clause')
          .map((node) => [node.text, node.startIndex, node.endIndex]),
        source
      ).toEqual(parenthesized ? [] : [[': c', source.indexOf(': c'), source.indexOf(': c') + 3]]);
    } finally {
      tree.delete();
    }
  }
});

test.each(wrappers)('retains nullable declarations before $name interpolation formats', ({ open, close }) => {
  for (const type of ['T', 'int', 'List<int>']) {
    for (const format of [':X', ': b', ':?foo', ':??=']) {
      const source = `var r = ${open}x is ${type} ? a ${format}${close};`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const hole = tree.rootNode.descendantsOfType('interpolation')[0];
        expect(hole?.descendantsOfType('is_pattern_expression')[0]?.text, source).toBe(`x is ${type} ? a`);
        const declaration = hole?.descendantsOfType('declaration_pattern')[0];
        expect(declaration?.childForFieldName('type')?.text, source).toBe(`${type} ?`);
        expect(declaration?.childForFieldName('name')?.text, source).toBe('a');
        expect(hole?.descendantsOfType('interpolation_format_clause')[0]?.text, source).toBe(format);
        expect(hole?.descendantsOfType('conditional_expression'), source).toHaveLength(0);
      } finally {
        tree.delete();
      }
    }
  }
});

test.each(wrappers)('retains nullable lambda returns and $name interpolation formats', ({ open, close }) => {
  for (const { type, body, format } of [
    { type: 'a ?', body: 'k', format: ': c' },
    { type: 'a ?', body: 'k?[0]', format: ': c' },
    { type: 'a ?', body: 'f(a ? 1 : 2)', format: ': c' },
    { type: 'T?', body: 'k', format: ': 5' },
    { type: 'T ?', body: 'k', format: ': (k) => k' },
  ]) {
    const source = `var r = ${open}${type} (k) => ${body} ${format}${close};`;
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError, source).toBe(false);
      const lambdas = tree.rootNode.descendantsOfType('lambda_expression');
      expect(lambdas, source).toHaveLength(1);
      expect(lambdas[0]?.childForFieldName('type')?.type, source).toBe('nullable_type');
      expect(lambdas[0]?.childForFieldName('type')?.text, source).toBe(type);
      expect(lambdas[0]?.childForFieldName('parameters')?.text, source).toBe('(k)');
      expect(lambdas[0]?.childForFieldName('body')?.text, source).toBe(body);
      const formats = tree.rootNode.descendantsOfType('interpolation_format_clause');
      expect(formats, source).toHaveLength(1);
      expect(formats[0]?.text, source).toBe(format);
    } finally {
      tree.delete();
    }
  }
});

test.each(wrappers)('retains nested conditional expressions in $name interpolation holes', ({ open, close }) => {
  for (const expression of ['(a ? b : c)', 'F(a ? b : c)']) {
    const source = `var r = ${open}${expression}:X${close};`;
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError, source).toBe(false);
      const hole = tree.rootNode.descendantsOfType('interpolation')[0];
      expect(hole?.descendantsOfType('conditional_expression')[0]?.text, source).toBe('a ? b : c');
      expect(hole?.descendantsOfType('interpolation_format_clause')[0]?.text, source).toBe(':X');
    } finally {
      tree.delete();
    }
  }
});

test.each(wrappers)('retains conditional element access before $name interpolation formats', ({ open, close }) => {
  for (const expression of ['a?[0]', 'a?[0]?[1]', 'a?.b?[0]', '(a?[0])', 'F(a?[0])']) {
    for (const format of [':C', ':N0', ':=>', ':??=', ':+1', ':!', ':.x', ':&&y', ':[1]', ':is']) {
      const source = `var r = ${open}${expression}${format}${close};`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const hole = tree.rootNode.descendantsOfType('interpolation')[0];
        expect(
          hole?.namedChildren.map((node) => node.text),
          source
        ).toContain(expression);
        expect(hole?.descendantsOfType('conditional_access_expression').length, source).toBeGreaterThan(0);
        expect(hole?.descendantsOfType('conditional_expression'), source).toHaveLength(0);
        expect(hole?.descendantsOfType('interpolation_format_clause')[0]?.text, source).toBe(format);
      } finally {
        tree.delete();
      }
    }
  }
});

test.each(wrappers)('preserves nested empty-collection ternaries in $name interpolation holes', ({ open, close }) => {
  for (const condition of ['x is T', 'x is a?.b']) {
    const expression = `(${condition} ? [] : a is U?[] ? [a] : b)`;
    for (const suffix of ['', ':C', ',10:C']) {
      const source = `var r = ${open}${expression}${suffix}${close};`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(
          tree.rootNode
            .descendantsOfType('conditional_expression')
            .map((node) => [node.childForFieldName('condition')?.text, node.childForFieldName('consequence')?.text]),
          source
        ).toEqual([
          [condition, '[]'],
          ['a is U?[]', '[a]'],
        ]);
      } finally {
        tree.delete();
      }
    }
  }
});

test.each(wrappers)('preserves nullable ownership around deeply nested $name interpolations', ({ open, close }) => {
  const nested = open.repeat(100) + '1' + close.repeat(100);
  const source = `var r = x is T?[] ? ${nested} : a is U?[] ? [a] : b;`;
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(
      tree.rootNode.descendantsOfType('conditional_expression').map((node) => node.childForFieldName('condition')?.text)
    ).toEqual(['x is T?[]', 'a is U?[]']);
  } finally {
    tree.delete();
  }
});

test('rejects unparenthesized scalar conditionals before interpolation formats', () => {
  for (const source of [
    'class C{void M(){var r = $"{a is T?[]? is U ? [1] : y: y:X}";}}',
    'class C{void M(){var r = $"{a is T?[]? is U ? [1] : y: X:Y}";}}',
  ]) {
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError, source).toBe(true);
    } finally {
      tree.delete();
    }
  }
});

test('keeps nested collection conditionals before a later root nullable format', () => {
  const source = 'class C{void M(){var r = $"{f(a is U ? [1] : y) + a as T?[]:X}";}}';
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(
      tree.rootNode.descendantsOfType('conditional_expression').map((node) =>
        ['condition', 'consequence', 'alternative'].map((field) => {
          const child = node.childForFieldName(field)!;
          return [child.startIndex, child.endIndex];
        })
      )
    ).toEqual([
      [
        [30, 36],
        [39, 42],
        [45, 46],
      ],
    ]);
    expect(
      tree.rootNode
        .descendantsOfType('interpolation_format_clause')
        .map((node) => [node.text, node.startIndex, node.endIndex])
    ).toEqual([[':X', 59, 61]]);
  } finally {
    tree.delete();
  }
});

test('retains nullable array designations before a format containing a colon', () => {
  for (const [type, source] of [
    ['int?[] ?', 'class C { void M(object a, bool x) { var r = $"{a is not int?[] ? x : 1:X}"; } }'],
    ['int?[]?', 'class C { void M(object a, bool x) { var r = $"{a is not int?[]? x : 1:X}"; } }'],
    ['A.B?[] ?', 'class C { void M(object a, bool x) { var r = $"{a is not A.B?[] ? x : 1:X}"; } }'],
    ['List<int>?[] ?', 'class C { void M(object a, bool x) { var r = $"{a is not List<int>?[] ? x : 1:X}"; } }'],

    ['int?[] ?', 'class C { void M(object a, bool x) { var r = $"{a is int?[] ? x : 1:X}"; } }'],
    ['int?[]?', 'class C { void M(object a, bool x) { var r = $"{a is int?[]? x : 1:X}"; } }'],
  ]) {
    const tree = parser.parse(source!)!;
    try {
      expect(tree.rootNode.hasError, source).toBe(false);
      const declaration = tree.rootNode.descendantsOfType('declaration_pattern')[0];
      expect(declaration?.childForFieldName('type')?.text, source).toBe(type);
      expect(declaration?.childForFieldName('name')?.text, source).toBe('x');
      expect(tree.rootNode.descendantsOfType('interpolation_format_clause')[0]?.text, source).toBe(': 1:X');
      expect(tree.rootNode.descendantsOfType('conditional_expression'), source).toHaveLength(0);
    } finally {
      tree.delete();
    }
  }
});
