import { Language, Parser } from '@willbooster/web-tree-sitter';
import { afterAll, beforeAll, expect, test } from 'vitest';

let parser: Parser;

const wrappers = [
  { name: 'regular', open: '$"{', close: '}"' },
  { name: 'verbatim', open: '$@"{', close: '}"' },
  { name: 'raw', open: '$"""{', close: '}"""' },
  { name: 'raw with two dollars', open: '$$"""{{', close: '}}"""' },
];

beforeAll(async () => {
  await Parser.init();
  parser = new Parser().setLanguage(await Language.load('tree-sitter-c_sharp.wasm'));
});

afterAll(() => parser.delete());

test.each(wrappers)('retains nullable declarations before $name interpolation formats', ({ open, close }) => {
  for (const type of ['T', 'int', 'List<int>']) {
    for (const format of [':X', ': b']) {
      const source = `var r = ${open}x is ${type} ? a ${format}${close};`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const hole = tree.rootNode.descendantsOfType('interpolation')[0];
        expect(hole?.descendantsOfType('is_pattern_expression')[0]?.text, source).toBe(`x is ${type} ? a`);
        const declaration = hole?.descendantsOfType('declaration_pattern')[0];
        expect(declaration?.childForFieldName('type')?.text, source).toBe(`${type} ?`);
        expect(declaration?.childForFieldName('name')?.text, source).toBe('a');
        expect(hole?.descendantsOfType('interpolation_format_clause')[0]?.text, source).toBe(format);
        expect(hole?.descendantsOfType('conditional_expression'), source).toHaveLength(0);
      } finally {
        tree.delete();
      }
    }
  }
});

test.each(wrappers)('retains nested conditional expressions in $name interpolation holes', ({ open, close }) => {
  for (const expression of ['(a ? b : c)', 'F(a ? b : c)']) {
    const source = `var r = ${open}${expression}:X${close};`;
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError, source).toBe(false);
      const hole = tree.rootNode.descendantsOfType('interpolation')[0];
      expect(hole?.descendantsOfType('conditional_expression')[0]?.text, source).toBe('a ? b : c');
      expect(hole?.descendantsOfType('interpolation_format_clause')[0]?.text, source).toBe(':X');
    } finally {
      tree.delete();
    }
  }
});
