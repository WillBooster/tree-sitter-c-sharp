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

test('preserves callable and operator ranges while editing and undoing generic-shaped expressions', () => {
  const query = new Query(language, '(generic_name) @generic\n(binary_expression operator: _ @operator)');
  let previous: Tree | undefined;
  let old = '';
  try {
    for (const expression of ['A<X>>B', 'F<int>(B)', 'A<X>+B', 'F<int>(B)', 'A<X>>B']) {
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
        ).toEqual(expression.startsWith('F') ? ['F<int>'] : []);
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
