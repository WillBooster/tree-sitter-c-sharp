import path from 'node:path';

import { Edit, Language, type Node, Parser, Query, type Tree } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

import { editTree, syntaxSnapshot } from '../helpers/syntaxSnapshot.js';

await Parser.init();
const language = await Language.load(path.join(import.meta.dirname, '../../tree-sitter-c_sharp.wasm'));

const operands = [
  '(int*)++p',
  '(int*)*f()',
  '(int*)*++p',
  '(int*)--p',
  '++p',
  '--p',
  'f()',
  'obj.f()',
  'a[0]()',
  'f()()',
  '((f))()',
  '++f()',
  '++(p)',
  '*++pp',
];

test('retains pointer operands and fresh query ranges through edits', () => {
  const parser = new Parser().setLanguage(language);
  let query: Query | undefined;
  let tree: Tree | undefined;
  const prefix = 'unsafe class C { void M() { ';
  const suffix = ' } }';
  try {
    query = new Query(language, '(expression) @expression (_) @node');
    const captures = (root: Node): unknown =>
      query!.captures(root).map(({ name, node }) => ({
        name,
        type: node.type,
        text: node.text,
        start: node.startIndex,
        end: node.endIndex,
        startPosition: node.startPosition,
        endPosition: node.endPosition,
      }));
    for (const operand of operands) {
      const expression = `*${operand}`;
      let statement = `var result = ${expression};`;
      tree = parser.parse(prefix + statement + suffix)!;
      const original = tree.rootNode.toString();
      expect(tree.rootNode.hasError, statement).toBe(false);
      for (const replacement of [`${expression} = v;`, `${expression} += v;`, statement]) {
        tree.edit(
          new Edit({
            startIndex: prefix.length,
            oldEndIndex: prefix.length + statement.length,
            newEndIndex: prefix.length + replacement.length,
            startPosition: { row: 0, column: prefix.length },
            oldEndPosition: { row: 0, column: prefix.length + statement.length },
            newEndPosition: { row: 0, column: prefix.length + replacement.length },
          })
        );
        statement = replacement;
        const source = prefix + statement + suffix;
        const next: Tree = parser.parse(source, tree)!;
        tree.delete();
        tree = next;
        const fresh = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, statement).toBe(false);
          expect(tree.rootNode.toString()).toBe(fresh.rootNode.toString());
          expect(captures(tree.rootNode)).toEqual(captures(fresh.rootNode));
          const assignment = tree.rootNode.descendantsOfType('assignment_expression')[0];
          if (!statement.startsWith('var ')) {
            expect(assignment).toBeDefined();
            expect(assignment!.childForFieldName('left')?.text).toBe(expression);
            expect(assignment!.childForFieldName('left')?.type).toBe('prefix_unary_expression');
            expect(assignment!.childForFieldName('left')?.firstNamedChild?.text).toBe(operand);
            expect(assignment!.childForFieldName('right')?.text).toBe('v');
          } else {
            expect(tree.rootNode.toString()).toBe(original);
          }
        } finally {
          fresh.delete();
        }
      }
      tree.delete();
      tree = undefined;
    }
  } finally {
    tree?.delete();
    query?.delete();
    parser.delete();
  }
});

test('preserves cast and postfix binding around pointer reads', () => {
  const parser = new Parser().setLanguage(language);
  let query: Query | undefined;
  try {
    query = new Query(language, '(prefix_unary_expression) @pointer (identifier) @operand');
    for (const expression of [
      '*++p',
      '*--p',
      '**++p',
      '*(int*)*f()',
      '*f()',
      '*f().g',
      '*(T*)f()',
      '*(T*)a[0]',
      '*(T*)p!',
      '*(b)(c)',
      '*(b)[0]',
    ]) {
      const source = `unsafe class C { void M() { var result = ${expression}; } }`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, expression).toBe(false);
        const captured = query.captures(tree.rootNode).map(({ node }) => node.text);
        expect(captured).toContain(expression);
        if (expression === '*++p' || expression === '*--p' || expression === '**++p') expect(captured).toContain('p');
        if (expression === '*(int*)*f()') expect(captured).toContain('*f()');
        const pointer = tree.rootNode.descendantsOfType('prefix_unary_expression')[0]!;
        expect(pointer.text).toBe(expression);
        if (expression === '*f()') expect(pointer.firstNamedChild?.type).toBe('invocation_expression');
        if (expression.startsWith('*(T*)')) {
          const cast = pointer.firstNamedChild!;
          expect(cast.type).toBe('cast_expression');
          const value = cast.childForFieldName('value')!;
          expect(value.text).toBe(expression.slice(5));
          if (expression.endsWith('f()')) expect(value.type).toBe('invocation_expression');
          if (expression.endsWith('a[0]')) expect(value.type).toBe('element_access_expression');
          if (expression.endsWith('p!')) expect(value.type).toBe('postfix_unary_expression');
        }
        if (expression === '*f().g') expect(pointer.firstNamedChild?.type).toBe('member_access_expression');
        if (expression === '*(b)(c)') expect(pointer.firstNamedChild?.type).toBe('cast_expression');
        if (expression === '*(b)[0]') expect(pointer.firstNamedChild?.type).toBe('element_access_expression');
      } finally {
        tree.delete();
      }
    }
  } finally {
    query?.delete();
    parser.delete();
  }
});

test('binds pointer assignments inside larger expressions', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const pointer of ['*++p', '*--p', '*(int*)++p', '*++p.x', '*f()']) {
      const assignment = `${pointer} = v`;
      for (const statement of [
        `F(${assignment});`,
        `x = ${assignment};`,
        `x = (${assignment});`,
        `return ${assignment};`,
        `for (;;${assignment}) {}`,
        `for (${assignment};;) {}`,
        `x = c ? ${assignment} : 0;`,
      ]) {
        const tree = parser.parse(`unsafe class C { void M() { ${statement} } }`)!;
        try {
          expect(tree.rootNode.hasError, statement).toBe(false);
          const node = tree.rootNode
            .descendantsOfType('assignment_expression')
            .find((node) => node.text === assignment);
          expect(node, statement).toBeDefined();
          expect(node!.childForFieldName('left')?.text, statement).toBe(pointer);
          expect(node!.childForFieldName('right')?.text, statement).toBe('v');
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('distinguishes casts of collections from parenthesized indexing through edits', () => {
  const parser = new Parser().setLanguage(language);
  const cases = [
    ['(b)[0]', 'element_access_expression'],
    ['(b)[]', 'cast_expression'],
    ['(b)[/* marker */]', 'cast_expression'],
    ['(b)[/* marker */0]', 'element_access_expression'],
    ['(b)/* marker */[0]', 'element_access_expression'],
    ['(b)[// marker\n]', 'cast_expression'],
    ['(N.T)[0]', 'element_access_expression'],
    ['(N.T)[]', 'cast_expression'],
    ['(G<T>.N)[0]', 'element_access_expression'],
    ['(G<T>.N)[]', 'cast_expression'],
    ['(global::N.T)[0]', 'element_access_expression'],
    ['(N.G<T>)[0]', 'cast_expression'],
    ['(G<T>)[0]', 'cast_expression'],
    ['(int)[0]', 'cast_expression'],
    ['(T[])[0]', 'cast_expression'],
    ['(T?)[0]', 'cast_expression'],
    ['(T*)[0]', 'cast_expression'],
    ['(global::T)[0]', 'cast_expression'],
  ] as const;
  let tree: Tree | undefined;
  let previous = '';
  try {
    for (const [expression, kind] of [...cases, ...cases.toReversed()]) {
      const source = `/* α */ var result = ${expression};`;
      if (tree) editTree(tree, previous, source);
      const next = parser.parse(source, tree)!;
      tree?.delete();
      tree = next;
      previous = source;
      const fresh = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, expression).toBe(false);
        expect(syntaxSnapshot(tree.rootNode), expression).toEqual(syntaxSnapshot(fresh.rootNode));
        const initializer = tree.rootNode.descendantsOfType('variable_declarator')[0]?.lastNamedChild;
        expect(initializer?.type, expression).toBe(kind);
        expect(initializer?.text, expression).toBe(expression);
        if (kind === 'cast_expression') {
          expect(initializer?.childForFieldName('value')?.type, expression).toBe('collection_expression');
        } else {
          expect(initializer?.childForFieldName('expression')?.type, expression).toBe('parenthesized_expression');
        }
      } finally {
        fresh.delete();
      }
    }
  } finally {
    tree?.delete();
    parser.delete();
  }
});
