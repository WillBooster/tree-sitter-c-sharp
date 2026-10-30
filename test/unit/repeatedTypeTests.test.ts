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

test('preserves a following switch section after a parenthesized repeated type-test guard', () => {
  const parser = new Parser().setLanguage(language);
  const following = 'case var w when (e?[0] is T is U): break;';
  const source = `switch (y) { case var v when (flag ? a?[0] is T is U : false): break; ${following} }`;
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError, source).toBe(false);
    const section = tree.rootNode.descendantsOfType('switch_section').find((node) => node.text === following);
    expect(section?.hasError, source).toBe(false);
    expect(
      section?.descendantsOfType('when_clause').map((node) => node.text),
      source
    ).toEqual(['when (e?[0] is T is U)']);
    expect(
      section?.descendantsOfType('conditional_access_expression').map((node) => node.text),
      source
    ).toEqual(['e?[0]']);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('rejects an incomplete unparenthesized repeated type-test guard', () => {
  const parser = new Parser().setLanguage(language);
  const source =
    'switch (y) { case var v when flag ? a?[0] is T is U : false: break; case var w when (e?[0] is T is U): break; }';
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError, source).toBe(true);
  } finally {
    tree.delete();
    parser.delete();
  }
});
