import { Language, Parser } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('retains empty interpolated strings beside other content and delimiters', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load('tree-sitter-c_sharp.wasm'));
  try {
    for (const literal of ['$""', '$"text"', '$"{1}"', '$"""raw text"""', '$@""', '@$""', '$"{F($"")}"']) {
      const tree = parser.parse(`class C { string Value = ${literal}; string Neighbor = $"{1}"; } class Following {}`)!;
      try {
        expect(tree.rootNode.hasError, literal).toBe(false);
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
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});
