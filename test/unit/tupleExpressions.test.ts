import { Language, Parser, Query, type Tree } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

import { editTree, syntaxSnapshot } from '../helpers/syntaxSnapshot';

let language: Language;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load('tree-sitter-c_sharp.wasm');
});

test('preserves tuple products as expressions while editing typed deconstruction', () => {
  const parser = new Parser();
  let query: Query | undefined;
  let tree: Tree | undefined;
  let source = `using System.Collections.Generic;
class A {}
class C {
  object M(int a, int b, int c) {
    (int x, List<A> y) = (a, new List<A>());
    (List<A> r, int z) = (y, b);
    ((int, int) pair, List<List<int>> nested) = ((a, b), new List<List<int>>());
    (int u, int v) = (a*b, c);
    return (u*v, c);
  }
}`;
  try {
    parser.setLanguage(language);
    query = new Query(
      language,
      `(binary_expression left: (identifier) @left right: (identifier) @right) @product
(type/generic_name) @generic`
    );
    tree = parser.parse(source)!;
    expect(tree.rootNode.hasError).toBe(false);
    expect(
      query
        .captures(tree.rootNode)
        .filter(({ name }) => name === 'product')
        .map(({ node }) => node.text)
    ).toEqual(['a*b', 'u*v']);
    expect(tree.rootNode.descendantsOfType('declaration_expression').map((node) => node.text)).toEqual([
      'int x',
      'List<A> y',
      'List<A> r',
      'int z',
      '(int, int) pair',
      'List<List<int>> nested',
      'int u',
      'int v',
    ]);
    expect(
      query
        .captures(tree.rootNode)
        .filter(({ name, node }) => name === 'generic' && node.parent?.type === 'declaration_expression')
        .map(({ node }) => node.text)
    ).toEqual(['List<A>', 'List<A>', 'List<List<int>>']);
    const offset = source.indexOf('*');
    for (const operator of ['/', '*']) {
      const next = source.slice(0, offset) + operator + source.slice(offset + 1);
      editTree(tree, source, next);
      const previous: Tree = tree;
      tree = parser.parse(next, previous)!;
      previous.delete();
      const fresh = parser.parse(next)!;
      try {
        expect(syntaxSnapshot(tree.rootNode)).toEqual(syntaxSnapshot(fresh.rootNode));
        expect(
          query.captures(tree.rootNode).map(({ name, node }) => [name, node.text, node.startIndex, node.endIndex])
        ).toEqual(
          query.captures(fresh.rootNode).map(({ name, node }) => [name, node.text, node.startIndex, node.endIndex])
        );
        expect(tree.rootNode.hasError).toBe(false);
      } finally {
        fresh.delete();
      }
      source = next;
    }
  } finally {
    tree?.delete();
    query?.delete();
    parser.delete();
  }
});
