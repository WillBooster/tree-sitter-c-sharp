import { Language, type Node, Parser } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

import { ownershipSamples } from '../fixtures/typedConditionalOwnership';

let language: Language;

interface AllocationSample {
  source: string;
  type: string;
  rank: string;
  header: boolean;
}

interface LambdaFields {
  type: string;
  parameters: string;
  body: string;
  bodyType: string;
  attributes?: readonly string[];
}

beforeAll(async () => {
  await Parser.init();
  language = await Language.load('tree-sitter-c_sharp.wasm');
});

test('preserves typed conditional fields and ranges', { timeout: 30_000 }, () => {
  const parser = new Parser().setLanguage(language);
  const fields = ['condition', 'consequence', 'alternative'];
  try {
    for (const sample of ownershipSamples) {
      const fresh = parser.parse(sample.source)!;
      try {
        expect(fresh.rootNode.hasError, sample.source).toBe(false);
        expect(
          fresh.rootNode.descendantsOfType('conditional_expression').map((node) =>
            fields.map((field) => {
              const child = node.childForFieldName(field)!;
              return [child.startIndex, child.endIndex];
            })
          ),
          sample.source
        ).toEqual(sample.ranges);
      } finally {
        fresh.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('retains a later type-tested conditional after an ambiguous binding chain', () => {
  const parser = new Parser().setLanguage(language);
  const prefix = '/* 日本語? */ var r = a?[0] is T ? b?[0] ? [1] : y : ';
  const following = ' class Following {}';
  try {
    for (const condition of ['c', 'c is T']) {
      const tail = `${condition} ? f : g;`;
      const source = prefix + tail + following;
      const fresh = parser.parse(source)!;
      try {
        expect(fresh.rootNode.hasError, source).toBe(false);
        const alternatives = fresh.rootNode
          .descendantsOfType('conditional_expression')
          .filter((node) => node.startIndex === prefix.length);
        expect(alternatives, source).toHaveLength(1);
        const alternative = alternatives[0]!;
        expect(alternative.endIndex, source).toBe(prefix.length + tail.length - 1);
        const expected = [condition, 'f', 'g'].map((text) => {
          const start = source.indexOf(text, prefix.length);
          return [text, start, start + text.length];
        });
        expect(
          ['condition', 'consequence', 'alternative'].map((field) => {
            const node = alternative.childForFieldName(field)!;
            return [node.text, node.startIndex, node.endIndex];
          }),
          source
        ).toEqual(expected);
        const declaration = fresh.rootNode.descendantsOfType('class_declaration')[0]!;
        expect(
          [declaration.text, declaration.parent?.type, declaration.startIndex, declaration.endIndex],
          source
        ).toEqual(['class Following {}', 'compilation_unit', source.indexOf('class Following {}'), source.length]);
      } finally {
        fresh.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('retains explicit nullable ref lambda return types and their complete bodies', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const qualifier of ['ref', 'ref readonly']) {
      for (const returnType of ['T?', 'int?', 'G<A>?']) {
        const source = `var r = f(${qualifier} ${returnType} (k) => a ? [1] : c, y);`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const lambdas = tree.rootNode.descendantsOfType('lambda_expression');
          expect(lambdas, source).toHaveLength(1);
          const lambda = lambdas[0]!;
          const type = lambda.childForFieldName('type')!;
          expect(type.type, source).toBe('ref_type');
          expect(type.text, source).toBe(`${qualifier} ${returnType}`);
          const inner = type.childForFieldName('type')!;
          expect(inner.type, source).toBe('nullable_type');
          expect(inner.text, source).toBe(returnType);
          expect(lambda.childForFieldName('parameters')?.text, source).toBe('(k)');
          const body = lambda.childForFieldName('body')!;
          expect(body.type, source).toBe('conditional_expression');
          expect(
            ['condition', 'consequence', 'alternative'].map((field) => body.childForFieldName(field)?.text),
            source
          ).toEqual(['a', '[1]', 'c']);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('retains nullable creation types around parenthesized arguments', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const type of ['T?', 'int[]?', 'G<int>?', '(int, int)?']) {
      for (const argument of ['', 'f(a ? 1 : 2)', '(a ? 1 : 2)', 'a?[b ? 0 : 1]']) {
        const source = `var r = new ${type}(${argument});`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          expect(
            tree.rootNode.descendantsOfType('nullable_type').map((node) => node.text),
            source
          ).toEqual([type]);
          expect(
            tree.rootNode
              .descendantsOfType('conditional_expression')
              .map((node) => node.childForFieldName('condition')?.text),
            source
          ).toEqual(argument.includes('a ?') ? ['a'] : argument.includes('b ?') ? ['b'] : []);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('retains nullable stack allocation ranks inside conditional alternatives', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const source of [
      'var r = (flag ? (x is T) ? (a ? b : c) : d ? [1] : stackalloc int?[2] : end);',
      '$"{(flag ? (x is T) ? (a ? b : c) : d ? [1] : stackalloc int?[2] : end)}";',
    ]) {
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const allocations = tree.rootNode.descendantsOfType('stackalloc_expression');
        expect(allocations, source).toHaveLength(1);
        const type = allocations[0]!.childForFieldName('type')!;
        expect(type.type, source).toBe('array_type');
        expect(type.text, source).toBe('int?[2]');
        expect(type.childForFieldName('rank')?.text, source).toBe('[2]');
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps incomplete enclosing-rank context from changing the following class', () => {
  const parser = new Parser().setLanguage(language);
  const prefix = 'var r = f(' + 'a ? '.repeat(3) + 'g(x is T?[] ? [1] : c) ? '.repeat(3) + 'z';
  const malformed = prefix + '); class Following {}';
  const corrected = prefix + ' : 0'.repeat(6) + '); class Following {}';
  try {
    for (const source of [malformed, corrected]) {
      const fresh = parser.parse(source)!;
      try {
        expect(fresh.rootNode.hasError, source).toBe(source === malformed);
        expect(
          fresh.rootNode
            .descendantsOfType('class_declaration')
            .map((node) => [node.text, node.startIndex, node.endIndex, node.hasError]),
          source
        ).toEqual([['class Following {}', source.lastIndexOf('class Following {}'), source.length, false]]);
      } finally {
        fresh.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps invocation ownership with different arguments and enclosing conditionals', () => {
  const parser = new Parser().setLanguage(language);
  const target = 'a is T[]?[] ? [1] : c';
  const base = `var r = flag ? x is T?[,] ? f(${target}, ${target}, ${target}) : a?[0] : end; class Following {}`;
  const changed = [
    base.replace(`${target})`, 'y=>y)'),
    base.replace(': a?[0] : end', ': a : end'),
    base.replace('x is T?[,] ?', 'x ?'),
    base.replace(`${target})`, 'from y in ys orderby y, y.Q select y)'),
  ];
  try {
    for (const source of [base, ...changed]) {
      const fresh = parser.parse(source)!;
      try {
        expect(fresh.rootNode.hasError, source).toBe(false);
        expect(
          fresh.rootNode
            .descendantsOfType('class_declaration')
            .map((node) => [node.text, node.startIndex, node.endIndex]),
          source
        ).toEqual([['class Following {}', source.lastIndexOf('class Following {}'), source.length]]);
      } finally {
        fresh.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves conditional ownership with different distant alternatives', () => {
  const parser = new Parser().setLanguage(language);
  const part = 'x ? a?[0] : G<B,C> ? a : d ? [b] : ';
  const base = '/*🙂*/ var r = ' + part.repeat(67) + 'c; class Following {}';
  const middle = base.indexOf(part, '/*🙂*/ var r = '.length + 33 * part.length);
  const last = base.lastIndexOf('d ? [b] :');
  const changed = [
    base.slice(0, middle) + part.replace('d ? [b] :', 'd ? b :') + base.slice(middle + part.length),
    base.slice(0, last) + base.slice(last).replace('d ? [b] :', 'd ? b :'),
    base.replace('c; class Following', 'c : z; class Following'),
    base.replace('c; class Following', 'from q in xs select q; class Following'),
  ];
  try {
    for (const source of [base, ...changed]) {
      const fresh = parser.parse(source)!;
      try {
        expect(fresh.rootNode.hasError, source).toBe(false);
        expect(
          fresh.rootNode
            .descendantsOfType('class_declaration')
            .map((node) => [node.text, node.startIndex, node.endIndex]),
          source
        ).toEqual([['class Following {}', source.lastIndexOf('class Following {}'), source.length]]);
      } finally {
        fresh.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves complete stack allocation types and nullable lambda headers', () => {
  const parser = new Parser().setLanguage(language);
  const deepType = 'G<T?>?[]?[a?[0]]';
  const samples = [
    typedAllocationSample('int?*[a?[0]][b]', '[b]'),
    typedAllocationSample('G<T?>?[]?[a?[0]]', '[a?[0]]'),
    typedAllocationSample('G<T?[a?[0]]>[b?[0]]', '[b?[0]]'),
    typedAllocationSample('G<T[a?[0] + b?[0]]>?[z]', '[z]'),
    typedAllocationSample('G<T[a?[b?[0]]]>?[z]', '[z]'),
    {
      source: 'class C { void M() { switch (v) { case 1 when a ? stackalloc int?[2]?*[1] ? [1] : c : b: break; } } }',
      type: 'int?[2]?*[1] ? [1]',
      rank: '[1]',
      header: false,
    },
    {
      source: `var r = flag ? ${'f('.repeat(506)}f(T? (k) => f(x is A, stackalloc ${deepType}))${')'.repeat(506)} : end;`,
      type: deepType,
      rank: '[a?[0]]',
      header: true,
    },
  ];
  const following = 'class Following { int Value => 1; }';
  try {
    for (const sample of samples) {
      const source = `/* 日本語? */ ${sample.source} ${following}`;
      const fresh = parser.parse(source)!;
      try {
        expect(fresh.rootNode.hasError, source).toBe(false);
        expectAllocationFields(fresh.rootNode, source, sample.type, sample.rank, sample.header);
        const declaration = fresh.rootNode
          .descendantsOfType('class_declaration')
          .find((node) => node.text === following)!;
        expect(declaration.parent?.type, source).toBe('compilation_unit');
        expect([declaration.startIndex, declaration.endIndex], source).toEqual([
          source.lastIndexOf(following),
          source.length,
        ]);
      } finally {
        fresh.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves nested and block lambda return fields', () => {
  const parser = new Parser().setLanguage(language);
  const samples = [
    {
      source: 'var r = list.Select(Foo? (Foo x) => x.Items.Select(Bar? (Bar y) => y.Next));',
      fields: [
        {
          type: 'Foo?',
          parameters: '(Foo x)',
          body: 'x.Items.Select(Bar? (Bar y) => y.Next)',
          bodyType: 'invocation_expression',
        },
        { type: 'Bar?', parameters: '(Bar y)', body: 'y.Next', bodyType: 'member_access_expression' },
      ],
    },
    {
      source: 'var r = g(Foo? (k) => { return a?[0] is Foo? ? x : a?[0]; });',
      fields: [{ type: 'Foo?', parameters: '(k)', body: '{ return a?[0] is Foo? ? x : a?[0]; }', bodyType: 'block' }],
    },
    {
      source: 'var r = a ? b ? [1] : int? (k) => k : c;',
      fields: [{ type: 'int?', parameters: '(k)', body: 'k', bodyType: 'identifier' }],
    },
    {
      source: 'var r = c ? [A] Foo? (int k) => k : 1;',
      fields: [{ type: 'Foo?', parameters: '(int k)', body: 'k', bodyType: 'identifier', attributes: ['[A]'] }],
    },
    {
      source: 'var r = Foo? (x) => y is T[] ? a : b;',
      fields: [{ type: 'Foo?', parameters: '(x)', body: 'y is T[] ? a : b', bodyType: 'conditional_expression' }],
    },
  ];
  const following = 'class Following { int Value => 1; }';
  try {
    for (const sample of samples) {
      const source = `/* 日本語? */ ${sample.source} ${following}`;
      const fresh = parser.parse(source)!;
      try {
        expect(fresh.rootNode.hasError, source).toBe(false);
        expectLambdaFields(fresh.rootNode, source, sample.fields);
        const declaration = fresh.rootNode
          .descendantsOfType('class_declaration')
          .find((node) => node.text === following)!;
        expect(declaration.parent?.type, source).toBe('compilation_unit');
        expect(declaration.startIndex, source).toBe(source.lastIndexOf(following));
      } finally {
        fresh.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

function expectLambdaFields(root: Node, source: string, expected: readonly LambdaFields[]): void {
  const lambdas = root.descendantsOfType('lambda_expression');
  expect(lambdas, source).toHaveLength(expected.length);
  for (const [index, fields] of expected.entries()) {
    const lambda = lambdas[index]!;
    expect(lambda.childForFieldName('type')?.type, source).toBe('nullable_type');
    expect(lambda.childForFieldName('parameters')?.type, source).toBe('parameter_list');
    expect(lambda.childForFieldName('body')?.type, source).toBe(fields.bodyType);
    const attributes = lambda.namedChildren.filter((node) => node.type === 'attribute_list');
    expect(
      attributes.map((node) => node.text),
      source
    ).toEqual(fields.attributes ?? []);
    for (const attribute of attributes) {
      const start = source.indexOf(attribute.text, lambda.startIndex);
      expect([attribute.startIndex, attribute.endIndex], source).toEqual([start, start + attribute.text.length]);
    }
    const start = source.indexOf(fields.attributes?.[0] ?? fields.type, lambda.startIndex);
    const end = source.indexOf(fields.body, source.indexOf('=>', lambda.startIndex) + 2) + fields.body.length;
    expect([lambda.startIndex, lambda.endIndex], source).toEqual([start, end]);
    for (const field of ['type', 'parameters', 'body'] as const) {
      const node = lambda.childForFieldName(field)!;
      const text = fields[field];
      const afterHeader = field === 'body' ? source.indexOf('=>', lambda.startIndex) + 2 : lambda.startIndex;
      const start = source.indexOf(text, afterHeader);
      expect([node.text, node.startIndex, node.endIndex], source).toEqual([text, start, start + text.length]);
    }
  }
}

function typedAllocationSample(type: string, rank: string): AllocationSample {
  return { source: `var r = f(T? (k) => f(x is A, stackalloc ${type}));`, type, rank, header: true };
}

function expectAllocationFields(root: Node, source: string, type: string, rank: string, header: boolean): void {
  const allocations = root.descendantsOfType('stackalloc_expression');
  expect(allocations, source).toHaveLength(1);
  const allocation = allocations[0]!;
  const start = source.indexOf(`stackalloc ${type}`);
  expect([allocation.text, allocation.startIndex, allocation.endIndex], source).toEqual([
    `stackalloc ${type}`,
    start,
    start + 'stackalloc '.length + type.length,
  ]);
  const field = allocation.childForFieldName('type')!;
  expect([field.type, field.text, field.childForFieldName('rank')?.text], source).toEqual(['array_type', type, rank]);
  expect(field.childForFieldName('type')?.text, source).toBe(type.slice(0, -rank.length).trimEnd());
  const lambdas = root.descendantsOfType('lambda_expression');
  expect(lambdas, source).toHaveLength(header ? 1 : 0);
  if (header) {
    const lambda = lambdas[0]!;
    expect([lambda.childForFieldName('type')?.type, lambda.childForFieldName('type')?.text], source).toEqual([
      'nullable_type',
      'T?',
    ]);
    expect(lambda.childForFieldName('parameters')?.text, source).toBe('(k)');
    expect(lambda.childForFieldName('body')?.type, source).toBe('invocation_expression');
  }
}
