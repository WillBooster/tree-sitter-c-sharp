import { Language, Parser, type Tree } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

import { editTree, syntaxSnapshot } from '../helpers/syntaxSnapshot';

test('keeps required identifiers distinct from required member modifiers through edits', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load('tree-sitter-c_sharp.wasm'));
  let source = '';
  let previous: Tree | undefined;
  try {
    for (const member of [
      'int required; void M() { required = 1; Use(required); }',
      'void required(int value) {} void M() { required(1); }',
      'public required int required { get; init; } void M() { Use(required); }',
      'int required; void M() { required = 1; Use(required); }',
    ]) {
      const next = `class C { ${member} } class Following {}`;
      if (previous) editTree(previous, source, next);
      const tree = parser.parse(next, previous)!;
      previous?.delete();
      previous = tree;
      source = next;
      const fresh = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, member).toBe(false);
        expect(syntaxSnapshot(tree.rootNode), member).toEqual(syntaxSnapshot(fresh.rootNode));
        expect(tree.rootNode.descendantsOfType('identifier').some((node) => node.text === 'required')).toBe(true);
        expect(tree.rootNode.descendantsOfType('invocation_expression')).toHaveLength(1);
        for (const property of tree.rootNode.descendantsOfType('property_declaration')) {
          expect(property.childForFieldName('name')?.text).toBe('required');
          expect(property.children.filter((node) => node.type === 'modifier').map((node) => node.text)).toContain(
            'required'
          );
        }
        expect(
          tree.rootNode.descendantsOfType('class_declaration').map((node) => node.childForFieldName('name')?.text)
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
