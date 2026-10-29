import path from 'node:path';

import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

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

test('retains pointer operands in assignments', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const operand of operands) {
      const expression = `*${operand}`;
      for (const statement of [`var result = ${expression};`, `${expression} = v;`, `${expression} += v;`]) {
        const tree = parser.parse(`unsafe class C { void M() { ${statement} } }`)!;
        try {
          expect(tree.rootNode.hasError, statement).toBe(false);
          if (!statement.startsWith('var ')) {
            const assignment = tree.rootNode.descendantsOfType('assignment_expression')[0];
            expect(assignment).toBeDefined();
            expect(assignment!.childForFieldName('left')?.text).toBe(expression);
            expect(assignment!.childForFieldName('left')?.type).toBe('prefix_unary_expression');
            expect(assignment!.childForFieldName('left')?.firstNamedChild?.text).toBe(operand);
            expect(assignment!.childForFieldName('right')?.text).toBe('v');
          }
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
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

test('distinguishes casts of collections from parenthesized indexing', () => {
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
  try {
    for (const [expression, kind] of cases) {
      const tree = parser.parse(`/* α */ var result = ${expression};`)!;
      try {
        expect(tree.rootNode.hasError, expression).toBe(false);
        const initializer = tree.rootNode.descendantsOfType('variable_declarator')[0]?.lastNamedChild;
        expect(initializer?.type, expression).toBe(kind);
        expect(initializer?.text, expression).toBe(expression);
        if (kind === 'cast_expression') {
          expect(initializer?.childForFieldName('value')?.type, expression).toBe('collection_expression');
        } else {
          expect(initializer?.childForFieldName('expression')?.type, expression).toBe('parenthesized_expression');
        }
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});
