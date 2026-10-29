import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

let language: Language;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load('tree-sitter-c_sharp.wasm');
});

test('keeps dependent calls and indexes inside conditional access and terminal suppression outside it', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  const query = new Query(language, '(conditional_access_expression consequence: (_) @dependent)');
  try {
    for (const [expression, accesses, dependents] of [
      ['a?.B.C()[i]', ['a?.B.C()[i]'], ['.B.C()[i]']],
      ['a?.B.C()[i]!', ['a?.B.C()[i]'], ['.B.C()[i]']],
      ['a?.B?.C', ['a?.B?.C', '.B?.C'], ['.B?.C', '.C']],
    ] as const) {
      const tree = parser.parse(`var result = ${expression};`)!;
      try {
        expect(tree.rootNode.hasError, expression).toBe(false);
        expect(tree.rootNode.descendantsOfType('conditional_access_expression').map((node) => node.text)).toEqual(
          accesses
        );
        expect(query.captures(tree.rootNode).map(({ node }) => node.text)).toEqual(dependents);
        if (expression.includes('C()')) {
          expect(tree.rootNode.descendantsOfType('invocation_expression').map((node) => node.text)).toEqual(['.B.C()']);
          expect(tree.rootNode.descendantsOfType('element_access_expression').map((node) => node.text)).toEqual([
            '.B.C()[i]',
          ]);
        }
        if (expression.endsWith('!')) {
          const suppression = tree.rootNode.descendantsOfType('postfix_unary_expression')[0];
          expect(suppression?.text).toBe(expression);
          expect(suppression?.firstNamedChild?.type).toBe('conditional_access_expression');
        }
      } finally {
        tree.delete();
      }
    }
  } finally {
    query.delete();
    parser.delete();
  }
});

test('places C# 14 assignment inside the conditional access consequence', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const prefix of ['', '(T)', '(int)', '(G<T>)', '!(T)', 'await (T)', '(T)await ']) {
      for (const receiver of ['obj', '(obj)', 'new C()', '(a,b)']) {
        for (const [target, operator, value] of [
          ['.P', '=', 'value'],
          ['[i]', '+=', 'value'],
          ['.P', '??=', 'value'],
          ['.Event', '+=', 'handler'],
        ]) {
          const expression = `${receiver}?${target} ${operator} ${value}`;
          const tree = parser.parse(`${prefix}${expression};`)!;
          try {
            expect(tree.rootNode.hasError, expression).toBe(false);
            const access = tree.rootNode.descendantsOfType('conditional_access_expression')[0];
            expect(access?.text).toBe(expression);
            expect(access?.childForFieldName('condition')?.text).toBe(receiver);
            const assignment = access?.childForFieldName('consequence');
            expect(assignment?.type).toBe('assignment_expression');
            expect(assignment?.childForFieldName('left')?.text).toBe(target);
            expect(assignment?.childForFieldName('operator')?.text).toBe(operator);
            expect(assignment?.childForFieldName('right')?.text).toBe(value);
          } finally {
            tree.delete();
          }
        }
      }
    }
    for (const left of ['(T)obj', '(T)!obj', 'await (T)obj']) {
      const tree = parser.parse(`${left} = value;`)!;
      try {
        expect(tree.rootNode.hasError, left).toBe(false);
        const assignment = tree.rootNode.descendantsOfType('assignment_expression')[0];
        expect(assignment?.childForFieldName('left')?.text, left).toBe(left);
        expect(assignment?.childForFieldName('right')?.text, left).toBe('value');
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('parses dependent chains, assignments, nullable types, and collections with and without comments', () => {
  const inputs = [
    'var result = a?.B;',
    'var result = a?.B.C()[i];',
    'var result = a?.B.C()[i]!;',
    'var result = a?.B?.C;',
    'obj?.P;',
    'obj?.P = value;',
    'obj?.P ??= value;',
    'var result = flag ? [a] : [b];',
    'var result = flag?[a];',
    'var result = x is T?[];',
    'var result = x is T?[]?[0] : fallback;',
    'var result = x is T?[]?[0]?[1] : fallback;',
    'var result = flag ? x is T?[]?[0] : fallback : outer;',
    'var result = x is N.T<C>?[] ? [1] : fallback;',
    'var result = x is N.T?[] ? [1] as T : fallback;',
    'var result = x is T?[0] : other;',
  ];
  for (const comment of ['', '/*\n😀? : */']) {
    const parser = new Parser();
    parser.setLanguage(language);
    try {
      for (const input of inputs) {
        const source = input.replaceAll(/(?<!\?)\?(?!\?)/g, `?${comment}`);
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
        } finally {
          tree.delete();
        }
      }
    } finally {
      parser.delete();
    }
  }
});
