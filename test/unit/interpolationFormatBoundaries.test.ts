import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { afterAll, beforeAll, expect, test } from 'vitest';

import { editTree, syntaxSnapshot } from '../helpers/syntaxSnapshot';

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

test.each(wrappers)('retains IS and coalescing operands before $name interpolation formats', ({ open, close }) => {
  const query = new Query(language, '(interpolation_format_clause) @format (conditional_expression) @conditional');
  let previous = 'var r = 0;';
  let tree = parser.parse(previous)!;
  try {
    for (const { expression, format } of [
      { expression: 'x is T?[] ?? y as T is T?[] t', format: ': c' },
      { expression: 'a is T?[] is U ?? c ? [1]', format: ': d :x' },
      { expression: 'f(a) is T?[]? || b?[i] as T?[]?[] is U ?? a ? [1]', format: ': c:X' },
      { expression: 'a is T?[] && a is T?[] ? c', format: ': b' },
    ]) {
      for (const parenthesized of [false, true, false]) {
        const source = `var r = ${open}${parenthesized ? `(${expression})` : expression}${format}${close};`;
        editTree(tree, previous, source);
        const incremental = parser.parse(source, tree)!;
        tree.delete();
        tree = incremental;
        previous = source;
        const fresh = parser.parse(source)!;
        try {
          expect(fresh.rootNode.hasError, source).toBe(false);
          expect(fresh.rootNode.descendantsOfType('conditional_expression'), source).toHaveLength(0);
          expect(
            query.captures(fresh.rootNode).map(({ name, node }) => [name, node.text, node.startIndex, node.endIndex]),
            source
          ).toEqual([['format', format, source.indexOf(format), source.indexOf(format) + format.length]]);
          expect(syntaxSnapshot(incremental.rootNode), source).toEqual(syntaxSnapshot(fresh.rootNode));
          expect(
            query.captures(incremental.rootNode).map(({ name, node }) => [name, syntaxSnapshot(node)]),
            source
          ).toEqual(query.captures(fresh.rootNode).map(({ name, node }) => [name, syntaxSnapshot(node)]));
        } finally {
          fresh.delete();
        }
      }
    }
  } finally {
    query.delete();
    tree.delete();
  }
});

test.each(wrappers)(
  'retains sized AS ranks and $name format boundaries across parentheses edits',
  ({ open, close }) => {
    const expression = 'a is T?[] || b as T ? [1] : c';
    const query = new Query(language, '(interpolation_format_clause) @format (conditional_expression) @conditional');
    let previous = 'var r = 0;';
    let tree = parser.parse(previous)!;
    try {
      for (const parenthesized of [false, true, false]) {
        const source = `var r = ${open}${parenthesized ? `(${expression})` : expression}${close};`;
        editTree(tree, previous, source);
        const incremental = parser.parse(source, tree)!;
        tree.delete();
        tree = incremental;
        previous = source;
        const fresh = parser.parse(source)!;
        try {
          expect(fresh.rootNode.hasError, source).toBe(false);
          expect(fresh.rootNode.descendantsOfType('conditional_expression'), source).toHaveLength(
            parenthesized ? 1 : 0
          );
          expect(
            fresh.rootNode.descendantsOfType('interpolation_format_clause').map((node) => node.text),
            source
          ).toEqual(parenthesized ? [] : [': c']);
          const formats = query.captures(fresh.rootNode).filter(({ name }) => name === 'format');
          expect(
            formats.map(({ node }) => [node.startIndex, node.endIndex]),
            source
          ).toEqual(parenthesized ? [] : [[source.indexOf(': c'), source.indexOf(': c') + 3]]);
          expect(syntaxSnapshot(incremental.rootNode), source).toEqual(syntaxSnapshot(fresh.rootNode));
          expect(
            query.captures(incremental.rootNode).map(({ name, node }) => [name, syntaxSnapshot(node)]),
            source
          ).toEqual(query.captures(fresh.rootNode).map(({ name, node }) => [name, syntaxSnapshot(node)]));
        } finally {
          fresh.delete();
        }
      }
    } finally {
      query.delete();
      tree.delete();
    }
  }
);

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
