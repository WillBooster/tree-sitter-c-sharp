import { Language, Parser } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

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

test('keeps repeated type tests consistent across access and ternary ownership', () => {
  const parser = new Parser().setLanguage(language);
  const sources = [
    'var r = a?[0] is T ? b : c;',
    'var r = a?[0] is T is U ? b : c;',
    'var r = flag ? a?[0] is T is U ? b : c : end;',
    'var r = flag ? [0] is T is U ? b : c : end;',
    'var r = flag ? a?[0] is T?[] is U ? b : c : end;',
    'var r = flag ? a?[0] is T is U?[] ? b : c : end;',
  ];
  try {
    for (const source of sources) {
      const fresh = parser.parse(source)!;
      try {
        expect(fresh.rootNode.hasError, source).toBe(false);
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
      }
    }
  } finally {
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
  try {
    for (const guard of guards) {
      const source = `switch (y) { case var v when ${guard}: break; ${following} }`;
      const fresh = parser.parse(source)!;
      try {
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
      }
    }
  } finally {
    parser.delete();
  }
});
