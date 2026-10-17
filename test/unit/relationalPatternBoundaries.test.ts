import { Language, Parser } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

let language: Language;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load('tree-sitter-c_sharp.wasm');
});

test('keeps ternary and lower-precedence operators outside relational patterns', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const receiver of ['x', 'x?.Value', 'x?[0]']) {
      for (const operator of ['<', '<=', '>', '>=']) {
        for (const suffix of [
          '? [1] : [2]',
          '&& ready',
          '|| ready',
          '== ready',
          '& ready',
          '^ ready',
          '| ready',
          '?? fallback',
          '< 2',
        ]) {
          const condition = `${receiver} is ${operator} 0`;
          const source = `var result = ${condition} ${suffix};`;
          const tree = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, source).toBe(false);
            const pattern = tree.rootNode.descendantsOfType('relational_pattern')[0]!;
            expect(pattern.text, source).toBe(`${operator} 0`);
            expect(pattern.parent?.text, source).toBe(condition);
            if (suffix.startsWith('? ')) {
              const conditional = tree.rootNode.descendantsOfType('conditional_expression')[0]!;
              expect(conditional.childForFieldName('condition')?.text, source).toBe(condition);
              expect(conditional.childForFieldName('consequence')?.text, source).toBe('[1]');
              expect(conditional.childForFieldName('alternative')?.text, source).toBe('[2]');
            }
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

test('retains arithmetic and parenthesized operands in every pattern context', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const operand of ['1 + 2 * 3', '1 << 2', '(1 < 2)', '(flag ? 1 : 2)', '(1 & 2)', 'Limit.Value', 'Limit?[0]']) {
      const pattern = `> ${operand}`;
      for (const source of [
        `var result = x is ${pattern};`,
        `var result = x is not ${pattern};`,
        `var result = x is ${pattern} and < 10;`,
        `var result = x is { Value: ${pattern} };`,
        `var result = x is [${pattern}];`,
        `var result = x switch { ${pattern} => 1, _ => 0 };`,
        `switch (x) { case ${pattern}: break; }`,
      ]) {
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const relational = tree.rootNode.descendantsOfType('relational_pattern')[0]!;
          expect(relational.text, source).toBe(pattern);
          expect(relational.namedChildren[0]?.text, source).toBe(operand);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});
