import { Language, Parser } from '@willbooster/web-tree-sitter';
import { afterAll, beforeAll, expect, test } from 'vitest';

let parser: Parser;

beforeAll(async () => {
  await Parser.init();
  parser = new Parser().setLanguage(await Language.load('tree-sitter-c_sharp.wasm'));
});

afterAll(() => parser.delete());

test('retains enclosing ternaries across questions and statements in nested lambda blocks', () => {
  for (const receiver of [
    'f(() => { return y?.z; })',
    'items.Select(i => { return i?.Name; }).ToArray()',
    'f(() => { g(y?.z); })',
    'f(() => { return y ? 1 : 2; })',
    'f(delegate { y?.z(); })',
    '(c is S ? a : (() => { y?.z(); }))',
    'f(() => { y?.z(); return a?.b; })',
    'f(() => { if (y?.z) { a?.b(); } return c; })',
    'f(() => { return 1; })',
    'f(() => y?.z)',
    'new[] { y?.z }',
  ]) {
    const expression = `x ? ${receiver}?[0] : w`;
    const tree = parser.parse(`var result = ${expression};`)!;
    try {
      expect(tree.rootNode.hasError, expression).toBe(false);
      const conditional = tree.rootNode.descendantsOfType('conditional_expression')[0];
      expect(conditional?.childForFieldName('condition')?.text, expression).toBe('x');
      expect(conditional?.childForFieldName('consequence')?.text, expression).toBe(`${receiver}?[0]`);
      expect(conditional?.childForFieldName('alternative')?.text, expression).toBe('w');
      const access = conditional?.childForFieldName('consequence');
      expect(access?.type, expression).toBe('conditional_access_expression');
      expect(access?.childForFieldName('condition')?.text, expression).toBe(receiver);
    } finally {
      tree.delete();
    }
  }
});

test('preserves saved question context around nested block statements', () => {
  for (const body of ['return y?.z;', 'g(y?.z); return a?.b;', 'return y ? 1 : 2;', 'return 1;']) {
    const source = `var result = x ? f(() => { ${body} })?[0] : w;`;
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError, source).toBe(false);
      const conditional = tree.rootNode.descendantsOfType('conditional_expression')[0];
      expect(conditional?.childForFieldName('condition')?.text, source).toBe('x');
      expect(conditional?.childForFieldName('consequence')?.text, source).toBe(`f(() => { ${body} })?[0]`);
      expect(conditional?.childForFieldName('alternative')?.text, source).toBe('w');
    } finally {
      tree.delete();
    }
  }
});
