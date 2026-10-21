import { Language, Parser, type Tree } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

import { editTree, syntaxSnapshot } from '../helpers/syntaxSnapshot';

test('retains interpolation expressions beside escaped literal braces through edits', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load('tree-sitter-c_sharp.wasm'));
  try {
    for (const prefix of ['$"', '$@"', '@$"']) {
      let source = '';
      let previous: Tree | undefined;
      try {
        for (const pairs of [1, 0, 2, 3, 16, 1]) {
          const next = `class C { string Value = ${prefix}${'{{'.repeat(pairs)}{F("x")}${'}}'.repeat(pairs)}"; } class Following {}`;
          if (previous) editTree(previous, source, next);
          const tree = parser.parse(next, previous)!;
          previous?.delete();
          previous = tree;
          source = next;
          const fresh = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, source).toBe(false);
            expect(syntaxSnapshot(tree.rootNode), source).toEqual(syntaxSnapshot(fresh.rootNode));
            expect(
              tree.rootNode.descendantsOfType('interpolation').map((node) => node.text),
              source
            ).toEqual(['{F("x")}']);
            expect(
              tree.rootNode.descendantsOfType('class_declaration').map((node) => node.childForFieldName('name')?.text),
              source
            ).toEqual(['C', 'Following']);
          } finally {
            fresh.delete();
          }
        }
      } finally {
        previous?.delete();
      }
    }
  } finally {
    parser.delete();
  }
});
