import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('retains namespace extern aliases and their name ranges', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c_sharp.wasm');
  const parser = new Parser().setLanguage(language);
  const names = new Query(language, '(extern_alias_directive name: (identifier) @alias)');
  const cases = [
    ['namespace N { extern alias External; class C {} } class Following {}', ['External']],
    ['namespace N { namespace Inner { extern alias External; class C {} } } class Following {}', ['External']],
    [
      'namespace N { extern alias External; extern alias Other; using A = External::Thing; class C {} } class Following {}',
      ['External', 'Other'],
    ],
    [
      'namespace N {\n#if X\nextern alias External;\n#else\nextern alias Other;\n#endif\nclass C {} } class Following {}',
      ['External', 'Other'],
    ],
    ['extern alias External; namespace N { extern alias Other; class C {} } class Following {}', ['External', 'Other']],
    ['namespace N; extern alias External; class C {} class Following {}', ['External']],
    ['namespace N { extern alias @using; class C {} } class Following {}', ['@using']],
    ['namespace N { extern alias Ωther; class C {} } class Following {}', ['Ωther']],
  ] as const;
  try {
    for (const newline of ['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029']) {
      for (const [input, expected] of cases) {
        const source = input.replaceAll('\n', newline);
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const captures = names.captures(tree.rootNode);
          expect(
            captures.map((capture) => capture.node.text),
            source
          ).toEqual(expected);
          expect(
            captures.map((capture) => [capture.node.startIndex, capture.node.endIndex]),
            source
          ).toEqual(expected.map((name) => [source.indexOf(name), source.indexOf(name) + name.length]));
          expect(
            tree.rootNode
              .descendantsOfType('class_declaration')
              .map((node) => [node.childForFieldName('name')?.text, node.childForFieldName('body')?.text]),
            source
          ).toEqual([
            ['C', '{}'],
            ['Following', '{}'],
          ]);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    names.delete();
    parser.delete();
  }
});

test('preserves extern methods whose return type is named alias', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load('tree-sitter-c_sharp.wasm'));
  try {
    for (const declaration of ['extern alias M();', 'public static extern alias M();', 'extern int alias();']) {
      const source = `class alias {} class C { ${declaration} } class Following {}`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(tree.rootNode.descendantsOfType('extern_alias_directive'), source).toHaveLength(0);
        const methods = tree.rootNode.descendantsOfType('method_declaration');
        expect(methods, source).toHaveLength(1);
        expect(methods[0]!.text, source).toBe(declaration);
        expect(methods[0]!.childForFieldName('name')?.text, source).toBe(
          declaration.includes('int alias') ? 'alias' : 'M'
        );
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves declaration supertype queries for namespace members', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c_sharp.wasm');
  const parser = new Parser().setLanguage(language);
  const query = new Query(language, '(declaration_list (declaration) @member)');
  const tree = parser.parse('namespace N { using A; namespace M {} class C { class D {} } }')!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(query.captures(tree.rootNode).map((capture) => capture.node.text)).toEqual([
      'using A;',
      'namespace M {}',
      'class C { class D {} }',
      'class D {}',
    ]);
  } finally {
    tree.delete();
    query.delete();
    parser.delete();
  }
});

test('retains namespace scope around a misplaced member', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load('tree-sitter-c_sharp.wasm'));
  try {
    for (const newline of ['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029']) {
      for (const member of ['int x;', 'void M() {}']) {
        const source = ['namespace N {', 'class A {}', member, 'class B {}', '}', 'class Following {}'].join(newline);
        const tree = parser.parse(source)!;
        try {
          const namespaces = tree.rootNode.descendantsOfType('namespace_declaration');
          expect(namespaces, source).toHaveLength(1);
          expect(namespaces[0]!.childForFieldName('name')?.text, source).toBe('N');
          expect(
            namespaces[0]!.descendantsOfType('class_declaration').map((node) => node.childForFieldName('name')?.text),
            source
          ).toEqual(['A', 'B']);
          expect(
            tree.rootNode.namedChildren
              .filter((node) => node.type === 'class_declaration')
              .map((node) => node.childForFieldName('name')?.text),
            source
          ).toEqual(['Following']);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});
