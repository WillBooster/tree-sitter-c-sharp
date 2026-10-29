import { Language, Parser } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('retains interpolation expressions beside escaped literal braces', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load('tree-sitter-c_sharp.wasm'));
  try {
    for (const prefix of ['$"', '$@"', '@$"']) {
      for (const pairs of [0, 1, 2, 3, 16]) {
        const source = `class C { string Value = ${prefix}${'{{'.repeat(pairs)}{F("x")}${'}}'.repeat(pairs)}"; } class Following {}`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          expect(
            tree.rootNode.descendantsOfType('interpolation').map((node) => node.text),
            source
          ).toEqual(['{F("x")}']);
          expect(
            tree.rootNode.descendantsOfType('class_declaration').map((node) => node.childForFieldName('name')?.text),
            source
          ).toEqual(['C', 'Following']);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});
