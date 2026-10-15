import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

let language: Language;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load('tree-sitter-c_sharp.wasm');
});

test('keeps logical operators and collection ternaries outside an is constant pattern', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  const query = new Query(language, '(is_pattern_expression) @test');
  try {
    const source = 'var result = x is null || y is null ? [1] : [2];';
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError).toBe(false);
      const conditional = tree.rootNode.descendantsOfType('conditional_expression')[0]!;
      expect(conditional.childForFieldName('condition')?.text).toBe('x is null || y is null');
      expect(query.captures(tree.rootNode).map(({ node }) => node.text)).toEqual(['x is null', 'y is null']);
    } finally {
      tree.delete();
    }
    const chain = parser.parse('var result = a == b && hook is not null && hook.Call() == false;')!;
    try {
      expect(chain.rootNode.hasError).toBe(false);
      expect(query.captures(chain.rootNode).map(({ node }) => node.text)).toEqual(['hook is not null']);
      expect(chain.rootNode.descendantsOfType('constant_pattern').map((node) => node.text)).toEqual(['null']);
    } finally {
      chain.delete();
    }
    const guardedCall = parser.parse(
      'var result = count > 1 || count == 1 && items[0] is not null && items[0]?.GetType() != typeof(object[]);'
    )!;
    try {
      expect(guardedCall.rootNode.hasError).toBe(false);
      expect(query.captures(guardedCall.rootNode).map(({ node }) => node.text)).toEqual(['items[0] is not null']);
    } finally {
      guardedCall.delete();
    }
  } finally {
    query.delete();
    parser.delete();
  }
});

test('retains arithmetic and shifts inside is constants while ending before bitwise operators', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const source of ['var result = value is 1 + 2 * 3 << 4;', 'var result = value is 1 + 2 * 3 << 4 | mask;']) {
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(
          tree.rootNode.descendantsOfType('is_pattern_expression').map((node) => node.text),
          source
        ).toEqual(['value is 1 + 2 * 3 << 4']);
        expect(
          tree.rootNode.descendantsOfType('constant_pattern').map((node) => node.text),
          source
        ).toEqual(['1 + 2 * 3 << 4']);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves full constant expressions in switch and delimited patterns', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const source of [
      'switch (value) { case 1 | 2: break; }',
      'var result = value switch { 1 | 2 => true, _ => false };',
      'var result = value is (1 | 2);',
      'var result = value is { Property: 1 | 2 };',
      'var result = value is [1 | 2];',
      'var result = value is (1 | 2, 3 & 4);',
    ]) {
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(
          tree.rootNode.descendantsOfType('constant_pattern').some((node) => node.text.includes('1 | 2')),
          source
        ).toBe(true);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves complete qualified constants and existing member receiver captures', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  const captures = new Query(language, '(lvalue_expression) @lvalue\n(expression) @expression');
  const tree = parser.parse('var result = value is Namespace.Value.Member or Namespace.Value.Other && ready;')!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType('is_pattern_expression').map((node) => node.text)).toEqual([
      'value is Namespace.Value.Member or Namespace.Value.Other',
    ]);
    expect(tree.rootNode.descendantsOfType('constant_pattern').map((node) => node.text)).toEqual([
      'Namespace.Value.Member',
      'Namespace.Value.Other',
    ]);
    const recorded = captures.captures(tree.rootNode).map(({ name, node }) => [name, node.text]);
    expect(recorded).toContainEqual(['lvalue', 'Namespace']);
    expect(recorded).toContainEqual(['lvalue', 'Namespace.Value']);
    expect(recorded).not.toContainEqual(['expression', 'Namespace']);
  } finally {
    tree.delete();
    captures.delete();
    parser.delete();
  }
});

test('retains existing supertype captures inside ordinary name-call arguments', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  const query = new Query(language, '(lvalue_expression) @lvalue\n(expression) @expression');
  const tree = parser.parse('var result = value is nameof(Type.Member);')!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType('constant_pattern').map((node) => node.text)).toEqual([
      'nameof(Type.Member)',
    ]);
    const captures = query.captures(tree.rootNode).map(({ name, node }) => [name, node.text]);
    expect(captures).toContainEqual(['lvalue', 'Type']);
    expect(captures).toContainEqual(['lvalue', 'Type.Member']);
    expect(captures).toContainEqual(['expression', 'Type.Member']);
    expect(captures).not.toContainEqual(['expression', 'Type']);
    expect(captures).not.toContainEqual(['lvalue', 'nameof']);
  } finally {
    tree.delete();
    query.delete();
    parser.delete();
  }
});
