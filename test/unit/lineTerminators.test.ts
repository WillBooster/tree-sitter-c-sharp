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

test('keeps trailing directive slashes while preserving adjacent block comments', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const newline of ['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029']) {
      for (const [payload, argument, comment] of [
        ['https://example.com/', 'https://example.com/', undefined],
        ['foo/* note */', 'foo', '/* note */'],
        ['/', '/', undefined],
      ]) {
        const source = `#region ${payload}${newline}class C {}${newline}#endregion`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          expect(tree.rootNode.descendantsOfType('preproc_arg').map((n) => n.text)).toEqual([argument]);
          expect(tree.rootNode.descendantsOfType('preproc_arg')[0]?.childCount).toBe(0);
          expect(tree.rootNode.descendantsOfType('comment').map((n) => n.text)).toEqual(comment ? [comment] : []);
          expect(tree.rootNode.descendantsOfType('class_declaration').map((n) => n.text)).toEqual(['class C {}']);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('recognizes line endings while scanning modifier lambda parameters', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const newline of ['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029']) {
      for (const comment of ['', '// parameter boundary']) {
        const source = `class C { void M() { var f = (ref a,${comment}${newline}out b) => 0; } }`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          expect(tree.rootNode.descendantsOfType('lambda_expression')).toHaveLength(1);
          expect(tree.rootNode.descendantsOfType('implicit_parameter').map((n) => n.text)).toEqual(['a', 'b']);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves directive source ranges before blank LF and CRLF lines', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const newline of ['\n', '\r\n']) {
      for (const blankLines of [1, 2]) {
        for (const directive of [
          '#pragma warning disable CS1000',
          '#pragma warning disable CS1000  ',
          '#region R',
          '#region R  ',
        ]) {
          const source = directive + newline.repeat(blankLines + 1) + 'class C {}';
          const tree = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, source).toBe(false);
            expect(tree.rootNode.firstNamedChild?.text, source).toBe(
              directive + newline.repeat(newline === '\r\n' ? 1 : blankLines + 1)
            );
            expect(tree.rootNode.descendantsOfType('class_declaration').map((n) => n.text)).toEqual(['class C {}']);
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
