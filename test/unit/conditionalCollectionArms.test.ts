import { Language, Parser, type Tree } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

let language: Language;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load('tree-sitter-c_sharp.wasm');
});

test('keeps conditional element receivers before collection arms containing type operators', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const condition of ['a.b?[0]', 'a?[0] == null', 'a[0]?[1]', '(a.b)?[0]']) {
      for (const consequence of ['[1]', '[x is T]', '[x as T]', '[x is T?[]]', '[x is T ? [1] : [2]]']) {
        for (const alternative of ['e as T', 'e is T', '[e is T]', 'e as T?']) {
          const source = `var result = ${condition} ? ${consequence} : ${alternative};`;
          const tree = parser.parse(source)!;
          try {
            assertConditional(tree, condition, consequence, alternative);
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

test('parses collection-arm type operators after a non-ASCII comment without changing the preceding receiver', () => {
  const parser = new Parser().setLanguage(language);
  const condition = 'a.b?[0]';
  try {
    for (const [consequence, alternative] of [
      ['[x]', 'e'],
      ['[x is T]', 'e'],
      ['[x as T]', 'e as T'],
      ['[x is T?[]]', 'e as T?'],
      ['[x is T ? [1] : [2]]', '[e is T]'],
    ] as const) {
      const tree = parser.parse(`// 😀\nvar result = ${condition} ? ${consequence} : ${alternative};`)!;
      try {
        assertConditional(tree, condition, consequence, alternative);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('does not carry type uncertainty across statement and block boundaries', () => {
  const parser = new Parser().setLanguage(language);
  const expression = 'q?[0] ? [1] : z';
  const statement = `var result = ${expression};`;
  const sources = [
    ...[
      'var pre = o is T;',
      'var pre = o as T;',
      'var pre = o is T t;',
      'var pre = o is T; var a = 1; var b = 2;',
      'if (o is T) {}',
      'switch (o is T) {}',
      'for (var pre = o is T; ; ) { break; }',
      'var pre = F(() => { return o is T; });',
    ].map((prefix) => `class C { void M() { ${prefix} ${statement} } }`),
    `class C { bool P => o is T; void M() { ${statement} } }`,
    `class C { void A() { if (o is T) {} } void M() { ${statement} } }`,
    `var pre = o is T; ${statement}`,
  ];
  try {
    for (const source of [`// 😀\nclass C { void M() { ${statement} } }`, ...sources]) {
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const conditional = tree.rootNode
          .descendantsOfType('conditional_expression')
          .find((node) => node.text === expression)!;
        expect(conditional?.childForFieldName('condition')?.text, source).toBe('q?[0]');
        expect(conditional?.childForFieldName('consequence')?.text, source).toBe('[1]');
        expect(conditional?.childForFieldName('alternative')?.text, source).toBe('z');
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

function assertConditional(tree: Tree, condition: string, consequence: string, alternative: string): void {
  expect(tree.rootNode.hasError, tree.rootNode.text).toBe(false);
  const conditional = tree.rootNode.descendantsOfType('conditional_expression')[0]!;
  expect(conditional.childForFieldName('condition')?.text, tree.rootNode.text).toBe(condition);
  expect(conditional.childForFieldName('consequence')?.text, tree.rootNode.text).toBe(consequence);
  expect(conditional.childForFieldName('alternative')?.text, tree.rootNode.text).toBe(alternative);
}
