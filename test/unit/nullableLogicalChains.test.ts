import { Language, Parser } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

let language: Language;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load('tree-sitter-c_sharp.wasm');
});

test('preserves nullable logical types and expires their proof at expression boundaries', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const operator of ['&&', '||']) {
      for (const rank of ['[]', '[,]', '[][]']) {
        for (const trivia of [' ', '/* ? : */', '\n']) {
          const chain = `a is T${trivia}?${rank} ${operator} b is U?[] ${operator} ready`;
          for (const wrap of [
            (expression: string): string => `var first = ${expression}; var next = x is T?[] && y : z;`,
            (expression: string): string => `F(${expression}, x is T?[] && y : z);`,
            (expression: string): string => `var first = [${expression}, x is T?[] && y : z];`,
          ]) {
            const source = `${wrap(chain)} class Following {}`;
            const tree = parser.parse(source)!;
            try {
              expect(tree.rootNode.hasError, source).toBe(false);
              expect(
                tree.rootNode.descendantsOfType('nullable_type').map((node) => [node.text, node.startIndex]),
                source
              ).toEqual([
                [`T${trivia}?`, source.indexOf(`T${trivia}?`)],
                ['U?', source.indexOf('U?')],
              ]);
              expect(
                tree.rootNode
                  .descendantsOfType('conditional_expression')
                  .map((node) =>
                    ['condition', 'consequence', 'alternative'].map((field) => node.childForFieldName(field)?.text)
                  ),
                source
              ).toEqual([['x is T', '[] && y', 'z']]);
              const start = source.indexOf(chain);
              expect(
                tree.rootNode
                  .descendantsOfType('binary_expression')
                  .filter((node) => node.startIndex >= start && node.endIndex <= start + chain.length)
                  .map((node) => ['left', 'operator', 'right'].map((field) => node.childForFieldName(field)?.text)),
                source
              ).toEqual([
                [`a is T${trivia}?${rank} ${operator} b is U?[]`, operator, 'ready'],
                [`a is T${trivia}?${rank}`, operator, 'b is U?[]'],
              ]);
              const following = tree.rootNode.descendantsOfType('class_declaration');
              expect(
                following.map((node) => [node.text, node.startIndex, node.endIndex, node.hasError]),
                source
              ).toEqual([['class Following {}', source.indexOf('class Following {}'), source.length, false]]);
            } finally {
              tree.delete();
            }
          }
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('lets a later colon determine earlier questions in logical chains', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const operator of ['&&', '||']) {
      for (const count of [2, 20]) {
        const source = `var r = ${`a is T?[] ${operator} `.repeat(count)}b : c;`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const conditional = tree.rootNode.descendantsOfType('conditional_expression');
          expect(conditional, source).toHaveLength(1);
          expect(conditional[0]!.childForFieldName('condition')?.text, source).toBe(
            `a is T?[] ${operator} `.repeat(count - 1) + 'a is T'
          );
          expect(conditional[0]!.childForFieldName('alternative')?.text, source).toBe('c');
          expect(tree.rootNode.descendantsOfType('nullable_type'), source).toHaveLength(count - 1);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves mixed logical precedence when the chain ends with a type test', () => {
  const source = 'var r = a is T?[] || b is U?[] && c is V?[];';
  const parser = new Parser().setLanguage(language);
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(
      tree.rootNode
        .descendantsOfType('binary_expression')
        .map((node) => ['left', 'operator', 'right'].map((field) => node.childForFieldName(field)?.text))
    ).toEqual([
      ['a is T?[]', '||', 'b is U?[] && c is V?[]'],
      ['b is U?[]', '&&', 'c is V?[]'],
    ]);
    expect(
      tree.rootNode.descendantsOfType('nullable_type').map((node) => [node.text, node.startIndex, node.endIndex])
    ).toEqual([
      ['T?', 13, 15],
      ['U?', 26, 28],
      ['V?', 39, 41],
    ]);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test.each(['ready.Foo()', 'ready == 1', 'ready ? x : y'])(
  'preserves nullable logical chains before the uncertified tail %s',
  (tail) => {
    const source = `var r = ${'a is T?[] && '.repeat(20)}${tail};`;
    const parser = new Parser().setLanguage(language);
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError).toBe(false);
      expect(tree.rootNode.descendantsOfType('nullable_type')).toHaveLength(20);
      expect(
        tree.rootNode
          .descendantsOfType('conditional_expression')
          .map((node) =>
            ['condition', 'consequence', 'alternative'].map((field) => node.childForFieldName(field)?.text)
          )
      ).toEqual(tail.includes('?') ? [[`${'a is T?[] && '.repeat(20)}ready`, 'x', 'y']] : []);
      const binaries = tree.rootNode.descendantsOfType('binary_expression');
      expect(binaries[0]!.childForFieldName('operator')?.text).toBe('&&');
    } finally {
      tree.delete();
      parser.delete();
    }
  }
);
