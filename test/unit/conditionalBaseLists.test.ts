import fs from 'node:fs';

import { Language, Parser, Query, type Tree } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

import { editTree, syntaxSnapshot } from '../helpers/syntaxSnapshot';

const cases: string[] = [];
for (const [header, base] of [
  ['class C', 'B'],
  ['struct C', 'I'],
  ['interface C', 'I'],
  ['record C', 'B'],
  ['enum C', 'byte'],
]) {
  for (const symbol of ['', 'A', 'B']) {
    const define = symbol ? `#define ${symbol}\n` : '';
    cases.push(
      `${define}${header}\n#if A\n: ${base}\n#elif B\n: ${base}\n#endif\n{}\nclass Following {}`,
      `${define}${header} :\n#if A\n${base}\n#else\n${base}\n#endif\n{}\nclass Following {}`
    );
  }
}
for (const symbol of ['', 'A']) {
  cases.push(`${symbol ? `#define ${symbol}\n` : ''}class C : B\n#if A\n, I\n#endif\n{}\nclass Following {}`);
}

cases.push(
  'class C(int x)\n#if A\n: B(x)\n#else\n: D(x)\n#endif\n{}\nclass Following {}',
  'record C(int x) :\n#if A\nB(x)\n#else\nD(x)\n#endif\n{}\nclass Following {}',
  'class C<T>\n#if A\n#if B\n: Base<T>\n#else\n: Other<T>\n#endif\n#endif\nwhere T : class\n{}\nclass Following {}',
  'class C : B,\n#if A\nI\n#else\nJ\n#endif\n{}\nclass Following {}'
);

for (const kind of ['class', 'struct', 'interface', 'record']) {
  for (const defines of ['', '#define A\n', '#define B\n', '#define A\n#define B\n']) {
    for (const base of [
      ':\n#if A\nI,\n#endif\nJ',
      ':\n#if A\nI, J,\n#endif\nK',
      ':\n#if A\nB, I\n#else\nB\n#endif',
      ': B\n#if A\n, I,\n#else\n,\n#endif\nJ',
      ':\n#if A\n#if B\nI,\n#endif\n#endif\nJ',
      ':\n#if A\nI,\n#else\nJ,\n#endif\nK',
    ])
      cases.push(`${defines}${kind} C ${base}\n{}\nclass Following {}`);
  }
}

for (const kind of ['class', 'struct', 'interface', 'record', 'record struct']) {
  for (const defines of ['', '#define A\n', '#define B\n', '#define A\n#define B\n']) {
    cases.push(
      `${defines}${kind} C\n#if A\n: I\n#else\n: J\n#endif\n#if B\n, K\n#endif\n{}\nclass Following {}`,
      `${defines}${kind} C\n#if A\n: I\n#else\n: J\n#endif\n, K\n{}\nclass Following {}`,
      `${defines}${kind} C\n#if A\n: I\n#endif\n#if !A\n: J\n#endif\n{}\nclass Following {}`,
      `${defines}${kind} C :\n#if A\nI\n#elif B\nJ\n#endif\n#if !A && !B\nK\n#endif\n{}\nclass Following {}`,
      `${defines}${kind} C :\n#if A\nI\n#endif\n#if !A\nJ\n#endif\n#if B\n, K\n#endif\n{}\nclass Following {}`
    );
  }
}
for (const defines of ['', '#define A\n']) {
  cases.push(`${defines}enum C\n#if A\n: byte\n#endif\n#if !A\n: long\n#endif\n{}\nclass Following {}`);
}
for (const defines of ['', '#define A\n', '#define B\n', '#define A\n#define B\n']) {
  cases.push(
    `${defines}enum C :\n#if A\nbyte\n#elif B\nshort\n#endif\n#if !A && !B\nlong\n#endif\n{}\nclass Following {}`
  );
}

test('retains conditional base lists and declaration bodies through edits', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c_sharp.wasm');
  const parser = new Parser().setLanguage(language);
  const query = new Query(language, '(base_list) @base');
  let previous: Tree | undefined;
  let source = '';
  try {
    for (const next of [...cases, cases[0]!]) {
      if (previous) editTree(previous, source, next);
      const tree = parser.parse(next, previous)!;
      previous?.delete();
      previous = tree;
      source = next;
      const fresh = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(syntaxSnapshot(tree.rootNode), source).toEqual(syntaxSnapshot(fresh.rootNode));
        const declarations = tree.rootNode.descendantsOfType([
          'class_declaration',
          'struct_declaration',
          'interface_declaration',
          'record_declaration',
          'enum_declaration',
        ]);
        expect(
          declarations.map((node) => node.childForFieldName('name')?.text),
          source
        ).toEqual(['C', 'Following']);
        const declaration = declarations[0]!;
        const body = declaration.childForFieldName('body')!;
        expect(body.text, source).toBe('{}');
        const captures = query.captures(tree.rootNode);
        expect(captures.length).toBeGreaterThan(0);
        for (const capture of captures) {
          expect(capture.node.startIndex).toBeGreaterThan(declaration.startIndex);
          expect(capture.node.endIndex).toBeLessThanOrEqual(body.startIndex);
        }
      } finally {
        fresh.delete();
      }
    }
  } finally {
    previous?.delete();
    query.delete();
    parser.delete();
  }
});

test('highlights nested conditional base types without treating conditions as types', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c_sharp.wasm');
  const parser = new Parser().setLanguage(language);
  const query = new Query(language, fs.readFileSync('queries/highlights.scm', 'utf8'));
  const tags = new Query(language, fs.readFileSync('queries/tags.scm', 'utf8'));
  const sources = [1, 4, 16].flatMap((depth) => [
    `class C\n${nestedBase(': B', ': D', depth)}\n{}\nclass Following {}`,
    `class C :\n${nestedBase('B', 'D', depth)}\n{}\nclass Following {}`,
    `class C : E\n${nestedBase(', I', ', J', depth)}\n{}\nclass Following {}`,
    `class C :\n${nestedBase('I,', 'J,', depth)}\nK\n{}\nclass Following {}`,
    `class C : B\n${nestedBase(', I,', ',', depth)}\nJ\n{}\nclass Following {}`,
    `class C\n${nestedBase(': B', ': D', depth)}\n${nestedBase(', I', ', J', depth)}\n{}\nclass Following {}`,
    `class C\n${nestedBase(': B', ': D', depth)}\n, I\n{}\nclass Following {}`,
    `class C\n#if A\n${nestedBase(': B', ': D', depth)}\n#endif\n#if !A\n: E\n#endif\n{}\nclass Following {}`,
    `class C :\n#if A\n${nestedBase('B', 'D', depth)}\n#endif\n#if !A\nE\n#endif\n{}\nclass Following {}`,
    `class C :\n#if A\n${nestedBase('B', 'D', depth)}\n#endif\n#if !A\nE\n#endif\n${nestedBase(', I', ', J', depth)}\n{}\nclass Following {}`,
  ]);
  let previous: Tree | undefined;
  let source = '';
  try {
    for (const next of [...sources, sources[0]!]) {
      if (previous) editTree(previous, source, next);
      const tree = parser.parse(next, previous)!;
      previous?.delete();
      previous = tree;
      source = next;
      const fresh = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(syntaxSnapshot(tree.rootNode), source).toEqual(syntaxSnapshot(fresh.rootNode));
        const captures = query.captures(tree.rootNode);
        const references = tags.captures(tree.rootNode).filter((capture) => capture.name === 'reference.class');
        for (const match of source.matchAll(/\b(?:B|D|E|I|J|K)\b/g)) {
          expect(
            captures.filter(
              (capture) =>
                capture.name === 'type' &&
                capture.node.startIndex === match.index &&
                capture.node.endIndex === match.index + match[0].length
            ),
            source
          ).toHaveLength(1);
          expect(
            references.filter(
              (capture) =>
                capture.node.startIndex === match.index && capture.node.endIndex === match.index + match[0].length
            ),
            source
          ).toHaveLength(1);
        }
        expect(
          references.every((capture) => /^(?:B|D|E|I|J|K)$/.test(capture.node.text)),
          source
        ).toBe(true);
        expect(
          captures.filter((capture) => capture.name === 'type' && /^A[0-9]+$/.test(capture.node.text))
        ).toHaveLength(0);
        expect(
          tree.rootNode.descendantsOfType('class_declaration').map((node) => node.childForFieldName('name')?.text)
        ).toEqual(['C', 'Following']);
      } finally {
        fresh.delete();
      }
    }
  } finally {
    previous?.delete();
    query.delete();
    tags.delete();
    parser.delete();
  }
});

test('tags only actual base types across qualified, generic, and constructor bases', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c_sharp.wasm');
  const parser = new Parser().setLanguage(language);
  const query = new Query(language, fs.readFileSync('queries/tags.scm', 'utf8'));
  const sources = [
    ['class C(int x) : A.B<T>(x), I<T> {}', ['A.B<T>', 'I<T>']],
    ['class C() : object() {}', ['object']],
    ['record C(int x) : A.B<T>(x), I<T> {}', ['A.B<T>', 'I<T>']],
    ['interface C : A.B<T>, I<T> {}', ['A.B<T>', 'I<T>']],
    ['struct C : A.B<T>, I<T> {}', ['A.B<T>', 'I<T>']],
    ['class C :\n#if A\nA.B<T>\n#else\nI<T>\n#endif\n{}', ['A.B<T>', 'I<T>']],
    [
      'class C(int x)\n#if A\n: A.B<T>(x)\n#else\n: Other<T>(x)\n#endif\n#if X\n, I<T>\n#endif\n{}',
      ['A.B<T>', 'Other<T>', 'I<T>'],
    ],
    [
      'class C(int x) :\n#if A\nA.B<T>(x)\n#endif\n#if !A\nOther<T>(x)\n#endif\n{}\nclass Following {}',
      ['A.B<T>', 'Other<T>'],
    ],
    [
      'class C(int x) :\n#if A\nA.B<T>(x)\n#endif\n#if !A\nOther<T>(x)\n#endif\n, I<T>\n{}\nclass Following {}',
      ['A.B<T>', 'Other<T>', 'I<T>'],
    ],
  ] as const;
  try {
    for (const [source, names] of sources) {
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const matches = query
          .matches(tree.rootNode)
          .filter((match) => match.captures.some((capture) => capture.name === 'reference.class'));
        expect(
          matches.map((match) =>
            match.captures.map((capture) => [capture.name, capture.node.startIndex, capture.node.endIndex])
          ),
          source
        ).toEqual(
          names.map((name) => [
            ['name', source.indexOf(name), source.indexOf(name) + name.length],
            ['reference.class', source.indexOf(name), source.indexOf(name) + name.length],
          ])
        );
      } finally {
        tree.delete();
      }
    }
  } finally {
    query.delete();
    parser.delete();
  }
});

test('does not tag enum underlying types as class references through edits', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c_sharp.wasm');
  const parser = new Parser().setLanguage(language);
  const tags = new Query(language, fs.readFileSync('queries/tags.scm', 'utf8'));
  const sources = [
    ...['byte', 'sbyte', 'short', 'ushort', 'int', 'uint', 'long', 'ulong', 'System.Byte', 'MyByte'].map(
      (type) => `enum E : ${type} {}`
    ),
    ...[1, 4, 16].flatMap((depth) => [
      `enum E\n${nestedBase(': byte', ': long', depth)}\n{}`,
      `enum E :\n${nestedBase('byte', 'long', depth)}\n{}`,
      `enum E\n#if A\n${nestedBase(': byte', ': long', depth)}\n#endif\n#if !A\n: int\n#endif\n{}`,
      `enum E :\n#if A\n${nestedBase('byte', 'long', depth)}\n#endif\n#if !A\nint\n#endif\n{}`,
    ]),
  ];
  let previous: Tree | undefined;
  let source = '';
  try {
    for (const next of [...sources, sources[0]!]) {
      if (previous) editTree(previous, source, next);
      const tree = parser.parse(next, previous)!;
      previous?.delete();
      previous = tree;
      source = next;
      const fresh = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(syntaxSnapshot(tree.rootNode), source).toEqual(syntaxSnapshot(fresh.rootNode));
        expect(
          tags.captures(tree.rootNode).filter((capture) => capture.name.startsWith('reference.')),
          source
        ).toHaveLength(0);
      } finally {
        fresh.delete();
      }
    }
  } finally {
    previous?.delete();
    tags.delete();
    parser.delete();
  }
});

function nestedBase(content: string, alternative: string, depth: number): string {
  for (let index = 0; index < depth; index++) content = `#if A${index}\n${content}\n#else\n${alternative}\n#endif`;
  return content;
}
