import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

let language: Language;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load('tree-sitter-c_sharp.wasm');
});

test('binds conditional member and element access before surrounding operators', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  const receivers = new Query(language, '(conditional_access_expression condition: (expression) @receiver)');
  try {
    for (const access of ['x?.Member', 'x?[0]']) {
      for (const expression of [
        `y || ${access}`,
        `y && ${access}`,
        `y + ${access}`,
        `y * ${access}`,
        `y ?? ${access}`,
        `y..${access}`,
        `!${access}`,
        `-${access}`,
        `await ${access}`,
        `(T)${access}`,
        `y ? ${access} : z`,
        `y ? z : ${access}`,
      ]) {
        const tree = parser.parse(`var result = ${expression};`)!;
        try {
          expect(tree.rootNode.hasError, expression).toBe(false);
          const nodes = tree.rootNode.descendantsOfType('conditional_access_expression');
          expect(
            nodes.map((node) => node.text),
            expression
          ).toEqual([access]);
          expect(nodes[0]?.childForFieldName('condition')?.text, expression).toBe('x');
          expect(
            receivers.captures(tree.rootNode).map(({ node }) => node.text),
            expression
          ).toEqual(['x']);
        } finally {
          tree.delete();
        }
      }
    }
    for (const receiver of [
      '(x || y)',
      '(x)',
      '(x.Member)',
      '(this)',
      '((x))',
      '(x[0])',
      '__makeref(tr)',
      '__refvalue(tr, string)',
      '__refvalue(tr, string[])',
      '__reftype(tr)',
      'Get()',
      'x.Member',
      'x[0]',
      'new C()',
      'new C[1]',
      'x!',
      'this',
      'base',
      'delegate { return 1; }',
      'stackalloc int[1]',
      'stackalloc[] {1}',
    ]) {
      for (const suffix of ['?.Member', '?[0]']) {
        const tree = parser.parse(`var result = ${receiver}${suffix};`)!;
        try {
          expect(tree.rootNode.hasError, receiver).toBe(false);
          const node = tree.rootNode.descendantsOfType('conditional_access_expression')[0];
          expect(node?.childForFieldName('condition')?.text, receiver).toBe(receiver);
          expect(
            receivers.captures(tree.rootNode).map(({ node }) => node.text),
            receiver
          ).toEqual([receiver]);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    receivers.delete();
    parser.delete();
  }
});

test('keeps ternary collection expressions distinct from conditional element binding', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const source of [
      'var result = c ? [1] : [2];',
      'class C { int[] M() { return x is T ? [1] : []; } }',
      'f(a ? [1] : [2]);',
      'var result = a ? b ? [c] : d : e;',
    ]) {
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(tree.rootNode.descendantsOfType('element_binding_expression'), source).toHaveLength(0);
        const conditionals = tree.rootNode.descendantsOfType('conditional_expression');
        expect(conditionals.at(-1)?.childForFieldName('consequence')?.type, source).toBe('collection_expression');
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves preprocessor-selected conditional receivers', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const suffix of ['?.Member', '?[0]']) {
      const tree = parser.parse(`class C { object M() =>
#if A
 a
#else
 b
#endif
 ${suffix}; }`)!;
      try {
        expect(tree.rootNode.hasError).toBe(false);
        const receiver = tree.rootNode
          .descendantsOfType('conditional_access_expression')[0]
          ?.childForFieldName('condition');
        expect(receiver?.type).toBe('preproc_if');
        expect(receiver?.descendantsOfType('identifier').map((node) => node.text)).toEqual(['A', 'a', 'b']);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps conditional indexing and type tests inside ternary conditions', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const access of ['items?[0]', 'items?.Value']) {
      for (const check of [
        'is Foo',
        'is Foo<int>',
        'is Foo[]',
        'is Foo?[]',
        'is string',
        'is not null',
        'is Foo value',
        '!= null',
        'as Foo',
      ]) {
        for (const separator of [' ? ', '?']) {
          const condition = `${access} ${check}`;
          const source = `var result = ${condition}${separator}[1] : [2];`;
          const tree = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, source).toBe(false);
            const ternary = tree.rootNode.descendantsOfType('conditional_expression')[0];
            expect(ternary?.childForFieldName('condition')?.text, source).toBe(condition);
            expect(ternary?.childForFieldName('consequence')?.type, source).toBe('collection_expression');
            expect(ternary?.childForFieldName('alternative')?.type, source).toBe('collection_expression');
            expect(
              tree.rootNode.descendantsOfType('conditional_access_expression').map((node) => node.text),
              source
            ).toEqual([access]);
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

test('queries index initializer targets separately from ternary collection values', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  const query = new Query(
    language,
    '(assignment_expression left: (lvalue_expression/element_binding_expression) @target right: (conditional_expression) @value)'
  );
  const tree = parser.parse('var result = new C { [key] = choose ? [1] : [2] };')!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(query.captures(tree.rootNode).map(({ name, node }) => [name, node.text])).toEqual([
      ['target', '[key]'],
      ['value', 'choose ? [1] : [2]'],
    ]);
    expect(tree.rootNode.descendantsOfType('collection_expression').map((node) => node.text)).toEqual(['[1]', '[2]']);
  } finally {
    tree.delete();
    query.delete();
    parser.delete();
  }
});

test('keeps conditional receivers inside pointer unary operands', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const prefix of ['*', '&']) {
      for (const receiver of ['x', 'x!', 'Get()', 'x.y', 'x[0]', '(x)', 'this']) {
        for (const suffix of ['?.Member', '?[0]']) {
          const source = `var result = ${prefix}${receiver}${suffix};`;
          const tree = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, source).toBe(false);
            const access = tree.rootNode.descendantsOfType('conditional_access_expression')[0];
            expect(access?.childForFieldName('condition')?.text, source).toBe(receiver);
            expect(access?.parent?.type, source).toBe('prefix_unary_expression');
          } finally {
            tree.delete();
          }
        }
      }
    }
    for (const operand of ['*x!', '&Get()']) {
      const tree = parser.parse(`var result = ${operand} ? y : z;`)!;
      try {
        expect(tree.rootNode.hasError).toBe(false);
        expect(tree.rootNode.descendantsOfType('conditional_expression')[0]?.childForFieldName('condition')?.text).toBe(
          operand
        );
      } finally {
        tree.delete();
      }
    }
    for (const receiver of ['x!', 'Get()']) {
      const tree = parser.parse(`var result = *(T*)${receiver}?.Member;`)!;
      try {
        expect(tree.rootNode.hasError).toBe(false);
        const access = tree.rootNode.descendantsOfType('conditional_access_expression')[0];
        expect(access?.childForFieldName('condition')?.text).toBe(receiver);
        expect(access?.parent?.type).toBe('cast_expression');
        expect(access?.parent?.parent?.type).toBe('prefix_unary_expression');
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves parenthesized receiver categories across unary operators and pointer casts', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  const expressions = [
    'x',
    'x!',
    'Get()',
    'x.Member',
    'x[0]',
    'this',
    'base',
    'true',
    '1',
    '"s"',
    '$"s"',
    '(x,y)',
    'checked(x)',
    'unchecked(x)',
    'default(T)',
    'default',
    'typeof(T)',
    'sizeof(T)',
    '__makeref(x)',
    '__reftype(x)',
    '__refvalue(x,T)',
    'new C()',
    'new C[1]',
    'new { X=1 }',
    'new[] {1}',
    'new()',
    '[1]',
    'delegate { return 1; }',
    'stackalloc int[1]',
    'stackalloc[] {1}',
    'x+y',
    'x?y:z',
    'x??y',
    'x is T',
    'x as T',
    '(T)x',
    '(T*)x',
    'x=y',
    'await x',
    '!x',
    '-x',
    '&x',
    '*x',
    'x switch { _ => y }',
    'x with { A=1 }',
    '()=>x',
    '()=>{}',
    'from x in xs select x',
    'throw x',
    'ref x',
  ];
  try {
    for (const expression of expressions) {
      for (const receiver of [`(${expression})`, `((${expression}))`]) {
        for (const prefix of ['', '*', '&', '-', '+', '!', '~', '^', 'await ', '++', '--', '*(T*)']) {
          for (const suffix of ['?.Member', '?[0]']) {
            const source = `var result = ${prefix}${receiver}${suffix};`;
            const tree = parser.parse(source)!;
            try {
              expect(tree.rootNode.hasError, source).toBe(false);
              const access = tree.rootNode.descendantsOfType('conditional_access_expression')[0];
              expect(access?.childForFieldName('condition')?.text, source).toBe(receiver);
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

test('retains the full expression supertype chain on restricted receivers', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  const expressionQuery = new Query(language, '(conditional_access_expression condition: (expression) @receiver)');
  const lvalueQuery = new Query(language, '(lvalue_expression) @value');
  const nonLvalueQuery = new Query(language, '(non_lvalue_expression) @value');
  const source = 'var a = x?.Member; var b = (x)?.Member; var c = Get()?.Member; var d = (x+y)?.Member;';
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const receivers = expressionQuery.captures(tree.rootNode).map(({ node }) => node);
    expect(receivers.map((node) => node.text)).toEqual(['x', '(x)', 'Get()', '(x+y)']);
    const receiverIds = new Set(receivers.map((node) => node.id));
    expect(
      lvalueQuery
        .captures(tree.rootNode)
        .filter(({ node }) => receiverIds.has(node.id))
        .map(({ node }) => node.text)
    ).toEqual(['x', '(x)']);
    expect(
      nonLvalueQuery
        .captures(tree.rootNode)
        .filter(({ node }) => receiverIds.has(node.id))
        .map(({ node }) => node.text)
    ).toEqual(['Get()', '(x+y)']);
  } finally {
    tree.delete();
    nonLvalueQuery.delete();
    lvalueQuery.delete();
    expressionQuery.delete();
    parser.delete();
  }
});
