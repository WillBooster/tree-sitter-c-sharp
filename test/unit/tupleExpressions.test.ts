import { Language, Parser, Query, type Tree } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

let language: Language;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load('tree-sitter-c_sharp.wasm');
});

test('preserves tuple products as expressions in typed deconstruction', () => {
  const parser = new Parser();
  let query: Query | undefined;
  let tree: Tree | undefined;
  const source = `using System.Collections.Generic;
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
(generic_name) @generic`
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
    const divided = parser.parse(source.replace('*', '/'))!;
    try {
      expect(divided.rootNode.hasError).toBe(false);
    } finally {
      divided.delete();
    }
  } finally {
    tree?.delete();
    query?.delete();
    parser.delete();
  }
});
