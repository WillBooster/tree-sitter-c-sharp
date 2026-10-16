import { Language, Parser } from '@willbooster/web-tree-sitter';
import { afterAll, beforeAll, expect, test } from 'vitest';

let parser: Parser;

beforeAll(async () => {
  await Parser.init();
  parser = new Parser().setLanguage(await Language.load('tree-sitter-c_sharp.wasm'));
});

afterAll(() => parser.delete());

test('keeps binary operators after conditional-access suppression intact', () => {
  for (const receiver of ['a?.b', 'a?[0]', 'a?.b()']) {
    for (const suppression of ['!', '!!']) {
      for (const operator of ['!=', '==', '>=', '&&', '??']) {
        assertBinary(`${receiver}${suppression} ${operator} c`, `${receiver}${suppression}`, operator);
      }
    }
  }
  assertBinary('a?.b!!=c', 'a?.b!', '!=');
  assertBinary('a?[0]!!=c', 'a?[0]!', '!=');
  assertBinary('a! != c', 'a!', '!=');
  assertBinary('!a != c', '!a', '!=');
});

test('retains conditional assignments after a separated suppression operator', () => {
  for (const expression of ['a?.b! = c', 'a?.b! /* gap */ = c', 'a?[0]! = c']) {
    const tree = parser.parse(`var r = ${expression};`)!;
    try {
      expect(tree.rootNode.hasError, expression).toBe(false);
      const assignment = tree.rootNode.descendantsOfType('assignment_expression');
      expect(assignment, expression).toHaveLength(1);
      expect(assignment[0]?.childForFieldName('left')?.type, expression).toBe('postfix_unary_expression');
      expect(assignment[0]?.childForFieldName('right')?.text, expression).toBe('c');
      expect(tree.rootNode.descendantsOfType('binary_expression'), expression).toHaveLength(0);
    } finally {
      tree.delete();
    }
  }
});

test('retains conditional receiver continuations after suppression', () => {
  for (const expression of ['a?.b!.c', 'a?.b![0]', 'a?.b!()', 'a?[0]!.b']) {
    const tree = parser.parse(`var r = ${expression};`)!;
    try {
      expect(tree.rootNode.hasError, expression).toBe(false);
      expect(
        tree.rootNode.descendantsOfType('conditional_access_expression').map((node) => node.text),
        expression
      ).toEqual([expression]);
      expect(tree.rootNode.descendantsOfType('postfix_unary_expression'), expression).toHaveLength(1);
    } finally {
      tree.delete();
    }
  }
});

function assertBinary(expression: string, left: string, operator: string): void {
  const tree = parser.parse(`var r = ${expression};`)!;
  try {
    expect(tree.rootNode.hasError, expression).toBe(false);
    const binary = tree.rootNode.descendantsOfType('binary_expression');
    expect(binary, expression).toHaveLength(1);
    expect(binary[0]?.childForFieldName('left')?.text, expression).toBe(left);
    expect(binary[0]?.childForFieldName('operator')?.text, expression).toBe(operator);
    expect(binary[0]?.childForFieldName('right')?.text, expression).toBe('c');
    expect(tree.rootNode.descendantsOfType('assignment_expression'), expression).toHaveLength(0);
  } finally {
    tree.delete();
  }
}
