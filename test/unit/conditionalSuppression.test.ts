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
      const accesses = tree.rootNode.descendantsOfType('conditional_access_expression');
      expect(accesses, expression).toHaveLength(1);
      expect(accesses[0]?.text, expression).toBe(expression);
      expect(accesses[0]?.childForFieldName('consequence')?.type, expression).toBe('assignment_expression');
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

test('retains generic call receivers through suppression and postfix continuations', () => {
  for (const receiver of ['f<T>(a)', 'f<T>(x.y)', 'f<T>(c?[1])']) {
    for (const suppression of ['!', '!!', ' /* gap */ !']) {
      for (const continuation of ['[b]', '(b)', '[1, 2]']) {
        const expression = `${receiver}${suppression}${continuation}`;
        const tree = parser.parse(`var result = ${expression};`)!;
        try {
          expect(tree.rootNode.hasError, expression).toBe(false);
          expect(tree.rootNode.descendantsOfType('cast_expression'), expression).toHaveLength(0);
          expect(tree.rootNode.descendantsOfType('binary_expression'), expression).toHaveLength(0);
          const invocation = continuation.startsWith('(');
          const outer = tree.rootNode
            .descendantsOfType(invocation ? 'invocation_expression' : 'element_access_expression')
            .find((node) => node.text === expression)!;
          const suppressed = outer?.childForFieldName(invocation ? 'function' : 'expression');
          expect(suppressed?.type, expression).toBe('postfix_unary_expression');
          expect(suppressed?.text, expression).toBe(`${receiver}${suppression}`);
          expect(
            suppressed?.descendantsOfType('invocation_expression').map((node) => node.text),
            expression
          ).toContain(receiver);
        } finally {
          tree.delete();
        }
      }
    }
  }
});

test('keeps logical negation as the right range operand in conditional assignments', () => {
  for (const receiver of ['b?.b', 'b?[0]']) {
    for (const value of ['a .. !c', '..!c', '(T)..!c', 'a ?? ..!c']) {
      const source = `class C { void M() { ${receiver} = ${value}; } }`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const assignment = tree.rootNode.descendantsOfType('assignment_expression')[0];
        expect(assignment?.childForFieldName('right')?.text, source).toBe(value);
        const range = assignment?.descendantsOfType('range_expression')[0];
        expect(range?.namedChildren.at(-1)?.type, source).toBe('prefix_unary_expression');
        expect(range?.namedChildren.at(-1)?.text, source).toBe('!c');
      } finally {
        tree.delete();
      }
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

test('keeps suppressed generic calls as is-pattern receivers', () => {
  for (const call of ['f<T>(d)', 'g.f<T>(d)', 'f<T,U>(d)', 'f(d)', 'f<T>(a[i])', 'f<T>(c?[1])']) {
    for (const suppression of ['!', '!!']) {
      const receiver = `${call}${suppression}`;
      for (const pattern of ['(1, 2)', '(null)', '(A)', '[1]', '[_]']) {
        const expression = `${receiver} is ${pattern}`;
        const tree = parser.parse(`var result = ${expression};`)!;
        try {
          expect(tree.rootNode.hasError, expression).toBe(false);
          const isPattern = tree.rootNode.descendantsOfType('is_pattern_expression')[0]!;
          expect(isPattern?.text, expression).toBe(expression);
          expect(isPattern.childForFieldName('expression')?.text, expression).toBe(receiver);
          expect(isPattern.childForFieldName('expression')?.type, expression).toBe('postfix_unary_expression');
          expect(isPattern.descendantsOfType('invocation_expression')[0]?.text, expression).toBe(call);
          expect(tree.rootNode.descendantsOfType('cast_expression'), expression).toHaveLength(0);
        } finally {
          tree.delete();
        }
      }
    }
  }
});
