import { Language, Parser } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

import { editTree, syntaxSnapshot } from '../helpers/syntaxSnapshot';

let language: Language;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load('tree-sitter-c_sharp.wasm');
});

test('preserves conditional access through successive type tests and nullable patterns', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const receiver of ['a?[0]', 'a?[0][1]', 'a?[0]?.b']) {
      for (const pattern of ['T is U', 'T is U is V', 'not null is bool', 'T?[] is U', 'T is U?[]', 'T is U?']) {
        const condition = `${receiver} is ${pattern}`;
        const expression = `${condition} ? b : c`;
        for (const wrapped of [
          expression,
          `F(${expression})`,
          `flag ? ${expression} : end`,
          `flag ? start : ${expression}`,
        ]) {
          const tree = parser.parse(`var r = ${wrapped};`)!;
          try {
            expect(tree.rootNode.hasError, wrapped).toBe(false);
            const conditional = tree.rootNode.descendantsOfType('conditional_expression').at(-1)!;
            expect(
              ['condition', 'consequence', 'alternative'].map((field) => conditional.childForFieldName(field)?.text),
              wrapped
            ).toEqual([condition, 'b', 'c']);
            expect(
              conditional.childForFieldName('condition')?.descendantsOfType('conditional_access_expression')[0]?.text,
              wrapped
            ).toBe(receiver);
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

test('keeps repeated type tests consistent when edits change access and ternary ownership', () => {
  const parser = new Parser().setLanguage(language);
  const sources = [
    'var r = a?[0] is T ? b : c;',
    'var r = a?[0] is T is U ? b : c;',
    'var r = flag ? a?[0] is T is U ? b : c : end;',
    'var r = flag ? [0] is T is U ? b : c : end;',
    'var r = flag ? a?[0] is T?[] is U ? b : c : end;',
    'var r = flag ? a?[0] is T is U?[] ? b : c : end;',
  ];
  let previous = sources[0]!;
  let tree = parser.parse(previous)!;
  try {
    for (const source of [...sources.slice(1), ...sources.toReversed()]) {
      editTree(tree, previous, source);
      const incremental = parser.parse(source, tree)!;
      const fresh = parser.parse(source)!;
      try {
        expect(fresh.rootNode.hasError, source).toBe(false);
        expect(syntaxSnapshot(incremental.rootNode), source).toEqual(syntaxSnapshot(fresh.rootNode));
        const conditions = fresh.rootNode
          .descendantsOfType('conditional_expression')
          .map((node) => node.childForFieldName('condition')?.text);
        expect(conditions, source).toEqual(
          source.includes('flag ? [0]')
            ? ['flag', '[0] is T is U']
            : [
                ...(source.includes('flag ?') ? ['flag'] : []),
                source.slice(source.indexOf('a?[0]'), source.indexOf(' ? b')),
              ]
        );
      } finally {
        fresh.delete();
        tree.delete();
        tree = incremental;
        previous = source;
      }
    }
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('preserves a valid following switch section after ambiguous repeated type-test guards', () => {
  const parser = new Parser().setLanguage(language);
  const guards = [
    '(flag ? a?[0] is T is U : false)',
    'flag ? a?[0] is T is U : false',
    'flag ? a?[0]?.b is not null is U : M(false)',
    'flag ? a?[0] is T?[] is U : false',
    'flag ? a?[0] is T is U?[] ? true : false : false',
  ];
  const following = 'case var w when (e?[0] is T is U): break;';
  let previous = '';
  let tree = parser.parse(previous)!;
  try {
    for (const guard of [...guards, ...guards.toReversed()]) {
      const source = `switch (y) { case var v when ${guard}: break; ${following} }`;
      editTree(tree, previous, source);
      const incremental = parser.parse(source, tree)!;
      const fresh = parser.parse(source)!;
      try {
        expect(syntaxSnapshot(incremental.rootNode), source).toEqual(syntaxSnapshot(fresh.rootNode));
        const section = fresh.rootNode.descendantsOfType('switch_section').find((node) => node.text === following);
        expect(section?.hasError, source).toBe(false);
        expect(
          section?.descendantsOfType('when_clause').map((node) => node.text),
          source
        ).toEqual(['when (e?[0] is T is U)']);
        expect(
          section?.descendantsOfType('conditional_access_expression').map((node) => node.text),
          source
        ).toEqual(['e?[0]']);
        if (guard.startsWith('(')) expect(fresh.rootNode.hasError, source).toBe(false);
      } finally {
        fresh.delete();
        tree.delete();
        tree = incremental;
        previous = source;
      }
    }
  } finally {
    tree.delete();
    parser.delete();
  }
});
