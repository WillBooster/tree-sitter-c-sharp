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

test('retains generic-shaped literal content after generic declarations', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load('tree-sitter-c_sharp.wasm'));
  try {
    for (const literal of ['"x<Int32>(42)"', '@"x<Int32>(42)"', '"""x<Int32>(42)"""', '$"x<Int32>(42)"']) {
      const source = `class C { public void G<T>(T arg) { CheckNames(${literal}, "y", 3); } }`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(
          tree.rootNode
            .descendantsOfType('invocation_expression')
            .map((node) => node.childForFieldName('function')?.text),
          source
        ).toEqual(['CheckNames']);
        expect(
          tree.rootNode
            .descendantsOfType([
              'string_literal',
              'verbatim_string_literal',
              'raw_string_literal',
              'interpolated_string_expression',
            ])
            .some((node) => node.text === literal),
          source
        ).toBe(true);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});
