import { readFileSync } from 'node:fs';

import { Edit, Language, Parser, Query, type Node, type Point, type Tree } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('retains raw interpolation expressions beside literal braces through edits', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load('tree-sitter-c_sharp.wasm'));
  const highlights = new Query(parser.language!, readFileSync('queries/highlights.scm', 'utf8'));
  try {
    for (const dollars of [2, 3, 4]) {
      for (const literalBraces of new Set([1, dollars - 1])) {
        let source = `var Longitude = 7;
var Latitude = 8;
var location = ${'$'.repeat(dollars)}"""
  You are at ${'{'.repeat(dollars + literalBraces)}Longitude${'}'.repeat(dollars)}, ${'{'.repeat(dollars)}Latitude${'}'.repeat(dollars + literalBraces)}
  """;`;
        let tree = parser.parse(source)!;
        try {
          check(tree);
          const start = source.indexOf('{');
          for (const [length, text] of [
            [literalBraces, ''],
            [0, '{'.repeat(literalBraces)],
          ] as const) {
            const next = source.slice(0, start) + text + source.slice(start + length);
            tree.edit(
              new Edit({
                startIndex: start,
                oldEndIndex: start + length,
                newEndIndex: start + text.length,
                startPosition: position(source, start),
                oldEndPosition: position(source, start + length),
                newEndPosition: position(next, start + text.length),
              })
            );
            const previous: Tree = tree;
            tree = parser.parse(next, previous)!;
            previous.delete();
            const fresh = parser.parse(next)!;
            try {
              expect(snapshot(tree.rootNode)).toEqual(snapshot(fresh.rootNode));
              expect(captures(tree)).toEqual(captures(fresh));
              check(tree);
            } finally {
              fresh.delete();
            }
            source = next;
          }
        } finally {
          tree.delete();
        }

        function check(current: Tree): void {
          expect(current.rootNode.hasError).toBe(false);
          const expressions = current.rootNode.descendantsOfType('interpolation');
          expect(expressions.map((node) => node.descendantsOfType('identifier').map((name) => name.text))).toEqual([
            ['Longitude'],
            ['Latitude'],
          ]);
          expect(
            expressions.flatMap((node) => node.descendantsOfType('interpolation_brace').map((brace) => brace.text))
          ).toEqual(['{'.repeat(dollars), '}'.repeat(dollars), '{'.repeat(dollars), '}'.repeat(dollars)]);
          expect(
            highlights
              .captures(current.rootNode)
              .filter(({ name, node }) => name === 'variable' && node.parent?.type === 'interpolation')
              .map(({ node }) => node.text)
          ).toEqual(['Longitude', 'Latitude']);
        }
      }
    }
  } finally {
    highlights.delete();
    parser.delete();
  }

  function captures(tree: Tree): unknown {
    return highlights
      .captures(tree.rootNode)
      .map(({ name, node }) => [name, node.type, node.text, node.startIndex, node.endIndex]);
  }
});

function position(source: string, index: number): Point {
  const lines = source.slice(0, index).split('\n');
  return { row: lines.length - 1, column: lines.at(-1)!.length };
}

function snapshot(node: Node): unknown {
  return [
    node.type,
    node.isNamed,
    node.isMissing,
    node.isExtra,
    node.hasError,
    node.startIndex,
    node.endIndex,
    node.startPosition,
    node.endPosition,
    node.children.map((_, index) => node.fieldNameForChild(index)),
    node.children.map(snapshot),
  ];
}
