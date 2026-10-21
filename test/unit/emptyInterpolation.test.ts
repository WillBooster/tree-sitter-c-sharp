import { Language, Parser, type Tree } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

import { editTree, syntaxSnapshot } from '../helpers/syntaxSnapshot';

test('retains empty interpolated strings through content and delimiter edits', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load('tree-sitter-c_sharp.wasm'));
  let source = '';
  let previous: Tree | undefined;
  try {
    for (const literal of [
      '$""',
      '$"text"',
      '$"{1}"',
      '$"""raw text"""',
      '$""',
      '$@""',
      '@$""',
      '$"{F($"")}"',
      '$""',
    ]) {
      const next = `class C { string Value = ${literal}; string Neighbor = $"{1}"; } class Following {}`;
      if (previous) editTree(previous, source, next);
      const tree = parser.parse(next, previous)!;
      previous?.delete();
      previous = tree;
      source = next;
      const fresh = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, literal).toBe(false);
        expect(syntaxSnapshot(tree.rootNode), literal).toEqual(syntaxSnapshot(fresh.rootNode));
        const declarations = tree.rootNode.descendantsOfType('variable_declarator');
        expect(
          declarations.map((node) => node.descendantsOfType('interpolated_string_expression')[0]?.text),
          literal
        ).toEqual([literal, '$"{1}"']);
        expect(
          tree.rootNode.descendantsOfType('class_declaration').map((node) => node.childForFieldName('name')?.text),
          literal
        ).toEqual(['C', 'Following']);
      } finally {
        fresh.delete();
      }
    }
  } finally {
    previous?.delete();
    parser.delete();
  }
});
