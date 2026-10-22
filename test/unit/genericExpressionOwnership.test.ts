import { Language, Parser, Query, type Tree } from '@willbooster/web-tree-sitter';
import { afterAll, beforeAll, expect, test } from 'vitest';

import { editTree, syntaxSnapshot } from '../helpers/syntaxSnapshot';

let language: Language;
let parser: Parser;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load('tree-sitter-c_sharp.wasm');
  parser = new Parser().setLanguage(language);
});

afterAll(() => parser.delete());

test('distinguishes generic-shaped relational and shift expressions by their following token', () => {
  for (const [expression, operator, left, right] of [
    ['A<X>>B', '<', 'A', 'X>>B'],
    ['A < X >> B', '<', 'A', 'X >> B'],
    ['α<β>>γ', '<', 'α', 'β>>γ'],
    ['@A<X>>@B', '<', '@A', 'X>>@B'],
    [String.raw`\u0041<X>>B`, '<', String.raw`\u0041`, 'X>>B'],
    ['A<X>+B', '>', 'A<X', '+B'],
    ['A<X>-B', '>', 'A<X', '-B'],
    ['A<X>*B', '>', 'A<X', '*B'],
  ]) {
    for (const source of [`var result=${expression};`, `class C { dynamic M()=>${expression}; }`]) {
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(tree.rootNode.descendantsOfType('generic_name'), source).toHaveLength(0);
        const binary = tree.rootNode.descendantsOfType('binary_expression')[0]!;
        expect(binary.text, source).toBe(expression);
        expect(binary.childForFieldName('operator')?.text, source).toBe(operator);
        expect(binary.childForFieldName('left')?.text, source).toBe(left);
        expect(binary.childForFieldName('right')?.text, source).toBe(right);
      } finally {
        tree.delete();
      }
    }
  }
});

test('preserves generic method headers, method groups, intrinsic operands, and ordinary type roles', () => {
  for (const source of [
    'class C { T F<T>(T value)=>value; int M()=>F<int>(1); }',
    'class A { public class B{} } class C { public class D{} static void F<T,U>(){} void M(){F<A.B,C.D>();C.F<A.B,C.D>();} }',
    'class C { static T F<T>(T value)=>value; object M(){var function=F<int>;return function;} }',
    'class C { string M()=>nameof(System.Collections.Generic.List<int>); }',
    'class C { int M()=>default(System.Func<int>)!(); }',
    'struct G<T>{} unsafe class C { int M()=>sizeof(G<int>); }',
    'class C { static T? F<T>() where T:class=>default; string? M()=>F<string>(); }',
    'class G<T>{} class C { G<int> M(){G<int> value=new();return value;} }',
    'class G<T>{} class C { bool M(object value)=>value is G<int> item; }',
    'class G<T>{} unsafe class C { delegate*<G<int>,G<int>> F; bool M(int value)=>value is >0; }',
  ]) {
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError, source).toBe(false);
      expect(tree.rootNode.descendantsOfType('generic_name').length, source).toBeGreaterThan(0);
    } finally {
      tree.delete();
    }
  }
});

test('retains definite generic method groups before suppression and coalescing', () => {
  for (const argument of ['int', 'T[]', 'T[,]', 'T?', 'int?']) {
    for (const expression of [`F<${argument}>!`, `F<${argument}> ?? G<${argument}>`]) {
      const source = `class C<T> { static void F<U>(){} object M()=>${expression}; }`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const generics = tree.rootNode.descendantsOfType('generic_name');
        expect(
          generics.map((node) => node.text),
          source
        ).toEqual(expression.includes('??') ? [`F<${argument}>`, `G<${argument}>`] : [`F<${argument}>`]);
        expect(generics[0]?.namedChildren[1]?.type, source).toBe('type_argument_list');
        if (expression.includes('??')) {
          const binary = tree.rootNode.descendantsOfType('binary_expression')[0]!;
          expect(binary.childForFieldName('left')?.text, source).toBe(`F<${argument}>`);
          expect(binary.childForFieldName('operator')?.text, source).toBe('??');
        } else {
          expect(tree.rootNode.descendantsOfType('postfix_unary_expression')[0]?.text, source).toBe(expression);
        }
      } finally {
        tree.delete();
      }
    }
  }
});

test('distinguishes nested generic arguments from comma-separated relational arguments', () => {
  for (const [expression, argumentCount, generic] of [
    ['F<G<T>,U>+B', 1, 'F<G<T>,U>'],
    ['F<G<int>,U>+B', 2, 'G<int>'],
    ['F<G<G<int>>,U>+B', 2, 'G<G<int>>'],
    ['F<A.G<T>,U>+B', 1, 'F<A.G<T>,U>'],
    ['F<global::A>+B', 1, undefined],
    ['F<global::G<T>,U>+B', 2, 'G<T>'],
    ['F<global::N.C.Value>+B', 1, undefined],
  ] as const) {
    const source = `class C { void M()=>Use(${expression}); }`;
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError, source).toBe(false);
      expect(tree.rootNode.descendantsOfType('argument_list')[0]?.namedChildCount, source).toBe(argumentCount);
      expect(tree.rootNode.descendantsOfType('generic_name')[0]?.text, source).toBe(generic);
    } finally {
      tree.delete();
    }
  }
  for (const expression of ['F<T>!', 'F<T> ?? fallback']) {
    const tree = parser.parse(`class C { object M()=>${expression}; }`)!;
    try {
      expect(tree.rootNode.hasError, expression).toBe(true);
    } finally {
      tree.delete();
    }
  }
});

test('retains range and adjacent-angle ownership after generic names', () => {
  for (const [expression, generics] of [
    ['F<T>..B', ['F<T>']],
    ['F<T> .. B', ['F<T>']],
    ['F<T>..', ['F<T>']],
    ['F<T>.1', []],
  ] as const) {
    const tree = parser.parse(`class C { object M()=>${expression}; }`)!;
    try {
      expect(tree.rootNode.hasError, expression).toBe(false);
      expect(
        tree.rootNode.descendantsOfType('generic_name').map((node) => node.text),
        expression
      ).toEqual(generics);
      if (generics.length > 0) {
        expect(tree.rootNode.descendantsOfType('range_expression')[0]?.namedChildren[0]?.text, expression).toBe('F<T>');
      }
    } finally {
      tree.delete();
    }
  }
  for (const operator of ['>', '>>', '>>>']) {
    for (const gap of ['', ' ']) {
      const expression = `F<G<T>,U>${gap}${operator}B`;
      const tree = parser.parse(`class C { void M()=>Use(${expression}); }`)!;
      try {
        expect(tree.rootNode.hasError, expression).toBe(false);
        expect(tree.rootNode.descendantsOfType('argument_list')[0]?.namedChildCount, expression).toBe(1);
        expect(
          tree.rootNode.descendantsOfType('generic_name').map((node) => node.text),
          expression
        ).toEqual(['F<G<T>,U>', 'G<T>']);
        const binary = tree.rootNode.descendantsOfType('binary_expression')[0]!;
        expect(binary.childForFieldName('operator')?.text, expression).toBe(operator);
        expect(binary.childForFieldName('left')?.text, expression).toBe('F<G<T>,U>');
      } finally {
        tree.delete();
      }
    }
  }
});

test('retains colon-leading interpolation formats after generic method groups', () => {
  for (const [start, end] of [
    ['$"{', '}"'],
    ['$@"{', '}"'],
    ['$"""{', '}"""'],
  ]) {
    for (const format of [':x', ':']) {
      const expression = `${start}F<T>:${format}${end}`;
      const tree = parser.parse(`class C<T>{static int F<U>()=>1;string M()=>${expression};}`)!;
      try {
        expect(tree.rootNode.hasError, expression).toBe(false);
        expect(tree.rootNode.descendantsOfType('generic_name')[0]?.text, expression).toBe('F<T>');
        expect(tree.rootNode.descendantsOfType('interpolation_format_clause')[0]?.text, expression).toBe(`:${format}`);
      } finally {
        tree.delete();
      }
    }
  }
});

test('preserves callable and operator ranges while editing and undoing generic-shaped expressions', () => {
  const query = new Query(
    language,
    '(generic_name) @generic\n(binary_expression operator: _ @operator)\n(type_argument_list (type) @argumentType)'
  );
  let previous: Tree | undefined;
  let old = '';
  try {
    for (const [expression, expectedGenerics, expectedArgumentTypes] of [
      ['A<X>>B', [], []],
      ['F<int>(B)', ['F<int>'], ['int']],
      ['F<int>!', ['F<int>'], ['int']],
      ['F<T>..B', ['F<T>'], ['T']],
      ['F<G<T>,U>>B', ['F<G<T>,U>', 'G<T>'], ['G<T>', 'T', 'U']],
      ['$"{F<T>::x}"', ['F<T>'], ['T']],
      ['F<T[]> ?? G<T[]>', ['F<T[]>', 'G<T[]>'], ['T[]', 'T[]']],
      ['F<global::N.C.Value>+B', [], []],
      ['global::A<X>+B', ['A<X>'], ['X']],
      ['A<X>+B', [], []],
      ['F<int>(B)', ['F<int>'], ['int']],
      ['A<X>>B', [], []],
    ] as const) {
      const source = `/* 😀 */ class C { T F<T>(T value)=>value; dynamic M(dynamic A,dynamic X,dynamic B)=>${expression}; } class Following {}`;
      if (previous) editTree(previous, old, source);
      const tree = parser.parse(source, previous)!;
      previous?.delete();
      previous = tree;
      old = source;
      const fresh = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(syntaxSnapshot(tree.rootNode), source).toEqual(syntaxSnapshot(fresh.rootNode));
        expect(
          tree.rootNode.descendantsOfType('class_declaration').map((node) => node.childForFieldName('name')?.text)
        ).toEqual(['C', 'Following']);
        const generic = query.captures(tree.rootNode).filter((capture) => capture.name === 'generic');
        expect(
          generic.map((capture) => capture.node.text),
          source
        ).toEqual(expectedGenerics);
        expect(
          query
            .captures(tree.rootNode)
            .filter((capture) => capture.name === 'argumentType')
            .map((capture) => capture.node.text),
          source
        ).toEqual(expectedArgumentTypes);
        for (const { node } of query.captures(tree.rootNode)) {
          expect(source.slice(node.startIndex, node.endIndex), source).toBe(node.text);
          expect(node.startIndex, source).toBeGreaterThanOrEqual(source.indexOf(expression));
        }
      } finally {
        fresh.delete();
      }
    }
  } finally {
    previous?.delete();
    query.delete();
  }
});
