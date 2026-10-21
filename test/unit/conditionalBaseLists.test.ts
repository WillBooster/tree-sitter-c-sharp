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
  const sources = [1, 4, 16].flatMap((depth) => [
    `class C\n${nestedBase(': B', ': D', depth)}\n{}\nclass Following {}`,
    `class C :\n${nestedBase('B', 'D', depth)}\n{}\nclass Following {}`,
    `class C : E\n${nestedBase(', I', ', J', depth)}\n{}\nclass Following {}`,
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
        for (const match of source.matchAll(/\b(?:B|D|E|I|J)\b/g)) {
          expect(
            captures.filter(
              (capture) =>
                capture.name === 'type' &&
                capture.node.startIndex === match.index &&
                capture.node.endIndex === match.index + match[0].length
            ),
            source
          ).toHaveLength(1);
        }
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
    parser.delete();
  }
});

function nestedBase(content: string, alternative: string, depth: number): string {
  for (let index = 0; index < depth; index++) content = `#if A${index}\n${content}\n#else\n${alternative}\n#endif`;
  return content;
}
