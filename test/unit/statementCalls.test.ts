import { Language, Parser } from '@willbooster/web-tree-sitter';
import { afterAll, beforeAll, expect, test } from 'vitest';

let parser: Parser;

beforeAll(async () => {
  await Parser.init();
  parser = new Parser().setLanguage(await Language.load('tree-sitter-c_sharp.wasm'));
});

afterAll(() => parser.delete());

test('keeps calls with parenthesized arguments as expression statements', () => {
  for (const call of ['Foo((a))', 'Foo((a), (b))', 'Foo(a, (b))', 'Foo(((a)), b)', 'Foo<T>((a))', 'Foo((_))']) {
    for (const statement of [`${call};`, `await ${call};`, `if (ready) ${call};`]) {
      const source = `class C { void M() { ${statement} } }`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(
          tree.rootNode.descendantsOfType('invocation_expression').map((node) => node.text),
          source
        ).toEqual([call]);
        expect(tree.rootNode.descendantsOfType('expression_statement'), source).toHaveLength(1);
        expect(tree.rootNode.descendantsOfType('local_declaration_statement'), source).toHaveLength(0);
      } finally {
        tree.delete();
      }
    }
  }
});

test('reports a trailing comma in argument lists', () => {
  for (const call of ['Foo(a, b,);', 'new C(a,);', 'Foo(\n#if X\na\n#endif\n, b,);']) {
    const tree = parser.parse(`class C { void M() { ${call} } }`)!;
    try {
      expect(tree.rootNode.hasError, call).toBe(true);
    } finally {
      tree.delete();
    }
  }
});
