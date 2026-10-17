import { Language, Parser } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

let language: Language;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load('tree-sitter-c_sharp.wasm');
});

test('distinguishes logical pattern operators from contextual variable names', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const left of ['1', 'P', 'T[]']) {
      for (const operator of ['and', 'or']) {
        for (const right of ['< 2', 'ready', '(2)', 'T item', '{ P: 1 }', '[1]']) {
          const pattern = `(${left}) ${operator} ${right}`;
          for (const source of [
            `var result = value is ${pattern};`,
            `var result = value switch { ${pattern} => 1, _ => 0 };`,
            `var result = value is { P: ${pattern} };`,
          ]) {
            const tree = parser.parse(source)!;
            try {
              expect(tree.rootNode.hasError, source).toBe(false);
              const logical = tree.rootNode.descendantsOfType(`${operator}_pattern`)[0]!;
              expect(logical?.text, source).toBe(pattern);
              expect(logical.childForFieldName('left')?.text, source).toBe(`(${left})`);
              expect(logical.childForFieldName('right')?.text, source).toBe(right);
            } finally {
              tree.delete();
            }
          }
        }
        if (left !== '1') continue;
        for (const spelling of [operator, `@${operator}`]) {
          const pattern = `(1) ${spelling}`;
          const tree = parser.parse(`var result = value is ${pattern};`)!;
          try {
            expect(tree.rootNode.hasError).toBe(false);
            expect(tree.rootNode.descendantsOfType('and_pattern')).toHaveLength(0);
            expect(tree.rootNode.descendantsOfType('or_pattern')).toHaveLength(0);
            const recursive = tree.rootNode.descendantsOfType('recursive_pattern')[0]!;
            expect(recursive?.text).toBe(pattern);
            expect(recursive.childForFieldName('name')?.text).toBe(spelling);
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

test('retains contextual designations after closed property and list patterns', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const left of ['{ P: 1 }', '[1]', 'T { P: 1 }', 'R(1) { P: 1 }']) {
      for (const operator of ['and', 'or']) {
        const pattern = `${left} ${operator}`;
        for (const source of [
          `var result = value is ${pattern};`,
          `var result = value switch { ${pattern} => 1, _ => 0 };`,
          `switch (value) { case ${pattern}: break; }`,
          `if (value is ${pattern}) { }`,
        ]) {
          const tree = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, source).toBe(false);
            expect(tree.rootNode.descendantsOfType(`${operator}_pattern`), source).toHaveLength(0);
            const node = tree.rootNode
              .descendantsOfType(left.startsWith('[') ? 'list_pattern' : 'recursive_pattern')
              .find((node) => node.text === pattern)!;
            expect(node?.childForFieldName('name')?.text, source).toBe(operator);
          } finally {
            tree.delete();
          }
        }
        const logical = `${left} ${operator} not null`;
        const tree = parser.parse(`var result = value is ${logical};`)!;
        try {
          expect(tree.rootNode.hasError, logical).toBe(false);
          expect(tree.rootNode.descendantsOfType(`${operator}_pattern`)[0]?.text, logical).toBe(logical);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});
