import path from 'node:path';
import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

await Parser.init();
const language = await Language.load(path.join(import.meta.dirname, '../../tree-sitter-c_sharp.wasm'));

test('ends comments and shebang lines before every C# line terminator', () => {
  const parser = new Parser().setLanguage(language);
  const query = new Query(
    language,
    '(class_declaration name: (identifier) @class) (method_declaration name: (identifier) @method)'
  );
  try {
    for (const newline of ['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029']) {
      for (const prefix of ['// header', '/// documentation', '#!/usr/bin/env dotnet']) {
        const source = `${prefix}${newline}class C {${newline}// member${newline}void M() {}${newline}}`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, JSON.stringify(source)).toBe(false);
          expect(tree.rootNode.firstNamedChild?.text).toBe(prefix);
          expect(tree.rootNode.firstNamedChild?.endIndex).toBe(prefix.length);
          expect(query.captures(tree.rootNode).map((c) => [c.name, c.node.text])).toEqual([
            ['class', 'C'],
            ['method', 'M'],
          ]);
          expect(tree.rootNode.descendantsOfType('comment').map((n) => n.text)).toContain('// member');
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    query.delete();
    parser.delete();
  }
});

test('retains declarations after preprocessor lines in every newline encoding', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const newline of ['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029']) {
      const source = [
        '#if X',
        'class A {}',
        '#elif Y',
        'class B {}',
        '#else',
        'class C {}',
        '#endif',
        '#region R',
        'class D {}',
        '#endregion',
        '',
      ].join(newline);
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, JSON.stringify(source)).toBe(false);
        expect(
          tree.rootNode.descendantsOfType('class_declaration').map((n) => n.childForFieldName('name')?.text)
        ).toEqual(['A', 'B', 'C', 'D']);
        expect(tree.rootNode.descendantsOfType('preproc_arg').map((n) => n.text)).toEqual(['R']);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});
