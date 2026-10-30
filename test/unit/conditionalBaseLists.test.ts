import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

let language: Language;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load('tree-sitter-c_sharp.wasm');
});

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

for (const kind of ['class', 'struct', 'interface', 'record', 'record struct', 'enum']) {
  const [first, second] = kind === 'enum' ? ['byte', 'int'] : ['I', 'J'];
  for (const defines of ['', '#define A\n', '#define B\n', '#define A\n#define B\n']) {
    for (const alternative of ['#else\n', '#elif B\n', '#elif B\n#else\n']) {
      cases.push(
        `${defines}${kind} C :\n#if A\n${first}\n${alternative}#endif\n#if !A\n${second}\n#endif\n{}\nclass Following {}`
      );
    }
    for (const clauses of [
      `#if A\n#else\n${first}\n#endif\n#if A\n${second}\n#endif`,
      `#if B\n#elif A\n${first}\n#else\n#endif\n#if B || !A\n${second}\n#endif`,
      `#if A\n#elif B\n#else\n${first}\n#endif\n#if A || B\n${second}\n#endif`,
    ])
      cases.push(`${defines}${kind} C :\n${clauses}\n{}\nclass Following {}`);
  }
}

for (const kind of ['class', 'struct', 'interface', 'record', 'record struct', 'enum']) {
  const [first, second] = kind === 'enum' ? ['byte', 'int'] : ['I', 'J'];
  for (const empty of ['#if X\n#endif', '#if X\n#if Y\n#else\n#endif\n#else\n#endif']) {
    for (const clauses of [
      `${empty}\n#if A\n${first}\n#else\n${second}\n#endif`,
      `#if A\n${first}\n#endif\n${empty}\n#if !A\n${second}\n#endif`,
      `#if A\n${first}\n#else\n${second}\n#endif\n${empty}`,
    ])
      cases.push(`${kind} C :\n${clauses}\n{}\nclass Following {}`);
  }
}
for (const kind of ['class', 'struct', 'interface', 'record', 'record struct']) {
  for (const clauses of [
    '#if A\nI\n#else\nJ,\n#endif\n#if A\n,\n#endif\nK',
    '#if A\nI\n#elif B\nJ,\n#else\nK\n#endif\n#if A || !B\n,\n#endif\nL',
    '#if A\n#if B\nI\n#else\nJ,\n#endif\n#else\nK,\n#endif\n#if A && B\n,\n#endif\nL',
    'H\n#if A\n, I\n#else\n, J,\n#endif\n#if A\n,\n#endif\nK',
  ])
    cases.push(`${kind} C :\n${clauses}\n{}\nclass Following {}`);
}

for (const kind of ['class', 'struct', 'interface', 'record', 'record struct']) {
  for (const source of [
    'class C :\n#if A\nH,\n#if B\nI\n#else\nJ,\n#endif\n#else\nK\n#endif\n#if !A || B\n,\n#endif\nL\n{}\nclass Following {}',
    'class C :\nH\n#if A\n, I\n#if B\n, J\n#else\n, K,\n#endif\n#else\n, M\n#endif\n#if !A || B\n,\n#endif\nL\n{}\nclass Following {}',
    'class C :\n#if A\nI\n#if B\n, J\n#else\n, K,\n#endif\n#else\nM\n#endif\n#if !A || B\n,\n#endif\nL\n{}\nclass Following {}',
    'class C :\nH\n#if A\n,\n#if B\nI\n#else\nJ,\n#endif\n#else\n, M\n#endif\n#if !A || B\n,\n#endif\nL\n{}\nclass Following {}',
  ])
    cases.push(source.replace(/^class C/, `${kind} C`));
}

cases.push(
  'enum C :\nbyte\n#if X\n#if Y\n#endif\n#if Z\n#endif\n#endif\n{}\nclass Following {}',
  'enum C :\nbyte\n#if X\n#if Y\n#endif\n#if Z\n#endif\n#elif A\n#if Y\n#endif\n#if Z\n#endif\n#else\n#if Y\n#endif\n#if Z\n#endif\n#endif\n{}\nclass Following {}',
  'enum C :\n#if A\nbyte\n#else\n#if X\n#endif\n#endif\n#if !A\nint\n#endif\n{}\nclass Following {}',
  'enum C :\n#if A\nbyte\n#elif X\n#if Y\n#endif\n#endif\n#if !A\nint\n#endif\n{}\nclass Following {}',
  'enum C :\n#if A\n#if X\n#endif\n#else\nbyte\n#endif\n#if A\nint\n#endif\n{}\nclass Following {}',
  'enum C :\n#if A\n#if X\n#endif\n#if Y\n#endif\n#else\nbyte\n#endif\n#if A\nint\n#endif\n{}\nclass Following {}'
);

test('retains conditional base lists and declaration bodies', () => {
  const parser = new Parser().setLanguage(language);
  const query = new Query(language, '(base_list) @base');
  try {
    for (const source of cases) {
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
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
        tree.delete();
      }
    }
  } finally {
    query.delete();
    parser.delete();
  }
});

test('rejects base clauses with no physical type while retaining following declarations', () => {
  const parser = new Parser().setLanguage(language);
  const sources = ['class', 'struct', 'interface', 'record', 'record struct', 'enum'].flatMap((kind) =>
    [
      '#if A\n#else\n#endif',
      '#if A\n#elif B\n#else\n#endif',
      '#if A\n#if B\n#else\n#endif\n#else\n#endif',
      '#if A\n#endif\n#if !A\n#endif',
      '#if A\n#if X\n#endif\n#if Y\n#endif\n#else\n#endif',
      '#if A\n#if X\n#endif\n#else\n#if Y\n#endif\n#if Z\n#endif\n#endif',
    ].map((clauses) => `${kind} C :\n${clauses}\n{}\nclass Following {}`)
  );
  try {
    for (const source of sources) {
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(true);
        const following = tree.rootNode
          .descendantsOfType('class_declaration')
          .find((node) => node.childForFieldName('name')?.text === 'Following');
        expect(following?.childForFieldName('body')?.text, source).toBe('{}');
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('parses nested conditional base types and keeps following declarations', () => {
  const parser = new Parser().setLanguage(language);
  const sources = [1, 4, 16]
    .flatMap((depth) => [
      `class C\n${nestedBase(': B', ': D', depth)}\n{}\nclass Following {}`,
      `class C :\n${nestedBase('B', 'D', depth)}\n{}\nclass Following {}`,
      `class C : E\n${nestedBase(', I', ', J', depth)}\n{}\nclass Following {}`,
      `class C :\n#if X\nH,\n${nestedBase('I', 'J,', depth)}\n#else\nK\n#endif\n#if !X || (${Array.from({ length: depth }, (_, index) => `A${index}`).join(' && ')})\n,\n#endif\nL\n{}\nclass Following {}`,
      `class C : H\n#if X\n, I\n${nestedBase(', J', ', K,', depth)}\n#else\n, L\n#endif\n#if !X || (${Array.from({ length: depth }, (_, index) => `A${index}`).join(' && ')})\n,\n#endif\nB\n{}\nclass Following {}`,

      `class C :\n${nestedBase('I', 'J,', depth)}\n#if ${Array.from({ length: depth }, (_, index) => `A${index}`).join(' && ')}\n,\n#endif\nB\n{}\nclass Following {}`,
      `class C :\n${nestedBase('I,', 'J,', depth)}\nK\n{}\nclass Following {}`,
      `class C : B\n${nestedBase(', I,', ',', depth)}\nJ\n{}\nclass Following {}`,
      `class C\n${nestedBase(': B', ': D', depth)}\n${nestedBase(', I', ', J', depth)}\n{}\nclass Following {}`,
      `class C\n${nestedBase(': B', ': D', depth)}\n, I\n{}\nclass Following {}`,
      `class C :\n${nestedBase('B', '', depth)}\n#if !A0\nD\n#endif\n, I\n{}\nclass Following {}`,
      `class C :\n#if A0\nB\n#elif A1\n#else\n#endif\n#if !A0\nD\n#endif\n{}\nclass Following {}`,
      `class C :\n#if A0\n#elif A1\nB\n#else\n#endif\n#if A0 || !A1\nD\n#endif\n{}\nclass Following {}`,
      `class C\n#if A\n${nestedBase(': B', ': D', depth)}\n#endif\n#if !A\n: E\n#endif\n{}\nclass Following {}`,
      `class C :\n#if A\n${nestedBase('B', 'D', depth)}\n#endif\n#if !A\nE\n#endif\n{}\nclass Following {}`,
      `class C :\n#if A\n${nestedBase('B', 'D', depth)}\n#endif\n#if !A\nE\n#endif\n${nestedBase(', I', ', J', depth)}\n{}\nclass Following {}`,
    ])
    .flatMap((source) =>
      ['class', 'struct', 'interface', 'record', 'record struct'].map((kind) => source.replace(/^class C/, `${kind} C`))
    );
  try {
    for (const source of sources) {
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(
          tree.rootNode
            .descendantsOfType([
              'class_declaration',
              'struct_declaration',
              'interface_declaration',
              'record_declaration',
            ])
            .map((node) => node.childForFieldName('name')?.text)
        ).toEqual(['C', 'Following']);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('parses qualified, generic, and constructor bases', () => {
  const parser = new Parser().setLanguage(language);
  const sources = [
    'class C(int x) : A.B<T>(x), I<T> {}',
    'class C() : object() {}',
    'record C(int x) : A.B<T>(x), I<T> {}',
    'interface C : A.B<T>, I<T> {}',
    'struct C : A.B<T>, I<T> {}',
    'class C :\n#if A\nA.B<T>\n#else\nI<T>\n#endif\n{}',
    'class C(int x)\n#if A\n: A.B<T>(x)\n#else\n: Other<T>(x)\n#endif\n#if X\n, I<T>\n#endif\n{}',
    'class C(int x) :\n#if A\nA.B<T>(x)\n#endif\n#if !A\nOther<T>(x)\n#endif\n{}\nclass Following {}',
    'class C(int x) :\n#if A\nA.B<T>(x)\n#endif\n#if !A\nOther<T>(x)\n#endif\n, I<T>\n{}\nclass Following {}',
  ];
  try {
    for (const source of sources) {
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
});

test('parses conditional enum underlying types', () => {
  const parser = new Parser().setLanguage(language);
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
  try {
    for (const source of sources) {
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
});

function nestedBase(content: string, alternative: string, depth: number): string {
  for (let index = 0; index < depth; index++) content = `#if A${index}\n${content}\n#else\n${alternative}\n#endif`;
  return content;
}
