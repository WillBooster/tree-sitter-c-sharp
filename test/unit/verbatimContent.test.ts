import { Language, Parser } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('preserves quote runs beside escaped braces and interpolation', async () => {
  await Parser.init();
  const parser = new Parser();
  parser.setLanguage(await Language.load('tree-sitter-c_sharp.wasm'));
  try {
    for (const prefix of ['$@', '@$']) {
      for (const pairs of [1, 2, 3, 8, 128, 256]) {
        const quotes = '"'.repeat(pairs * 2);
        for (const braces of ['{{z}}', '{p}']) {
          const source = `var value = ${prefix}"${quotes}${braces}${quotes}";`;
          const tree = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, source).toBe(false);
            const contents = tree.rootNode.descendantsOfType('string_content').map((node) => node.text);
            expect(contents, source).toEqual(braces === '{{z}}' ? [`${quotes}${braces}${quotes}`] : [quotes, quotes]);
            expect(tree.rootNode.descendantsOfType('interpolation_brace').map((node) => node.text)).toEqual(
              braces === '{{z}}' ? [] : ['{', '}']
            );
          } finally {
            tree.delete();
          }
        }
      }
    }
  } finally {
    parser.delete();
  }
});
