import { Language, Parser, type Tree } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

import { editTree, syntaxSnapshot } from '../helpers/syntaxSnapshot';

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

test('reparses collection-arm type operators without changing the preceding receiver', () => {
  const parser = new Parser().setLanguage(language);
  const condition = 'a.b?[0]';
  let source = `// 😀\nvar result = ${condition} ? [x] : e;`;
  let tree = parser.parse(source)!;
  try {
    for (const [consequence, alternative] of [
      ['[x is T]', 'e'],
      ['[x as T]', 'e as T'],
      ['[x is T?[]]', 'e as T?'],
      ['[x is T ? [1] : [2]]', '[e is T]'],
      ['[x]', 'e'],
    ] as const) {
      const next = `// 😀\nvar result = ${condition} ? ${consequence} : ${alternative};`;
      editTree(tree, source, next);
      const incremental = parser.parse(next, tree)!;
      tree.delete();
      tree = incremental;
      source = next;
      assertConditional(tree, condition, consequence, alternative);
      const fresh = parser.parse(source)!;
      try {
        expect(syntaxSnapshot(tree.rootNode), source).toEqual(syntaxSnapshot(fresh.rootNode));
      } finally {
        fresh.delete();
      }
    }
  } finally {
    tree.delete();
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
