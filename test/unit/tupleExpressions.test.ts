import { Edit, Language, Parser, Query, type Node, type Tree } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('preserves tuple products as expressions while editing typed deconstruction', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c_sharp.wasm');
  const parser = new Parser();
  let query: Query | undefined;
  let tree: Tree | undefined;
  let source = 'class C { object M(int a, int b, int c) { (int x, int y) = (a*b, c); return (x*y, c); } }';
  try {
    parser.setLanguage(language);
    query = new Query(
      language,
      '(non_lvalue_expression/binary_expression left: (identifier) @left right: (identifier) @right) @product'
    );
    tree = parser.parse(source)!;
    expect(tree.rootNode.hasError).toBe(false);
    expect(
      query
        .captures(tree.rootNode)
        .filter(({ name }) => name === 'product')
        .map(({ node }) => node.text)
    ).toEqual(['a*b', 'x*y']);
    expect(tree.rootNode.descendantsOfType('declaration_expression').map((node) => node.text)).toEqual([
      'int x',
      'int y',
    ]);
    const offset = source.indexOf('*');
    for (const operator of ['/', '*']) {
      const next = source.slice(0, offset) + operator + source.slice(offset + 1);
      tree.edit(
        new Edit({
          startIndex: offset,
          oldEndIndex: offset + 1,
          newEndIndex: offset + 1,
          startPosition: { row: 0, column: offset },
          oldEndPosition: { row: 0, column: offset + 1 },
          newEndPosition: { row: 0, column: offset + 1 },
        })
      );
      const previous: Tree = tree;
      tree = parser.parse(next, previous)!;
      previous.delete();
      const fresh = parser.parse(next)!;
      try {
        expect(snapshot(tree.rootNode)).toEqual(snapshot(fresh.rootNode));
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

function snapshot(node: Node): unknown {
  return [
    node.type,
    node.isNamed,
    node.isMissing,
    node.startIndex,
    node.endIndex,
    node.startPosition,
    node.endPosition,
    node.children.map((_, index) => node.fieldNameForChild(index)),
    node.children.map(snapshot),
  ];
}
