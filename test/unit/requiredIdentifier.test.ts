import { Language, Parser } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('keeps required identifiers distinct from required member modifiers', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load('tree-sitter-c_sharp.wasm'));
  try {
    for (const member of [
      'int required; void M() { required = 1; Use(required); }',
      'void required(int value) {} void M() { required(1); }',
      'public required int required { get; init; } void M() { Use(required); }',
    ]) {
      const tree = parser.parse(`class C { ${member} } class Following {}`)!;
      try {
        expect(tree.rootNode.hasError, member).toBe(false);
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
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});
